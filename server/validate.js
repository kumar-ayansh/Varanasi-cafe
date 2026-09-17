// Small validation helpers shared by the orders and bookings routes.
// Keeps checks in one place instead of scattered inline conditions.

const PHONE_RE = /^[0-9]{10}$/;

function validateOrderInput({ customerName, phone, items, paymentId }) {
  if (!customerName || typeof customerName !== 'string' || !customerName.trim()) {
    return 'Customer name is required.';
  }
  if (customerName.trim().length > 100) return 'Customer name is too long.';
  if (!phone || !PHONE_RE.test(String(phone).trim())) {
    return 'A valid 10-digit phone number is required.';
  }
  if (!Array.isArray(items) || items.length === 0) return 'Cart is empty.';
  if (items.length > 50) return 'Too many line items in one order.';
  for (const line of items) {
    if (!line || typeof line.id !== 'string') return 'Invalid item in cart.';
  }
  if (!paymentId || typeof paymentId !== 'string') return 'Order must include a verified payment ID.';
  return null;
}

function validateBookingInput({ customerName, phone, date, time, guests }) {
  if (!customerName || typeof customerName !== 'string' || !customerName.trim()) {
    return 'Customer name is required.';
  }
  if (customerName.trim().length > 100) return 'Customer name is too long.';
  if (!phone || !PHONE_RE.test(String(phone).trim())) {
    return 'A valid 10-digit phone number is required.';
  }
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return 'A valid date is required.';
  if (!time || !/^\d{2}:\d{2}$/.test(time)) return 'A valid time is required.';
  const g = Number(guests);
  if (!g || g < 1 || g > 20) return 'Guests must be between 1 and 20. For larger parties, please call us.';
  return null;
}

module.exports = { validateOrderInput, validateBookingInput };
