// Central SEO / business-info configuration.
//
// Every value here is either already public on the live site (restaurant
// name, "Varanasi" branding, the published opening hours) or must be
// supplied via real environment variables. Nothing is invented: fields left
// unset in .env are simply OMITTED from meta tags / structured data rather
// than filled with placeholder text, since fake NAP (name/address/phone)
// data hurts local SEO and can violate Google's structured data guidelines.
//
// Fill in the real values in .env before going live — see .env.example.

const RESTAURANT_NAME = 'The Varanasi Story Cafe & Restaurant';

function siteUrl() {
  // Never hardcode localhost in production metadata — set SITE_URL in .env
  // once deployed (e.g. https://thevaranasistory.com). Falls back to
  // localhost only so local/Termux development still works out of the box.
  const raw = process.env.SITE_URL || `http://localhost:${process.env.PORT || 3000}`;
  return raw.replace(/\/+$/, ''); // strip any trailing slash
}

function absoluteUrl(pathName) {
  const p = pathName.startsWith('/') ? pathName : `/${pathName}`;
  return `${siteUrl()}${p}`;
}

function heroImageUrl() {
  return absoluteUrl('/images/hero-1.webp');
}

function getBusinessInfo() {
  return {
    name: RESTAURANT_NAME,
    // Already stated publicly on the live site's own hero/footer copy —
    // not invented. Still overridable via env if that ever needs correcting.
    city: process.env.RESTAURANT_CITY || 'Varanasi',
    region: process.env.RESTAURANT_REGION || 'Uttar Pradesh',
    country: process.env.RESTAURANT_COUNTRY || 'IN',
    // Must be supplied for real before these appear anywhere — left blank,
    // and omitted downstream, until then.
    street: process.env.RESTAURANT_STREET || '',
    postalCode: process.env.RESTAURANT_POSTAL_CODE || '',
    phone: process.env.RESTAURANT_PHONE || '',
    // Owner's WhatsApp number — already used site-wide (homepage trust
    // item, admin dashboard) via OWNER_WHATSAPP. Reused here rather than a
    // new var so Contact/About stay in sync with the rest of the site.
    whatsapp: process.env.OWNER_WHATSAPP || '',
    email: process.env.RESTAURANT_EMAIL || '',
    mapsUrl: process.env.RESTAURANT_MAPS_URL || '',
    priceRange: process.env.RESTAURANT_PRICE_RANGE || '',
    cuisines: (process.env.RESTAURANT_CUISINE || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    social: {
      instagram: process.env.SOCIAL_INSTAGRAM || '',
      facebook: process.env.SOCIAL_FACEBOOK || '',
      youtube: process.env.SOCIAL_YOUTUBE || '',
      twitter: process.env.SOCIAL_TWITTER || ''
    },
    // Already published site-wide on the live footer ("Open daily ·
    // 11:00 AM – 11:00 PM") — real, existing content, not invented.
    opens: process.env.RESTAURANT_OPENS || '11:00',
    closes: process.env.RESTAURANT_CLOSES || '23:00'
  };
}

// Builds Schema.org Restaurant JSON-LD from only the fields that are
// actually known. No aggregateRating is included: this codebase has no
// rating/review system wired up (nothing in db-pg.js / db-json.js /
// server/routes stores ratings), so there is no real data to expose. Adding
// fake ratingValue/reviewCount would violate Google's structured-data
// policy and this file's own "never invent" rule — see the SEO report for
// what it would take to add this legitimately later.
function buildRestaurantJsonLd() {
  const b = getBusinessInfo();

  const address = {
    '@type': 'PostalAddress',
    addressLocality: b.city,
    addressRegion: b.region,
    addressCountry: b.country
  };
  if (b.street) address.streetAddress = b.street;
  if (b.postalCode) address.postalCode = b.postalCode;

  const json = {
    '@context': 'https://schema.org',
    '@type': 'Restaurant',
    name: b.name,
    image: [heroImageUrl()],
    url: siteUrl(),
    address,
    openingHoursSpecification: [
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
        opens: b.opens,
        closes: b.closes
      }
    ],
    hasMenu: absoluteUrl('/menu.html')
  };

  if (b.phone) json.telephone = b.phone;
  if (b.priceRange) json.priceRange = b.priceRange;
  if (b.cuisines.length) json.servesCuisine = b.cuisines;
  const sameAs = Object.values(b.social).filter(Boolean);
  if (sameAs.length) json.sameAs = sameAs;

  return json;
}

// Public-safe subset of getBusinessInfo() for the client-side /api/config
// endpoint — only fields meant to be shown on Contact/About/footer/nav.
// Empty fields are omitted (not filled with placeholder text) so the
// frontend can tell "not configured yet" apart from "really is blank".
function getPublicContactInfo() {
  const b = getBusinessInfo();
  const address = [b.street, b.city, b.region, b.postalCode].filter(Boolean).join(', ');
  return {
    phone: b.phone || '',
    whatsapp: b.whatsapp || '',
    email: b.email || '',
    address,
    mapsUrl: b.mapsUrl || '',
    hours: b.opens && b.closes ? { opens: b.opens, closes: b.closes } : null,
    social: {
      instagram: b.social.instagram || '',
      facebook: b.social.facebook || '',
      youtube: b.social.youtube || '',
      twitter: b.social.twitter || ''
    }
  };
}

function pageMeta({ path: pagePath, image }) {
  return {
    canonical: absoluteUrl(pagePath),
    ogImage: image ? absoluteUrl(image) : heroImageUrl()
  };
}

module.exports = {
  RESTAURANT_NAME,
  siteUrl,
  absoluteUrl,
  heroImageUrl,
  getBusinessInfo,
  getPublicContactInfo,
  buildRestaurantJsonLd,
  pageMeta
};
