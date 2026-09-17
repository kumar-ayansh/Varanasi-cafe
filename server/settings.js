// Small settings store, kept as local JSON regardless of which orders/bookings
// backend is active (JSON file or Postgres) — this data is tiny and doesn't
// need a real database.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SETTINGS_PATH = path.join(__dirname, '..', 'data', 'settings.json');

function defaultSettings() {
  return {
    adminPasswordHash: null, // set on first login using ADMIN_PASSWORD from .env; overridden after a password change
    itemAvailability: {},    // { [menuItemId]: false }  — absence means available
    todaysSpecial: null,     // { title, description } or null
    upi: {                   // direct UPI payment option, alongside (never instead of) Razorpay
      enabled: false,
      upiId: '',
      businessName: '',
      qrImage: null          // relative path under public/, e.g. "images/upi/<hash>.png" — set via saveUpiQrImage()
    }
  };
}

function ensureSettings() {
  if (!fs.existsSync(SETTINGS_PATH)) {
    fs.mkdirSync(path.dirname(SETTINGS_PATH), { recursive: true });
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(defaultSettings(), null, 2));
  }
}

function readSettings() {
  ensureSettings();
  try {
    return { ...defaultSettings(), ...JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8')) };
  } catch {
    return defaultSettings();
  }
}

function writeSettings(settings) {
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
}

function hashPassword(password, salt) {
  const useSalt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, useSalt, 100000, 64, 'sha512').toString('hex');
  return `${useSalt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored) return false;
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const check = hashPassword(password, salt);
  // Timing-safe: a plain === comparison on hex strings leaks how many
  // leading characters matched via response-time differences. Doesn't
  // matter much for a PBKDF2 output (astronomically hard to exploit), but
  // it's a one-line fix and there's no reason not to.
  const checkBuf = Buffer.from(check, 'utf-8');
  const storedBuf = Buffer.from(stored, 'utf-8');
  return checkBuf.length === storedBuf.length && crypto.timingSafeEqual(checkBuf, storedBuf);
}

// The effective admin password is: whatever was set via the change-password
// endpoint, falling back to ADMIN_PASSWORD from .env until that happens.
function checkAdminPassword(password) {
  const settings = readSettings();
  if (settings.adminPasswordHash) {
    return verifyPassword(password, settings.adminPasswordHash);
  }
  if (!process.env.ADMIN_PASSWORD || !password) return false;
  const a = Buffer.from(String(password), 'utf-8');
  const b = Buffer.from(String(process.env.ADMIN_PASSWORD), 'utf-8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const MIN_PASSWORD_LENGTH = 10;
// A short blacklist of the passwords most likely to get typed under
// pressure — not a full breached-password list (that'd need an external
// service/network access this app doesn't otherwise need), just enough to
// stop the most obvious mistakes.
const WEAK_PASSWORDS = new Set([
  'password', 'password1', 'password123', '1234567890', 'qwertyuiop',
  'admin1234', 'letmein123', 'welcome123', 'changeme123', 'varanasi123'
]);

// Returns an error string if the password is unacceptable, or null if it's fine.
function validatePasswordStrength(password) {
  if (!password || typeof password !== 'string') return 'Password is required.';
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (WEAK_PASSWORDS.has(password.toLowerCase())) {
    return 'That password is too common. Please choose something less guessable.';
  }
  return null;
}

function setAdminPassword(newPassword) {
  const settings = readSettings();
  settings.adminPasswordHash = hashPassword(newPassword);
  writeSettings(settings);
}

function setItemAvailability(itemId, available) {
  const settings = readSettings();
  if (available) delete settings.itemAvailability[itemId];
  else settings.itemAvailability[itemId] = false;
  writeSettings(settings);
  return settings.itemAvailability;
}

function getItemAvailability() {
  return readSettings().itemAvailability;
}

function setTodaysSpecial(special) {
  const settings = readSettings();
  settings.todaysSpecial = special; // null clears it
  writeSettings(settings);
  return settings.todaysSpecial;
}

function getTodaysSpecial() {
  return readSettings().todaysSpecial;
}

// ---------- UPI payment settings ----------
// Admin-managed alternative payment method, shown alongside Razorpay.
// Never hardcoded in frontend JS — this is the single source of truth,
// and the QR image is validated/stored the same careful way menu images
// are (see saveUpiQrImage below): server-generated filename, magic-byte
// checked, never trusted from the client as an arbitrary path.

function getUpiSettings() {
  return readSettings().upi;
}

// Full settings object, for the admin dashboard — returned regardless of
// whether UPI is currently enabled, so the admin can configure it before
// turning it on.
function getUpiSettingsForAdmin() {
  return readSettings().upi;
}

// Public-safe view for customers at checkout — only the fields the UPI
// payment panel needs, and only once the admin has actually enabled it.
function getUpiSettingsForCustomer() {
  const upi = readSettings().upi;
  if (!upi.enabled || !upi.upiId) return { enabled: false };
  return {
    enabled: true,
    upiId: upi.upiId,
    businessName: upi.businessName || 'The Varanasi Story',
    qrImage: upi.qrImage
  };
}

function setUpiSettings(patch) {
  const settings = readSettings();
  const current = settings.upi;
  const next = { ...current };

  if (patch.upiId !== undefined) {
    const upiId = String(patch.upiId || '').trim().slice(0, 100);
    // Loose format check — real validation happens when the customer's
    // UPI app tries to pay; this just catches obvious typos/garbage.
    if (upiId && !/^[\w.\-]{2,256}@[a-zA-Z]{2,64}$/.test(upiId)) {
      return { error: 'That doesn\'t look like a valid UPI ID (e.g. name@bank).' };
    }
    next.upiId = upiId;
  }
  if (patch.businessName !== undefined) {
    next.businessName = String(patch.businessName || '').trim().slice(0, 100);
  }
  if (patch.enabled !== undefined) {
    if (typeof patch.enabled !== 'boolean') return { error: '`enabled` must be true or false.' };
    if (patch.enabled && !next.upiId) return { error: 'Add a UPI ID before enabling UPI payments.' };
    next.enabled = patch.enabled;
  }
  if (patch.qrImage !== undefined) {
    next.qrImage = patch.qrImage || null;
  }

  settings.upi = next;
  writeSettings(settings);
  return { upi: next };
}

const UPI_IMAGES_DIR = path.join(__dirname, '..', 'public', 'images', 'upi');
const ALLOWED_QR_IMAGE_TYPES = {
  'image/jpeg': { ext: 'jpg', magic: (buf) => buf.length > 2 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff },
  'image/png': { ext: 'png', magic: (buf) => buf.length > 7 && buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  'image/webp': { ext: 'webp', magic: (buf) => buf.length > 11 && buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP' }
};
const MAX_QR_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB

// Accepts a base64 data URL for the owner's UPI QR code and, if it's a
// genuinely safe image, writes it under public/images/upi/ with a
// server-generated filename (mirrors menu-store.js saveImageFromDataUrl —
// same reasoning: never trust a client-supplied filename/path).
function saveUpiQrImage(dataUrl) {
  if (typeof dataUrl !== 'string') return { error: 'No image data provided.' };

  const match = /^data:([a-zA-Z0-9.+-]+\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(dataUrl.trim());
  if (!match) return { error: 'Image must be a base64 data URL.' };

  const [, mimeType, base64Data] = match;
  const spec = ALLOWED_QR_IMAGE_TYPES[mimeType.toLowerCase()];
  if (!spec) return { error: 'Unsupported image format. Use JPG, PNG, or WebP.' };

  let buffer;
  try {
    buffer = Buffer.from(base64Data, 'base64');
  } catch {
    return { error: 'Could not decode image data.' };
  }

  if (buffer.length === 0 || buffer.length > MAX_QR_IMAGE_BYTES) {
    return { error: 'Image must be under 5MB.' };
  }
  if (!spec.magic(buffer)) {
    return { error: 'File does not look like a valid image.' };
  }

  fs.mkdirSync(UPI_IMAGES_DIR, { recursive: true });
  const filename = `${crypto.randomBytes(12).toString('hex')}.${spec.ext}`;
  fs.writeFileSync(path.join(UPI_IMAGES_DIR, filename), buffer);

  return { image: `images/upi/${filename}` };
}

module.exports = {
  checkAdminPassword,
  setAdminPassword,
  validatePasswordStrength,
  MIN_PASSWORD_LENGTH,
  setItemAvailability,
  getItemAvailability,
  setTodaysSpecial,
  getTodaysSpecial,
  getUpiSettings,
  getUpiSettingsForAdmin,
  getUpiSettingsForCustomer,
  setUpiSettings,
  saveUpiQrImage
};
