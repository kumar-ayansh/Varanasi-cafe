// Injects canonical/Open-Graph/Twitter-card/JSON-LD tags into the public
// HTML pages at request time, using real values from server/seo.js (which
// in turn come from env vars — see .env.example). These tags MUST exist in
// the raw HTML response: link-preview crawlers (WhatsApp, Facebook,
// Twitter/X, Slack, etc.) and some search bots do not execute JavaScript,
// so injecting them client-side (the way this app already does for e.g. the
// homepage's WhatsApp button) would leave those tags invisible to them.
//
// This does NOT change page content, layout, or any application behavior —
// it only adds a handful of <meta>/<link>/<script type="application/ld+json">
// tags into each page's existing <head>, at the `<!--SEO_HEAD-->` marker.

const fs = require('fs');
const path = require('path');
const seo = require('./seo');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');

// Titles/descriptions describe each page's real, existing content — nothing
// invented or duplicated across pages (Google Search Console flags
// duplicate titles/descriptions, so every page here is deliberately unique).
const PAGES = {
  'index.html': {
    urlPath: '/',
    title: 'The Varanasi Story | Cafe & Restaurant in Varanasi',
    description:
      'The Varanasi Story is a cafe & restaurant in Varanasi serving adrak chai, wood-fired pizza, maggie and more. Order ahead online or book a table for a ghat-side-inspired evening.',
    ogType: 'website',
    includeRestaurantJsonLd: true
  },
  'menu.html': {
    urlPath: '/menu.html',
    title: 'Full Menu | The Varanasi Story',
    description:
      'Browse the full menu at The Varanasi Story — chai, coffee, shakes, maggie, pizza, sandwiches, noodles and more, entirely vegetarian. Order ahead for pickup or dine-in.',
    ogType: 'website'
  },
  'order.html': {
    urlPath: '/order.html',
    title: 'Order Ahead Online | The Varanasi Story',
    description:
      'Order ahead online from The Varanasi Story and pay securely with Razorpay or UPI — skip the wait for pickup or dine-in.',
    ogType: 'website'
  },
  'booking.html': {
    urlPath: '/booking.html',
    title: 'Book a Table | The Varanasi Story',
    description:
      "Reserve a table at The Varanasi Story in Varanasi — pick your date, time and party size and we'll confirm by phone shortly after.",
    ogType: 'website'
  },
  'about.html': {
    urlPath: '/about.html',
    title: 'About Us | The Varanasi Story',
    description:
      'The story behind The Varanasi Story — our cafe & restaurant in Varanasi, what makes it special, and the people behind it.',
    ogType: 'website'
  },
  'contact.html': {
    urlPath: '/contact.html',
    title: 'Contact Us | The Varanasi Story',
    description:
      'Get in touch with The Varanasi Story — phone, WhatsApp, address, opening hours and directions.',
    ogType: 'website',
    includeRestaurantJsonLd: true
  }
};

function escapeAttr(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Cached per file name in production, since env vars (the only thing this
// depends on) don't change at runtime — avoids re-reading/re-templating the
// file on every request. Always recomputed in development so edits show up
// without a restart.
const cache = new Map();

function buildSeoHead(cfg) {
  const meta = seo.pageMeta({ path: cfg.urlPath });

  const tags = [
    `<link rel="canonical" href="${meta.canonical}">`,
    `<meta property="og:type" content="${cfg.ogType}">`,
    `<meta property="og:site_name" content="${escapeAttr(seo.RESTAURANT_NAME)}">`,
    `<meta property="og:title" content="${escapeAttr(cfg.title)}">`,
    `<meta property="og:description" content="${escapeAttr(cfg.description)}">`,
    `<meta property="og:url" content="${meta.canonical}">`,
    `<meta property="og:image" content="${meta.ogImage}">`,
    '<meta name="twitter:card" content="summary_large_image">',
    `<meta name="twitter:title" content="${escapeAttr(cfg.title)}">`,
    `<meta name="twitter:description" content="${escapeAttr(cfg.description)}">`,
    `<meta name="twitter:image" content="${meta.ogImage}">`
  ];

  if (cfg.includeRestaurantJsonLd) {
    tags.push(`<script type="application/ld+json">${JSON.stringify(seo.buildRestaurantJsonLd())}</script>`);
  }

  return tags.join('\n');
}

function renderPage(fileName) {
  const cfg = PAGES[fileName];
  if (!cfg) return null;

  if (process.env.NODE_ENV === 'production' && cache.has(fileName)) {
    return cache.get(fileName);
  }

  const filePath = path.join(PUBLIC_DIR, fileName);
  let html = fs.readFileSync(filePath, 'utf8');

  if (!html.includes('<!--SEO_HEAD-->')) {
    // Marker missing (e.g. someone edited the HTML) — serve the file as-is
    // rather than silently dropping SEO tags with no signal anything's wrong.
    console.warn(`[seo] ${fileName} has no <!--SEO_HEAD--> marker — SEO tags not injected.`);
    return html;
  }

  html = html.replace('<!--SEO_HEAD-->', buildSeoHead(cfg));

  if (process.env.NODE_ENV === 'production') cache.set(fileName, html);
  return html;
}

module.exports = { renderPage, PAGES };
