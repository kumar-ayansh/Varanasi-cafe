const express = require('express');
const crypto = require('crypto');
const Razorpay = require('razorpay');
const router = express.Router();
const db = require('../db');
const menuStore = require('../menu-store');
const settings = require('../settings');
const { createOrderFromPayment, createUpiOrder, findOrderByPaymentId, findVerifiedPaymentByPaymentId } = require('../orderService');

// Shared by /create-order (Razorpay) and /upi-order (direct UPI): reads the
// menu fresh, validates the cart against it, and locks prices in integer
// paise. Never trust a price/total from the browser — this is the only
// place either payment path is allowed to compute one.
function priceCart(items) {
  if (!Array.isArray(items) || items.length === 0 || items.length > 50) {
    return { error: 'Cart is empty or has too many items.' };
  }

  const allItems = menuStore.getActiveItemsFlat();
  let subtotalPaise = 0;
  const lineItems = [];
  for (const line of items) {
    if (!line || typeof line.id !== 'string') {
      return { error: 'Invalid item in cart.' };
    }
    const found = allItems.find((i) => i.id === line.id);
    if (!found) {
      return { error: `Unknown item: ${line.id}` };
    }
    if (found.available === false) {
      return { error: `${found.name} is currently out of stock.` };
    }
    const qty = Math.max(1, Math.min(50, Number(line.qty) || 1));
    const unitPricePaise = Math.round(found.price * 100);
    const lineTotalPaise = unitPricePaise * qty;
    subtotalPaise += lineTotalPaise;
    lineItems.push({ id: found.id, name: found.name, qty, unitPricePaise, lineTotalPaise });
  }

  const taxPaise = 0;
  const discountPaise = 0;
  const totalPaise = subtotalPaise + taxPaise - discountPaise;
  if (totalPaise <= 0) {
    return { error: 'Order total must be greater than zero.' };
  }

  return { lineItems, subtotalPaise, taxPaise, discountPaise, totalPaise };
}

function getRazorpayInstance() {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    return null;
  }
  return new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
  });
}

// STEP 1 — Frontend calls this first to create a Razorpay order.
// Prices are read from the current menu and LOCKED into the payment record
// right here, in integer paise. Nothing downstream (verify, webhook, order
// creation, admin reports) ever recalculates them from the menu again —
// if the admin changes a price later, customers who already paid keep the
// price they paid.
router.post('/create-order', async (req, res) => {
  try {
    const razorpay = getRazorpayInstance();
    if (!razorpay) {
      return res.status(500).json({
        error: 'Razorpay is not configured. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to your .env file.'
      });
    }

    const { items, customerName, phone, orderType, notes } = req.body; // items: [{ id, qty }]

    // Read the menu fresh on every request — items, prices, and
    // availability are now admin-editable at runtime (see menu-store.js),
    // so this must never be a snapshot taken once at server startup.
    const priced = priceCart(items);
    if (priced.error) return res.status(400).json({ error: priced.error });
    const { lineItems, subtotalPaise, taxPaise, discountPaise, totalPaise } = priced;

    const razorpayOrder = await razorpay.orders.create({
      amount: totalPaise,
      currency: 'INR',
      receipt: `order_rcpt_${Date.now()}`,
      payment_capture: 1 // auto-capture — otherwise a payment can sit "authorized" and never settle
    });

    // Stash the locked cart + customer details against the Razorpay order
    // ID. If the customer's connection drops right after paying and the
    // browser never calls back, the webhook uses this record to create the
    // restaurant order anyway — nothing gets lost, and nothing is trusted
    // from the browser at that point either.
    const paymentRecord = {
      id: razorpayOrder.id,
      lineItems,
      subtotal: subtotalPaise / 100,
      tax: taxPaise / 100,
      discount: discountPaise / 100,
      total: totalPaise / 100,
      totalPaise,
      currency: 'INR',
      customerName: customerName ? String(customerName).trim().slice(0, 100) : '',
      phone: phone ? String(phone).trim().slice(0, 20) : '',
      orderType: orderType === 'dine-in' ? 'dine-in' : 'pickup',
      notes: notes ? String(notes).trim().slice(0, 300) : '',
      status: 'created', // created -> verified
      razorpayPaymentId: null,
      verifiedAt: null,
      restaurantOrderId: null,
      createdAt: new Date().toISOString()
    };
    await db.insert('payments', paymentRecord);

    res.json({ order: razorpayOrder, keyId: process.env.RAZORPAY_KEY_ID });
  } catch (err) {
    console.error('create-order error:', err);
    res.status(500).json({ error: 'Could not create payment order.' });
  }
});

// Direct UPI payment — an ALTERNATIVE to Razorpay, never a replacement.
// There is no gateway call here: the order is created immediately using
// the same server-side price-locking as /create-order, but with
// paymentStatus 'pending_verification' — never 'paid'. The admin verifies
// manually (see routes/orders.js PATCH /:id/verify-upi) once they've
// actually received the payment. The frontend uses order.total (returned
// here, never anything it sent itself) to build the UPI deep link amount.
router.post('/upi-order', async (req, res) => {
  try {
    const upi = settings.getUpiSettings();
    if (!upi.enabled || !upi.upiId) {
      return res.status(400).json({ error: 'UPI payment is not currently available.' });
    }

    const { items, customerName, phone, orderType, notes } = req.body;
    const priced = priceCart(items);
    if (priced.error) return res.status(400).json({ error: priced.error });

    const order = await createUpiOrder({
      ...priced,
      customerName,
      phone,
      orderType,
      notes
    });

    res.status(201).json({
      order,
      upi: { upiId: upi.upiId, businessName: upi.businessName || 'The Varanasi Story', qrImage: upi.qrImage }
    });
  } catch (err) {
    console.error('upi-order error:', err);
    res.status(500).json({ error: 'Could not create order.' });
  }
});

// Cross-checks a Razorpay payment entity (fetched fresh from Razorpay's API,
// never trusted from the browser) against our own locked payment record.
// Returns null if everything matches, or a string reason if it doesn't.
function reconcile(paymentEntity, paymentRecord, expectedOrderId) {
  if (paymentEntity.order_id !== expectedOrderId) return 'Payment does not belong to this order.';
  if (paymentEntity.currency !== 'INR') return 'Unexpected currency.';
  if (paymentEntity.amount !== paymentRecord.totalPaise) return 'Amount does not match the locked order total.';
  if (!['captured', 'authorized'].includes(paymentEntity.status)) return `Payment not captured (status: ${paymentEntity.status}).`;
  return null;
}

// STEP 2 — After Razorpay checkout completes, the frontend sends back the
// payment IDs + signature. We: (a) verify the HMAC signature, (b) load our
// own locked payment record, (c) fetch the payment from Razorpay's API
// directly (not from the browser) and cross-check order/amount/currency/
// status against the locked record, and only then create the restaurant
// order — using the locked prices, never anything from the request body.
router.post('/verify', async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ verified: false, error: 'Missing payment verification fields.' });
    }

    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || '')
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    const sigBuf = Buffer.from(razorpay_signature, 'utf-8');
    const expBuf = Buffer.from(expectedSignature, 'utf-8');
    const sigOk = sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf);
    if (!sigOk) {
      return res.status(400).json({ verified: false, error: 'Signature mismatch — payment could not be verified.' });
    }

    // Idempotent short-circuit: if this exact payment already produced an
    // order (e.g. the webhook beat us to it, or the browser retried),
    // don't re-verify against Razorpay again — just hand back the result.
    const existingOrder = await findOrderByPaymentId(razorpay_payment_id);
    if (existingOrder) {
      return res.json({ verified: true, order: existingOrder });
    }

    const payments = await db.all('payments');
    const paymentRecord = payments.find((p) => p.id === razorpay_order_id);
    if (!paymentRecord) {
      return res.status(404).json({ verified: false, error: 'No matching payment order found.' });
    }

    const razorpay = getRazorpayInstance();
    if (!razorpay) {
      return res.status(500).json({ verified: false, error: 'Razorpay is not configured.' });
    }

    let paymentEntity;
    try {
      paymentEntity = await razorpay.payments.fetch(razorpay_payment_id);
    } catch (fetchErr) {
      console.error('Could not fetch payment from Razorpay:', fetchErr.message);
      return res.status(502).json({ verified: false, error: 'Could not confirm payment with Razorpay. Please try again.' });
    }

    const mismatch = reconcile(paymentEntity, paymentRecord, razorpay_order_id);
    if (mismatch) {
      console.error(`Payment reconciliation failed for ${razorpay_payment_id}: ${mismatch}`);
      return res.status(409).json({ verified: false, error: 'Payment could not be verified. Please contact us with your payment ID.' });
    }

    const verifiedRecord = await db.updateById('payments', paymentRecord.id, {
      status: 'verified',
      razorpayPaymentId: razorpay_payment_id,
      verifiedAt: new Date().toISOString()
    });

    const { order } = await createOrderFromPayment(verifiedRecord, razorpay_payment_id);
    res.json({ verified: true, order });
  } catch (err) {
    console.error('verify error:', err);
    res.status(500).json({ verified: false, error: 'Verification failed.' });
  }
});

// STEP 3 (recovery path) — Razorpay calls this directly whenever a payment
// event happens, independent of whether the customer's browser is still
// connected. Same reconciliation as /verify: fetch nothing from the
// browser, cross-check the webhook's own payload against our locked
// payment record, and only create an order if everything matches.
//
// Configure in the Razorpay dashboard: Settings → Webhooks →
//   URL: https://yourdomain.com/api/payment/webhook
//   Active events: payment.captured
//   Secret: set the same value as RAZORPAY_WEBHOOK_SECRET in .env
router.post('/webhook', async (req, res) => {
  try {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!secret) {
      console.error('Webhook received but RAZORPAY_WEBHOOK_SECRET is not set — ignoring.');
      return res.status(500).json({ error: 'Webhook not configured.' });
    }

    const signature = req.header('x-razorpay-signature');
    if (!signature || !req.rawBody) {
      return res.status(400).json({ error: 'Missing signature.' });
    }

    const expected = crypto.createHmac('sha256', secret).update(req.rawBody).digest('hex');
    const sigBuf = Buffer.from(signature, 'hex');
    const expBuf = Buffer.from(expected, 'hex');
    const isValid = sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf);

    if (!isValid) {
      return res.status(400).json({ error: 'Invalid webhook signature.' });
    }

    // Signature is valid — now actually process the event before
    // responding. Razorpay retries on non-2xx/timeout, so a 200 is only
    // sent once we've done everything we're going to do with this
    // delivery; any failure below falls through to the catch block, which
    // returns a non-2xx so Razorpay retries.
    const event = req.body;
    if (event.event !== 'payment.captured') {
      // Nothing for us to do with this event type — ack so it isn't retried.
      return res.status(200).json({ received: true });
    }

    const paymentEntity = event.payload && event.payload.payment && event.payload.payment.entity;
    if (!paymentEntity) {
      console.error('Webhook: payment.captured event missing payment entity.');
      return res.status(200).json({ received: true });
    }

    const razorpayOrderId = paymentEntity.order_id;
    const razorpayPaymentId = paymentEntity.id;

    // Duplicate webhook delivery is harmless: either an order already
    // exists for this payment id, or it doesn't and we create exactly one.
    const already = await findOrderByPaymentId(razorpayPaymentId);
    if (already) {
      return res.status(200).json({ received: true, duplicate: true });
    }

    const payments = await db.all('payments');
    const paymentRecord = payments.find((p) => p.id === razorpayOrderId);
    if (!paymentRecord) {
      // No internal record for this order — never create an order from a
      // webhook payload alone. Could be a stale/foreign event; retrying
      // won't make the record appear, so log it and ack rather than have
      // Razorpay retry this forever.
      console.error(`Webhook: no payment record found for Razorpay order ${razorpayOrderId}`);
      return res.status(200).json({ received: true });
    }

    const mismatch = reconcile(paymentEntity, paymentRecord, razorpayOrderId);
    if (mismatch) {
      // A data-integrity mismatch, not a transient failure — retrying
      // won't fix it either. Log for investigation and ack.
      console.error(`Webhook reconciliation failed for ${razorpayPaymentId}: ${mismatch}`);
      return res.status(200).json({ received: true });
    }

    const verifiedRecord = paymentRecord.status === 'verified'
      ? paymentRecord
      : await db.updateById('payments', paymentRecord.id, {
          status: 'verified',
          razorpayPaymentId,
          verifiedAt: new Date().toISOString()
        });

    await createOrderFromPayment(verifiedRecord, razorpayPaymentId);

    // Only acknowledge success once the payment/order records have
    // actually been created or updated.
    return res.status(200).json({ received: true });
  } catch (err) {
    // Processing failed (e.g. a db write threw) — do NOT acknowledge.
    // Non-2xx tells Razorpay to retry this delivery later.
    console.error('webhook processing error:', err);
    return res.status(500).json({ error: 'Webhook processing failed.' });
  }
});

// Customer-facing Direct UPI status check — used by the frontend's "I Have
// Completed Payment" waiting screen and its page-refresh resume logic.
// Deliberately NOT behind auth.requireAdmin (see server/index.js — the
// whole /api/payment router is public, same as /create-order and
// /upi-order), because the customer browser has no admin token. It is,
// however, intentionally minimal: only the three fields the UI needs to
// decide what to show, never the customer's name/phone/notes or anything
// else from the full order record.
router.get('/order-status/:id', async (req, res) => {
  try {
    const orders = await db.all('orders');
    const order = orders.find((o) => o.id === req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found.' });
    if (order.paymentMethod !== 'upi') {
      return res.status(400).json({ error: 'This endpoint only supports Direct UPI orders.' });
    }
    res.json({
      orderId: order.id,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus
    });
  } catch (err) {
    console.error('order-status error:', err);
    res.status(500).json({ error: 'Could not fetch order status.' });
  }
});

module.exports = router;
