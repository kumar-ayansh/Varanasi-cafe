const express = require('express');
const router = express.Router();
const asyncHandler = require('../asyncHandler');
const db = require('../db');
const { findOrderByPaymentId, findVerifiedPaymentByPaymentId, createOrderFromPayment } = require('../orderService');

const ORDER_STATUSES = ['received', 'confirmed', 'preparing', 'ready', 'completed', 'cancelled'];

// This endpoint used to accept customerName/phone/items/total straight from
// the browser. It no longer does. The only thing it trusts from the client
// is "which payment am I asking about" (paymentId) — everything else
// (customer details, cart, prices) comes from our own server-side payment
// record, which was locked and verified in routes/payment.js. This is what
// makes it impossible for a request here to fabricate a paid order.
//
// In practice /api/payment/verify already creates the order the moment a
// payment is confirmed, so this mostly just returns that same order
// idempotently — it exists as a safety-net confirmation call for the
// frontend and a fallback if the browser wants to re-fetch by paymentId.
router.post('/', asyncHandler(async (req, res) => {
  const { paymentId } = req.body;
  if (!paymentId || typeof paymentId !== 'string') {
    return res.status(400).json({ error: 'A payment ID is required.' });
  }

  const existing = await findOrderByPaymentId(paymentId);
  if (existing) return res.status(200).json({ order: existing });

  const verifiedPayment = await findVerifiedPaymentByPaymentId(paymentId);
  if (!verifiedPayment) {
    return res.status(409).json({ error: 'Payment not verified.' });
  }

  const { order } = await createOrderFromPayment(verifiedPayment, paymentId);
  res.status(201).json({ order });
}));

// GET /api/orders?q=&status=&today=true&pending=true&from=YYYY-MM-DD&to=YYYY-MM-DD
router.get('/', asyncHandler(async (req, res) => {
  let orders = await db.all('orders');
  const { q, status, today, pending, from, to } = req.query;

  if (q) {
    const needle = q.toLowerCase();
    orders = orders.filter(
      (o) => o.customerName.toLowerCase().includes(needle) || o.phone.includes(needle)
    );
  }
  if (status) orders = orders.filter((o) => o.status === status);
  if (today === 'true') {
    const todayStr = new Date().toISOString().slice(0, 10);
    orders = orders.filter((o) => o.createdAt.slice(0, 10) === todayStr);
  }
  if (pending === 'true') orders = orders.filter((o) => !['completed', 'cancelled'].includes(o.status));
  if (from) orders = orders.filter((o) => o.createdAt.slice(0, 10) >= from);
  if (to) orders = orders.filter((o) => o.createdAt.slice(0, 10) <= to);

  res.json({ orders });
}));

// GET /api/orders/report?period=daily|weekly|monthly — sales totals grouped by day
router.get('/report', asyncHandler(async (req, res) => {
  const period = req.query.period || 'daily';
  const days = period === 'monthly' ? 30 : period === 'weekly' ? 7 : 1;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days + 1);
  cutoff.setHours(0, 0, 0, 0);

  const orders = (await db.all('orders')).filter(
    (o) => o.status !== 'cancelled' && new Date(o.createdAt) >= cutoff
  );

  // Summed in paise, then converted to rupees once at the end — keeps
  // multi-order sums from drifting the way repeated float addition can.
  const byDay = {};
  orders.forEach((o) => {
    const day = o.createdAt.slice(0, 10);
    byDay[day] = byDay[day] || { date: day, orders: 0, salesPaise: 0 };
    byDay[day].orders += 1;
    byDay[day].salesPaise += o.totalPaise != null ? o.totalPaise : Math.round(o.total * 100);
  });

  const rows = Object.values(byDay)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((r) => ({ date: r.date, orders: r.orders, sales: r.salesPaise / 100 }));
  const totalSalesPaise = Object.values(byDay).reduce((s, r) => s + r.salesPaise, 0);
  const totalOrders = rows.reduce((s, r) => s + r.orders, 0);

  res.json({ period, rows, totalSales: totalSalesPaise / 100, totalOrders });
}));

// GET /api/orders/top-items?period=daily|weekly|monthly — best-selling items by quantity
router.get('/top-items', asyncHandler(async (req, res) => {
  const period = req.query.period || 'weekly';
  const days = period === 'monthly' ? 30 : period === 'weekly' ? 7 : 1;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days + 1);
  cutoff.setHours(0, 0, 0, 0);

  const orders = (await db.all('orders')).filter(
    (o) => o.status !== 'cancelled' && new Date(o.createdAt) >= cutoff
  );

  const byItem = {};
  orders.forEach((o) => {
    o.items.forEach((line) => {
      const unitPaise = line.unitPricePaise != null ? line.unitPricePaise : Math.round((line.price || 0) * 100);
      byItem[line.id] = byItem[line.id] || { id: line.id, name: line.name, qty: 0, revenuePaise: 0 };
      byItem[line.id].qty += line.qty;
      byItem[line.id].revenuePaise += unitPaise * line.qty;
    });
  });

  const top = Object.values(byItem)
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 5)
    .map((i) => ({ id: i.id, name: i.name, qty: i.qty, revenue: i.revenuePaise / 100 }));
  res.json({ period, items: top });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const order = (await db.all('orders')).find((o) => o.id === req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found.' });
  res.json({ order });
}));

// Admin-only: manually confirms a direct-UPI order once the owner has
// actually checked their bank/UPI app and seen the payment land. A
// customer clicking "I Have Completed Payment" on the frontend never does
// this on its own — see routes/payment.js POST /upi-order and
// orderService.createUpiOrder for why.
router.patch('/:id/verify-upi', asyncHandler(async (req, res) => {
  const orders = await db.all('orders');
  const order = orders.find((o) => o.id === req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found.' });
  if (order.paymentMethod !== 'upi') {
    return res.status(400).json({ error: 'This order was not paid via direct UPI.' });
  }
  // Atomic compare-and-swap: the row only actually transitions if its
  // paymentStatus is still pending_verification at the moment of the
  // write (see db-json.js / db-pg.js updateByIdIfFieldEquals). If a
  // second verify/reject request for the same order lands at nearly the
  // same instant, only one of them can win — the other gets null here
  // instead of both silently succeeding and corrupting the state.
  const updated = await db.updateByIdIfFieldEquals('orders', req.params.id, 'paymentStatus', 'pending_verification', {
    paymentStatus: 'paid',
    paymentTime: new Date().toISOString()
  });
  if (!updated) {
    const current = (await db.all('orders')).find((o) => o.id === req.params.id);
    return res.status(409).json({
      error: `Cannot verify an order with status "${current ? current.paymentStatus : order.paymentStatus}". Only orders pending verification can be verified.`
    });
  }
  res.json({ order: updated });
}));

// Admin-only: rejects a direct-UPI order when the owner checks their
// bank/UPI app and does NOT find the claimed payment. Mirrors verify-upi
// exactly — same guard, same "only a real UPI order" check — just sets
// paymentStatus to 'rejected' instead of 'paid'. The customer's frontend
// picks this up via the same GET /:id it already polls for verify-upi.
router.patch('/:id/reject-upi', asyncHandler(async (req, res) => {
  const orders = await db.all('orders');
  const order = orders.find((o) => o.id === req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found.' });
  if (order.paymentMethod !== 'upi') {
    return res.status(400).json({ error: 'This order was not paid via direct UPI.' });
  }
  // Same atomic compare-and-swap as verify-upi above.
  const updated = await db.updateByIdIfFieldEquals('orders', req.params.id, 'paymentStatus', 'pending_verification', {
    paymentStatus: 'rejected'
  });
  if (!updated) {
    const current = (await db.all('orders')).find((o) => o.id === req.params.id);
    return res.status(409).json({
      error: `Cannot reject an order with status "${current ? current.paymentStatus : order.paymentStatus}". Only orders pending verification can be rejected.`
    });
  }
  res.json({ order: updated });
}));

router.patch('/:id/status', asyncHandler(async (req, res) => {
  const { status } = req.body;
  if (!ORDER_STATUSES.includes(status)) {
    return res.status(400).json({ error: `Status must be one of: ${ORDER_STATUSES.join(', ')}` });
  }
  const updated = await db.updateById('orders', req.params.id, { status });
  if (!updated) return res.status(404).json({ error: 'Order not found.' });
  res.json({ order: updated });
}));

module.exports = router;
