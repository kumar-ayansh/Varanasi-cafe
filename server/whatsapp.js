// Sends a WhatsApp message to the owner via Twilio's WhatsApp API.
// Requires a Twilio account (free trial works with their WhatsApp sandbox):
// https://www.twilio.com/docs/whatsapp/quickstart/node
//
// Set these in .env to enable automatic notifications:
//   TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
//   TWILIO_AUTH_TOKEN=your_auth_token
//   TWILIO_WHATSAPP_FROM=whatsapp:+14155238886   (Twilio sandbox number, or your approved sender)
//   OWNER_WHATSAPP=919876543210                  (already used elsewhere — no + or spaces)
//
// Until these are set, this silently no-ops — the in-dashboard sound/browser
// alert and the manual WhatsApp buttons in the admin panel still work fine
// without it.

const https = require('https');

function isConfigured() {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_WHATSAPP_FROM &&
    process.env.OWNER_WHATSAPP
  );
}

function sendOwnerWhatsapp(message) {
  if (!isConfigured()) return; // fire-and-forget no-op when not set up

  const sid = process.env.TWILIO_ACCOUNT_SID;
  const auth = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_FROM;
  const to = `whatsapp:+${process.env.OWNER_WHATSAPP}`;

  const body = new URLSearchParams({ From: from, To: to, Body: message }).toString();
  const options = {
    hostname: 'api.twilio.com',
    path: `/2010-04-01/Accounts/${sid}/Messages.json`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(body),
      Authorization: 'Basic ' + Buffer.from(`${sid}:${auth}`).toString('base64')
    }
  };

  const req = https.request(options, (res) => {
    if (res.statusCode >= 300) {
      console.error('Twilio WhatsApp send failed, status:', res.statusCode);
    }
  });
  req.on('error', (err) => console.error('Twilio WhatsApp send error:', err.message));
  req.write(body);
  req.end();
}

function notifyNewOrder(order) {
  const lines = order.items.map((i) => `  • ${i.name} × ${i.qty}`).join('\n');
  sendOwnerWhatsapp(
    `🔔 New order ${order.id}\nCustomer: ${order.customerName} (${order.phone})\nType: ${order.orderType}\n${lines}\nTotal: ₹${order.total}\nPayment: ${order.paymentStatus}`
  );
}

function notifyNewBooking(booking) {
  sendOwnerWhatsapp(
    `🔔 New table booking ${booking.id}\nCustomer: ${booking.customerName} (${booking.phone})\nDate: ${booking.date} at ${booking.time}\nGuests: ${booking.guests}${booking.notes ? `\nNotes: ${booking.notes}` : ''}`
  );
}

module.exports = { isConfigured, notifyNewOrder, notifyNewBooking };
