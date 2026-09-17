// Shared order-creation logic. Both the payment-verification endpoint and
// the Razorpay webhook (the recovery path if the client never calls back —
// closed tab, dropped connection, crashed app) end up here. Whichever one
// runs first wins; the other is a safe no-op.
//
// CRITICAL: this never recalculates prices from the current menu. Prices
// are locked into the payment record at /api/payment/create-order time
// (see routes/payment.js). If the admin changes a price after a customer
// has already paid, that customer's order must keep the price they paid —
// so we always use paymentRecord.lineItems / paymentRecord.total as-is.

const crypto = require('crypto');
const db = require('./db');
const whatsapp = require('./whatsapp');

// Order IDs used to be `ORD-${Date.now()}-${Math.random().toString(36)...}`,
// which is guessable (Math.random() is not a CSPRNG, and Date.now() is
// public information). The Date.now() prefix is kept only for readability/
// rough chronological sorting in the admin dashboard — the part that
// actually needs to be unguessable is the suffix, which now comes from
// Node's crypto module. Format otherwise unchanged, so existing orders in
// the database and any frontend code that just treats this as an opaque
// string ID are unaffected.
function generateOrderId() {
  return `ORD-${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
}

async function findOrderByPaymentId(paymentId) {
  const orders = await db.all('orders');
  return orders.find((o) => o.paymentId === paymentId) || null;
}

// Finds a payment record that has been through server-side verification
// (see /api/payment/verify) and is tied to the given Razorpay payment ID.
// Used by POST /api/orders so it never has to trust anything from the
// browser except "which payment am I asking about".
async function findVerifiedPaymentByPaymentId(paymentId) {
  const payments = await db.all('payments');
  return payments.find((p) => p.razorpayPaymentId === paymentId && p.status === 'verified') || null;
}

// Builds and inserts the restaurant order from a payment record plus the
// verified Razorpay payment ID. Safe to call twice with the same
// paymentId: the second call returns the existing order instead of
// inserting a duplicate.
async function createOrderFromPayment(paymentRecord, razorpayPaymentId) {
  const existing = await findOrderByPaymentId(razorpayPaymentId);
  if (existing) return { order: existing, created: false };

  const now = new Date().toISOString();
  const order = {
    id: generateOrderId(),
    customerName: String(paymentRecord.customerName || 'Customer').trim().slice(0, 100),
    phone: String(paymentRecord.phone || '').trim().slice(0, 20),
    orderType: paymentRecord.orderType === 'dine-in' ? 'dine-in' : 'pickup',
    // Locked at payment time — NOT recomputed from the current menu.
    // `price` (rupees) is kept alongside `unitPricePaise`/`lineTotalPaise`
    // for backward compatibility with the admin dashboard's display code.
    items: paymentRecord.lineItems.map((li) => ({
      ...li,
      price: li.unitPricePaise / 100
    })),
    subtotal: paymentRecord.subtotal,
    tax: paymentRecord.tax,
    discount: paymentRecord.discount,
    total: paymentRecord.total, // rupees, derived once from totalPaise for display/reporting
    totalPaise: paymentRecord.totalPaise,
    currency: paymentRecord.currency,
    paymentId: razorpayPaymentId,
    razorpayOrderId: paymentRecord.id,
    paymentStatus: 'paid',
    paymentTime: now,
    notes: String(paymentRecord.notes || '').trim().slice(0, 300),
    status: 'received',
    createdAt: now
  };

  try {
    await db.insert('orders', order);
  } catch (err) {
    // Postgres has a unique index on orders.data->>'paymentId' (see
    // db-pg.js). If two requests raced past the in-memory check above —
    // e.g. the webhook and the client's own call landing at almost the
    // same instant across multiple server instances — the database itself
    // is the final backstop against a duplicate row. A 23505 here just
    // means the other one won; fetch and return what it created.
    if (err && err.code === '23505') {
      const winner = await findOrderByPaymentId(razorpayPaymentId);
      if (winner) return { order: winner, created: false };
    }
    throw err;
  }

  await db.updateById('payments', paymentRecord.id, { restaurantOrderId: order.id });
  whatsapp.notifyNewOrder(order); // fire-and-forget, no-ops if Twilio isn't configured
  return { order, created: true };
}

// Direct-UPI order path (see routes/payment.js POST /upi-order). Unlike the
// Razorpay flow, there's no gateway to confirm the payment with — so this
// order is created immediately with paymentStatus 'pending_verification'
// and NEVER 'paid'. Only an admin, using the existing operational process,
// can mark it verified (see routes/orders.js PATCH /:id/verify-upi). A
// customer clicking "I Have Completed Payment" on the frontend does not,
// by itself, prove anything.
async function createUpiOrder({ lineItems, subtotalPaise, taxPaise, discountPaise, totalPaise, customerName, phone, orderType, notes }) {
  const now = new Date().toISOString();
  const order = {
    id: generateOrderId(),
    customerName: String(customerName || 'Customer').trim().slice(0, 100),
    phone: String(phone || '').trim().slice(0, 20),
    orderType: orderType === 'dine-in' ? 'dine-in' : 'pickup',
    items: lineItems.map((li) => ({ ...li, price: li.unitPricePaise / 100 })),
    subtotal: subtotalPaise / 100,
    tax: taxPaise / 100,
    discount: discountPaise / 100,
    total: totalPaise / 100,
    totalPaise,
    currency: 'INR',
    paymentMethod: 'upi',
    paymentId: null,
    razorpayOrderId: null,
    paymentStatus: 'pending_verification',
    paymentTime: null,
    notes: String(notes || '').trim().slice(0, 300),
    status: 'received',
    createdAt: now
  };

  await db.insert('orders', order);
  whatsapp.notifyNewOrder(order); // fire-and-forget, no-ops if Twilio isn't configured
  return order;
}

module.exports = { createOrderFromPayment, createUpiOrder, findOrderByPaymentId, findVerifiedPaymentByPaymentId };
