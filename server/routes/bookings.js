const express = require('express');
const router = express.Router();
const asyncHandler = require('../asyncHandler');
const db = require('../db');
const whatsapp = require('../whatsapp');
const { validateBookingInput } = require('../validate');

const BOOKING_STATUSES = ['pending', 'confirmed', 'seated', 'completed', 'cancelled'];

// How many tables the cafe has — used to prevent double-booking a slot.
// Set TOTAL_TABLES in .env if this changes.
const TOTAL_TABLES = Number(process.env.TOTAL_TABLES) || 8;

async function countActiveBookings(date, time) {
  const bookings = await db.all('bookings');
  return bookings.filter((b) => b.date === date && b.time === time && b.status !== 'cancelled').length;
}

router.post('/', asyncHandler(async (req, res) => {
  const { customerName, phone, date, time, guests, notes } = req.body;

  const error = validateBookingInput({ customerName, phone, date, time, guests });
  if (error) return res.status(400).json({ error });

  const booking = {
    id: `BKG-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    customerName: String(customerName).trim().slice(0, 100),
    phone: String(phone).trim().slice(0, 20),
    date,
    time,
    guests: Number(guests),
    notes: String(notes || '').trim().slice(0, 300),
    status: 'pending',
    createdAt: new Date().toISOString()
  };

  // Capacity check + insert happen atomically inside the DB layer (a
  // per-process mutex for the JSON backend, an advisory-lock transaction
  // for Postgres) so two simultaneous requests for the same slot can't
  // both slip past the check before either has been written. See
  // insertBookingIfCapacity in db-json.js / db-pg.js.
  const inserted = await db.insertBookingIfCapacity(booking, TOTAL_TABLES);
  if (!inserted) {
    return res.status(409).json({
      error: `Sorry, ${time} on ${date} is fully booked. Please pick a different time or call us directly.`
    });
  }

  whatsapp.notifyNewBooking(inserted); // fire-and-forget, no-ops if Twilio isn't configured
  res.status(201).json({ booking: inserted });
}));

// GET /api/bookings/availability?date=YYYY-MM-DD&time=HH:MM — public, no sensitive data.
// Lets the booking form (or admin) show live table availability for a slot.
// (Informational only — the authoritative check happens atomically above.)
router.get('/availability', asyncHandler(async (req, res) => {
  const { date, time } = req.query;
  if (!date || !time) return res.status(400).json({ error: 'date and time are required.' });
  const booked = await countActiveBookings(date, time);
  res.json({ date, time, totalTables: TOTAL_TABLES, booked, available: Math.max(0, TOTAL_TABLES - booked) });
}));

// GET /api/bookings?q=&status=&today=true&from=YYYY-MM-DD&to=YYYY-MM-DD
router.get('/', asyncHandler(async (req, res) => {
  let bookings = await db.all('bookings');
  const { q, status, today, from, to } = req.query;

  if (q) {
    const needle = q.toLowerCase();
    bookings = bookings.filter(
      (b) => b.customerName.toLowerCase().includes(needle) || b.phone.includes(needle)
    );
  }
  if (status) bookings = bookings.filter((b) => b.status === status);
  if (today === 'true') {
    const todayStr = new Date().toISOString().slice(0, 10);
    bookings = bookings.filter((b) => b.date === todayStr);
  }
  if (from) bookings = bookings.filter((b) => b.date >= from);
  if (to) bookings = bookings.filter((b) => b.date <= to);

  bookings.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  res.json({ bookings });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const booking = (await db.all('bookings')).find((b) => b.id === req.params.id);
  if (!booking) return res.status(404).json({ error: 'Booking not found.' });
  res.json({ booking });
}));

router.patch('/:id/status', asyncHandler(async (req, res) => {
  const { status } = req.body;
  if (!BOOKING_STATUSES.includes(status)) {
    return res.status(400).json({ error: `Status must be one of: ${BOOKING_STATUSES.join(', ')}` });
  }
  const updated = await db.updateById('bookings', req.params.id, { status });
  if (!updated) return res.status(404).json({ error: 'Booking not found.' });
  res.json({ booking: updated });
}));

module.exports = router;
