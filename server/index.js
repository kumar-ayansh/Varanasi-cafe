require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const menuRoutes = require('./routes/menu');
const orderRoutes = require('./routes/orders');
const bookingRoutes = require('./routes/bookings');
const paymentRoutes = require('./routes/payment');
const upiRoutes = require('./routes/upi');
const settings = require('./settings');
const menuStore = require('./menu-store');
const auth = require('./auth');
const asyncHandler = require('./asyncHandler');
const { DB_PATH } = require('./db-json');
const seo = require('./seo');
const { renderPage, PAGES: SEO_PAGES } = require('./render');

// Safety net: log unexpected async failures instead of letting them crash
// the whole server. Route-level errors should be caught by asyncHandler +
// the error middleware below; this only catches things that slip past
// that (e.g. a rejection outside any request, like the backup timer).
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
});

// Refuses to start in production without a real ADMIN_TOKEN_SECRET — see
// auth.js for why an unset secret is dangerous, not just inconvenient.
auth.checkStartupSecret();

// Seeds data/menu.json from server/menu-data.js on first run (no-op if it
// already exists) and makes sure public/images/menu/ exists for uploads.
menuStore.getCategories();

const app = express();
const PORT = process.env.PORT || 3000;

// ---------- Security headers ----------
// Hand-rolled rather than the `helmet` package — same core protections,
// zero extra dependencies. The CSP here is deliberately permissive on
// 'unsafe-inline' for script/style because the existing pages use inline
// <script> blocks and style="" attributes throughout; tightening that
// further means externalizing those first (a separate frontend pass) —
// doing it blind here would silently break the site. What it DOES do:
// block any script/style/frame from a domain that isn't explicitly
// allow-listed, which stops the overwhelming majority of real XSS payloads
// (which try to load or point to an attacker-controlled origin).
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), camera=(), microphone=()');
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://checkout.razorpay.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "connect-src 'self' https://api.razorpay.com https://checkout.razorpay.com",
      "frame-src https://api.razorpay.com https://checkout.razorpay.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'"
    ].join('; ')
  );
  next();
});

// ---------- Canonical host / HTTPS redirect ----------
// Collapses http/https and www/non-www duplicate-content variants onto the
// one canonical URL search engines should index. Only active once SITE_URL
// is actually set for production — never redirects during local/Termux dev.
if (process.env.NODE_ENV === 'production' && process.env.SITE_URL) {
  app.set('trust proxy', 1);
  const canonicalHost = new URL(seo.siteUrl()).host;
  app.use((req, res, next) => {
    const proto = req.headers['x-forwarded-proto'] || req.protocol;
    if (proto !== 'https' || req.headers.host !== canonicalHost) {
      return res.redirect(301, `https://${canonicalHost}${req.originalUrl}`);
    }
    next();
  });
}

// Belt-and-suspenders alongside robots.txt: an X-Robots-Tag header survives
// even if a crawler ignores robots.txt or hits an API/admin route directly.
// Registered this early so it applies no matter which route below ends up
// handling the request.
app.use(['/admin.html', '/api'], (req, res, next) => {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  next();
});

// ---------- CORS ----------
// In production, set ALLOWED_ORIGIN to your real domain (e.g. https://thevaranasistory.com)
// so only your own site can call the API. Left open ("*") by default for local dev.
if (process.env.ALLOWED_ORIGIN) {
  app.use(cors({ origin: process.env.ALLOWED_ORIGIN }));
} else {
  console.warn('⚠️  ALLOWED_ORIGIN not set — CORS is wide open. Set it before going live.');
  app.use(cors());
}

// Menu image uploads (base64 data URLs) are much bigger than every other
// JSON body this API accepts, so this route gets its own parser with a
// larger limit, mounted before the general one below. body-parser marks
// the request as already-parsed once this runs, so the general
// express.json() call further down safely skips re-parsing it.
app.use('/api/menu/images', express.json({ limit: '8mb' }));
app.use('/api/upi/qr-image', express.json({ limit: '8mb' }));

// Keep the raw request body around (req.rawBody) alongside the parsed JSON —
// the Razorpay webhook needs to verify its HMAC signature against the exact
// bytes Razorpay sent, not a re-serialized copy of the parsed object.
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));

// ---------- Rate limiting ----------
// Redis-backed when REDIS_URL is set (shared across every Node.js
// instance behind a load balancer); safely falls back to a per-process
// in-memory counter otherwise or if Redis is briefly unreachable — never
// silently disabled. See server/rateLimit.js for the full failure policy.
const { createRateLimiter } = require('./rateLimit');
const rateLimit = (bucket, max, windowMs) => createRateLimiter(bucket, max, windowMs);
const loginLimiter = rateLimit('admin-login', 10, 10 * 60 * 1000); // slow down password guessing

// ---------- Admin auth ----------
app.post('/api/admin/login', loginLimiter, asyncHandler(async (req, res) => {
  const { password } = req.body;
  if (!password || !settings.checkAdminPassword(password)) {
    return res.status(401).json({ error: 'Incorrect password.' });
  }
  res.json({ token: auth.createToken() });
}));

app.post('/api/admin/change-password', auth.requireAdmin, asyncHandler(async (req, res) => {
  const { newPassword } = req.body;
  const weaknessError = settings.validatePasswordStrength(newPassword);
  if (weaknessError) {
    return res.status(400).json({ error: weaknessError });
  }
  settings.setAdminPassword(String(newPassword));
  res.json({ ok: true });
}));

// ---------- Routes ----------
app.use('/api/menu', (req, res, next) => {
  // Reading the public menu (and today's special) is open to everyone;
  // the admin item list (which includes archived items) and every write
  // endpoint require an admin token.
  if (req.method === 'GET' && req.path !== '/items') return next();
  return auth.requireAdmin(req, res, next);
}, menuRoutes);

app.use('/api/payment/create-order', rateLimit('create-order', 15, 10 * 60 * 1000));
app.use('/api/payment/upi-order', rateLimit('upi-order', 15, 10 * 60 * 1000));
// The frontend's "I Have Completed Payment" waiting screen polls this
// every 5s (~12 req/min) while a UPI order is pending — cap well above
// that per IP so normal polling (including a few tabs/orders at once)
// never gets throttled, while still blunting abuse.
app.use('/api/payment/order-status', rateLimit('upi-status', 60, 60 * 1000));
app.use('/api/payment', paymentRoutes);

app.use('/api/upi', (req, res, next) => {
  // Reading the public UPI config (checkout page) is open to everyone;
  // the admin settings view and every write endpoint require an admin token.
  if (req.method === 'GET' && req.path === '/settings') return next();
  return auth.requireAdmin(req, res, next);
}, upiRoutes);

app.use('/api/orders', (req, res, next) => {
  // Placing a new order stays public (rate-limited); everything else is admin-only.
  if (req.method === 'POST') return rateLimit('orders-post', 8, 10 * 60 * 1000)(req, res, next);
  return auth.requireAdmin(req, res, next);
}, orderRoutes);

app.use('/api/bookings', (req, res, next) => {
  // Placing a booking and checking slot availability stay public; everything else is admin-only.
  if (req.method === 'POST') return rateLimit('bookings-post', 8, 10 * 60 * 1000)(req, res, next);
  if (req.method === 'GET' && req.path === '/availability') return next();
  return auth.requireAdmin(req, res, next);
}, bookingRoutes);

app.get('/api/config', (req, res) => {
  res.json({
    // Kept as-is — existing homepage JS (trust-strip WhatsApp item) reads
    // this exact field and must keep working unchanged.
    ownerWhatsapp: process.env.OWNER_WHATSAPP || '',
    // Added for the new About/Contact pages and site-wide header/footer
    // social links (see server/seo.js#getPublicContactInfo). Every field
    // is omitted rather than faked when not set in .env.
    contact: seo.getPublicContactInfo()
  });
});

// ---------- robots.txt / sitemap.xml ----------
// Generated at request time (not a static file) so the Sitemap: line and
// every <loc> always match the real SITE_URL — never a hardcoded/localhost
// domain, even if that env var changes across environments.
app.get('/robots.txt', (req, res) => {
  res.type('text/plain').send(
    [
      'User-agent: *',
      'Allow: /',
      '',
      // Admin dashboard and every API endpoint — never meant to be indexed,
      // and the API responses would be useless (and potentially sensitive)
      // in search results anyway. CSS/JS/images under /css /js /images are
      // intentionally NOT blocked — the site needs them crawlable to render.
      'Disallow: /admin.html',
      'Disallow: /api/',
      '',
      `Sitemap: ${seo.absoluteUrl('/sitemap.xml')}`
    ].join('\n')
  );
});

app.get('/sitemap.xml', (req, res) => {
  // Only real, canonical, publicly indexable pages — no admin/auth/API/
  // checkout-session URLs, and no per-menu-item URLs since this app doesn't
  // have unique public pages per item (menu items render client-side from
  // /api/menu on menu.html, not as separate routes).
  const urls = Object.values(SEO_PAGES).map((p) => p.urlPath);
  const body =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.map((u) => `  <url><loc>${seo.absoluteUrl(u)}</loc></url>`).join('\n') +
    '\n</urlset>';
  res.type('application/xml').send(body);
});

// ---------- SEO-tagged public pages ----------
// Serves index.html/menu.html/order.html/booking.html with canonical, Open
// Graph, Twitter-card and (homepage) Restaurant JSON-LD tags injected — see
// server/render.js. Mounted before express.static so these specific files
// go through the templating step instead of being served as flat static
// files. Every other file in public/ (css, js, images, admin.html) is
// untouched and still served statically right below.
app.get(['/', '/index.html', '/menu.html', '/order.html', '/booking.html', '/about.html', '/contact.html'], (req, res, next) => {
  const fileName = req.path === '/' ? 'index.html' : req.path.slice(1);
  const html = renderPage(fileName);
  if (html === null) return next();
  res.type('html').send(html);
});

app.use(express.static(path.join(__dirname, '..', 'public')));

// ---------- 404 ----------
// A real HTTP 404 (not a 200 with "not found" text) for anything that
// didn't match an API route or a static file above.
app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Not found.' });
  }
  res.status(404).sendFile(path.join(__dirname, '..', 'public', '404.html'));
});

// ---------- Automatic backups ----------
// Copies data/db.json into data/backups/ once a day, keeping the last 14.
// Only meaningful for the JSON backend — Postgres has its own backup story
// (e.g. your hosting provider's managed backups).
function runBackup() {
  if (process.env.DATABASE_URL) return; // Postgres backend — skip file backup
  if (!fs.existsSync(DB_PATH)) return;
  const backupDir = path.join(__dirname, '..', 'data', 'backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10);
  fs.copyFileSync(DB_PATH, path.join(backupDir, `db-${stamp}.json`));

  const files = fs.readdirSync(backupDir).filter((f) => f.startsWith('db-')).sort();
  const excess = files.length - 14;
  if (excess > 0) {
    files.slice(0, excess).forEach((f) => fs.unlinkSync(path.join(backupDir, f)));
  }
}
runBackup();
setInterval(runBackup, 24 * 60 * 60 * 1000);

// ---------- Global error handler ----------
// Catches anything forwarded via next(err) — including every asyncHandler-
// wrapped route above. Never leaks stack traces, DB connection strings, or
// internal error messages to the client; those go to the server log only.
app.use((err, req, res, next) => {
  console.error('Unhandled route error:', err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

app.listen(PORT, () => {
  console.log(`The Varanasi Story server running at http://localhost:${PORT}`);
});
