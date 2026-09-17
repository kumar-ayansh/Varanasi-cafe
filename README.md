# The Varanasi Story — Website

Fully functional site for The Varanasi Story Cafe & Restaurant: browsable menu,
order-ahead with Razorpay payments, table booking, and a full admin
dashboard. Vanilla HTML/CSS/JS frontend + a small Node/Express backend.
No native/compiled dependencies, so it installs cleanly in Termux.

## 1. Setup (Termux or any machine with Node.js)

```bash
pkg install nodejs          # Termux only — skip on a normal PC/laptop
cd varanasi-story
npm install
cp .env.example .env
```

Now edit `.env` — see the comments in `.env.example` for every option. At minimum set:
- `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` — from https://dashboard.razorpay.com/app/keys (use **Test Mode** keys first)
- `ADMIN_PASSWORD` — password for the `/admin.html` dashboard (you can change it later from the dashboard itself)
- `OWNER_WHATSAPP` — your number, for the WhatsApp features
- `TOTAL_TABLES` — how many tables you have, for the booking system

## 2. Run it

```bash
npm start
```

Visit `http://localhost:3000` (or `http://<your-phone-ip>:3000` from another
device on the same wifi, if running from Termux).

## 3. Testing payments

With Razorpay **test keys**, use their test card `4111 1111 1111 1111`, any
future expiry, any CVV — or test UPI ID `success@razorpay`. Full list:
https://razorpay.com/docs/payments/payments/test-card-upi-details/

When you're ready to accept real money, switch to your **Live Mode** keys in
`.env` and complete Razorpay's KYC/activation for your business.

## 4. Menu data — please verify

`server/menu-data.js` holds every menu item and price. The **Happy Hours**,
**Special Combos**, **Group Combos**, and **Loyalty Rewards** prices were
transcribed from a clear, well-lit photo and should be accurate. Everything
else (Pizza, Sandwich, Noodles, Chinese, etc.) came from a second photo where
the small print was hard to read reliably — those items are marked
`approx: true`. **Open `server/menu-data.js` and correct any wrong prices
against your printed menu before going live** — it's plain JSON-like JS, no
coding needed, just edit the numbers.

## 5. Admin dashboard (`/admin.html`)

Log in with `ADMIN_PASSWORD` (or whatever you've since changed it to). Login
now issues a signed, 12-hour token instead of storing your raw password in
the browser. You get four tabs:

**Orders**
- Full details per order — date/time, customer, phone, items, quantities, individual & total price, order type, notes
- Payment status (Paid/Failed/Pending), Razorpay Payment ID, payment time
- **View Details** — click any Order ID for the full breakdown in a modal
- Status workflow: received → confirmed → preparing → ready → completed/cancelled
- Search by name/phone, filter by status, "Today" / "Pending" quick filters, and a date-range picker for order history
- **New order alert** — sound + browser notification when a new order lands while the dashboard is open
- **Auto-refresh** every 15s (toggle off if you don't want it)
- One-tap **WhatsApp** button per order to message that customer directly

**Bookings**
- Full details — customer, phone, date, time, guests, special request
- Status workflow: pending → confirmed → seated → completed/cancelled
- **Table availability checker** — pick a date+time, see how many of your `TOTAL_TABLES` are free
- Same search/filter/date-range tools as Orders
- WhatsApp button per booking

**Menu**
- Toggle any item **Available / Out of Stock** — takes effect on the live site immediately, and the server also refuses to let anyone pay for an out-of-stock item even if their page was stale
- Set/clear **Today's Special** — shows as a banner on the homepage

**Reports**
- Sales & order totals for Today / Last 7 Days / Last 30 Days, broken down by day

**Account**
- **Change Password** button (top right) — updates your login password (stored hashed, not in plain text)
- **Logout** button

## 6. WhatsApp notifications

Two levels, both included:
1. **Always on, no setup**: the admin dashboard's sound + browser notification alert you the moment a new order/booking arrives while it's open, and every order/booking row has a one-tap WhatsApp button to message that customer from your own phone.
2. **Optional automatic push to your own WhatsApp**, even when you're not looking at the dashboard: set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_WHATSAPP_FROM` in `.env` (free to start with Twilio's WhatsApp sandbox — https://www.twilio.com/docs/whatsapp/quickstart/node). Until those are set, this feature silently does nothing — everything else keeps working.

## 7. Table booking — double-booking protection

`TOTAL_TABLES` in `.env` (default 8) caps how many bookings can share the same
date+time slot; once full, new requests for that slot are rejected with a
clear message, and both the booking page and the admin dashboard let you
check live availability before submitting.

## 8. Security & backend hardening included

- **Signed, expiring admin tokens** instead of sending your password on every request; change your password anytime from the dashboard (stored as a salted hash, never in plain text)
- **Server-side input validation** on every order/booking (name, 10-digit phone, valid date/time, item IDs) — the browser form is a convenience, not the security boundary
- **Rate limiting** on public write endpoints (placing orders/bookings, admin login attempts) to blunt spam/abuse
- **Server-side Razorpay signature verification** — a payment is only trusted after we independently verify it, never just because the browser says it succeeded
- **CORS lock-down** — set `ALLOWED_ORIGIN` to your real domain before going live; left open for local development with a startup warning
- **All secrets in `.env`**, never in code — `.env` is git-ignored
- **Automatic daily backups** of `data/db.json`, keeping the last 14 days (only relevant if you're using the default JSON store — see below)

## 9. Optional: PostgreSQL instead of the JSON file store

By default, orders and bookings live in `data/db.json` — simple, and fine for
a single cafe's volume. If you outgrow it (or just prefer a real database),
set `DATABASE_URL` in `.env` to a Postgres connection string, e.g.:

```
DATABASE_URL=postgres://user:password@host:5432/dbname
```

The server detects this automatically on startup and switches backends — no
other code changes needed. Tables are created automatically on first run.
(Uses the `pg` package, which is pure JavaScript — no native compile step,
so it still installs fine in Termux.)

## 10. About Us & Contact pages

Two new pages, built with the same design language as the rest of the site — nothing invented, everything either already-public site copy or driven by `.env`:

- **`/about.html`** — brand story, what makes the cafe special, and a Founders/Owners section. To add real founders: open `public/js/founders-data.js` and replace the placeholder entries (bracketed, e.g. `[FOUNDER NAME]`) with real name/role/bio, and add a real photo under `public/images/founders/` (create that folder), pointing `photo:` at it. The array supports any number of founders — copy the whole `{ ... }` block to add more.
- **`/contact.html`** — phone (`tel:` link), WhatsApp (`wa.me` link), email (`mailto:`), address, opening hours, a "Get Directions" link, and social icons. All sourced from `.env` via `server/seo.js` — set these to go live:
  ```
  RESTAURANT_PHONE=91XXXXXXXXXX
  OWNER_WHATSAPP=91XXXXXXXXXX     # already used elsewhere for WhatsApp features
  RESTAURANT_EMAIL=hello@yourdomain.com
  RESTAURANT_STREET=...
  RESTAURANT_POSTAL_CODE=...
  RESTAURANT_MAPS_URL=https://maps.google.com/?q=...
  SOCIAL_INSTAGRAM=https://instagram.com/...
  SOCIAL_FACEBOOK=https://facebook.com/...
  SOCIAL_YOUTUBE=https://youtube.com/...
  ```
  Any field left unset simply doesn't appear (or, on the Contact page itself, shows a small "Not added yet" placeholder) rather than showing fake information. The header/footer social icons only appear once the matching `.env` value is set.

Both pages are wired into the existing SEO system (`server/render.js` / `server/seo.js`) — canonical URL, Open Graph/Twitter tags, and (Contact page) Restaurant structured data — and are included automatically in `/sitemap.xml`.

## 11. What's still outside this codebase

These need your own accounts/hosting decisions, not just code:
- **A real domain + HTTPS** — Razorpay's live checkout requires HTTPS
- **Deploying somewhere always-on** — Render, Railway, or a small VPS all work well for a plain Node/Express app; push this folder, set the same env vars from `.env` in their dashboard, point your domain at it
- **Razorpay Live Mode + KYC** — switch from test to live keys once your business is activated with Razorpay
- **Twilio account** (optional) — only if you want the fully-automatic WhatsApp push described in section 6

Once deployed, do one final end-to-end pass: Menu → Cart → Order → Payment →
Admin dashboard → Status updates → Notifications — exactly like a real
customer would.
