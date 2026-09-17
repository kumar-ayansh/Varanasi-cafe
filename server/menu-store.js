// Authoritative menu data store.
//
// server/menu-data.js used to be the ONE source of truth for the menu, but
// it was a static file — nothing could change at runtime, so the admin
// dashboard could only toggle availability (via settings.js) and set a
// free-text "Today's Special" banner. This file replaces menu-data.js's
// `menu` object as the real source of truth so the admin can fully manage
// items (add/edit/archive, price, description, image, category, veg,
// availability, NEW, SPECIAL) from the dashboard, with no code edits.
//
// Kept as a local JSON file regardless of which orders/bookings backend is
// active (JSON file or Postgres) — same reasoning as settings.js: this data
// is small, read constantly, and doesn't need a real database. Every route
// that reads or writes menu items goes through this module, so it stays the
// single authoritative source the task requires.
//
// `happyHours` and `loyalty` are untouched, unmanaged, static content — the
// admin menu isn't being asked to manage those, so they still come straight
// from menu-data.js.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { menu: seedMenu, happyHours, loyalty } = require('./menu-data');

const DATA_DIR = path.join(__dirname, '..', 'data');
const MENU_PATH = path.join(DATA_DIR, 'menu.json');
const IMAGES_DIR = path.join(__dirname, '..', 'public', 'images', 'menu');

const MAX_NAME_LEN = 100;
const MAX_DESC_LEN = 500;
const MAX_PRICE = 100000;

// ---------- Seed / persistence ----------

function buildSeed() {
  const now = new Date().toISOString();
  const categories = Object.entries(seedMenu).map(([key, cat]) => ({ key, label: cat.label }));
  const items = [];
  for (const [key, cat] of Object.entries(seedMenu)) {
    for (const item of cat.items) {
      items.push({
        id: item.id,
        name: item.name,
        description: '',
        price: item.price,
        halfPrice: typeof item.halfPrice === 'number' ? item.halfPrice : null,
        category: key,
        image: null,
        veg: typeof item.veg === 'boolean' ? item.veg : true,
        available: true,
        isNew: false,
        isSpecial: false,
        approx: item.approx === true,
        archived: false,
        createdAt: now,
        updatedAt: now
      });
    }
  }
  return { categories, items };
}

function ensureStore() {
  if (!fs.existsSync(MENU_PATH)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(MENU_PATH, JSON.stringify(buildSeed(), null, 2));
  }
  if (!fs.existsSync(IMAGES_DIR)) {
    fs.mkdirSync(IMAGES_DIR, { recursive: true });
  }
}

function readStore() {
  ensureStore();
  let data;
  try {
    data = JSON.parse(fs.readFileSync(MENU_PATH, 'utf-8'));
  } catch {
    data = buildSeed();
  }
  if (!Array.isArray(data.categories)) data.categories = buildSeed().categories;
  if (!Array.isArray(data.items)) data.items = [];
  return data;
}

function writeStore(data) {
  fs.writeFileSync(MENU_PATH, JSON.stringify(data, null, 2));
}

// ---------- Reads ----------

function getCategories() {
  return readStore().categories;
}

function getCategoryKeys() {
  return new Set(getCategories().map((c) => c.key));
}

// All non-archived items, flat — this is what payment/order logic should
// use to look up the authoritative current price for an item id.
function getActiveItemsFlat() {
  return readStore().items.filter((i) => !i.archived);
}

// Every item including archived ones — for the admin management list.
function getAllItemsFlat() {
  return readStore().items;
}

function getItemById(id) {
  return readStore().items.find((i) => i.id === id) || null;
}

// Shape used by the public menu API and the customer-facing frontend:
// { [categoryKey]: { label, items: [...] } }, archived items excluded.
function getGroupedMenu() {
  const { categories, items } = readStore();
  const out = {};
  for (const cat of categories) {
    out[cat.key] = {
      label: cat.label,
      items: items
        .filter((i) => i.category === cat.key && !i.archived)
        .map((i) => ({ ...i }))
    };
  }
  return out;
}

function getStaticExtras() {
  return { happyHours, loyalty };
}

// ---------- Validation ----------

// `partial=true` (used for edits) only validates fields that are present in
// `data`; `partial=false` (used for creation) requires the core fields.
function validateItemInput(data, { partial = false } = {}) {
  const errors = [];
  const has = (k) => Object.prototype.hasOwnProperty.call(data, k);

  if (!partial || has('name')) {
    if (!data.name || typeof data.name !== 'string' || !data.name.trim()) {
      errors.push('Name is required.');
    } else if (data.name.trim().length > MAX_NAME_LEN) {
      errors.push(`Name must be ${MAX_NAME_LEN} characters or fewer.`);
    }
  }

  if (!partial || has('category')) {
    if (!data.category || typeof data.category !== 'string' || !getCategoryKeys().has(data.category)) {
      errors.push('A valid category is required.');
    }
  }

  if (!partial || has('price')) {
    const p = Number(data.price);
    if (!Number.isFinite(p) || p <= 0) {
      errors.push('Price must be a positive number.');
    } else if (p > MAX_PRICE) {
      errors.push('Price is too high.');
    }
  }

  if (has('halfPrice') && data.halfPrice !== null && data.halfPrice !== '' && data.halfPrice !== undefined) {
    const hp = Number(data.halfPrice);
    if (!Number.isFinite(hp) || hp <= 0) errors.push('Half price must be a positive number.');
  }

  if (has('description') && data.description !== null && data.description !== undefined) {
    if (typeof data.description !== 'string' || data.description.length > MAX_DESC_LEN) {
      errors.push(`Description must be ${MAX_DESC_LEN} characters or fewer.`);
    }
  }

  if (has('veg') && data.veg !== null && typeof data.veg !== 'boolean') {
    errors.push('Veg/Non-Veg must be true, false, or null.');
  }

  for (const boolField of ['available', 'isNew', 'isSpecial']) {
    if (has(boolField) && typeof data[boolField] !== 'boolean') {
      errors.push(`\`${boolField}\` must be true or false.`);
    }
  }

  // Image must be null, or a path we generated ourselves via
  // uploadImage() below — never an arbitrary client-supplied path. This is
  // what stops path traversal / arbitrary file exposure through this field.
  if (has('image') && data.image !== null && data.image !== undefined) {
    if (typeof data.image !== 'string' || !/^images\/menu\/[a-f0-9]{16,}\.(jpg|jpeg|png|webp)$/i.test(data.image)) {
      errors.push('Invalid image reference.');
    }
  }

  return errors;
}

// ---------- Writes ----------

function generateId() {
  return `it-${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`;
}

function createItem(data) {
  const errors = validateItemInput(data, { partial: false });
  if (errors.length) return { errors };

  const now = new Date().toISOString();
  const item = {
    id: generateId(),
    name: data.name.trim(),
    description: data.description ? String(data.description).trim() : '',
    price: Number(data.price),
    halfPrice: data.halfPrice !== undefined && data.halfPrice !== null && data.halfPrice !== '' ? Number(data.halfPrice) : null,
    category: data.category,
    image: data.image || null,
    veg: data.veg === undefined ? true : data.veg,
    available: data.available === undefined ? true : data.available,
    isNew: data.isNew === true,
    isSpecial: data.isSpecial === true,
    approx: false,
    archived: false,
    createdAt: now,
    updatedAt: now
  };

  const store = readStore();
  store.items.push(item);
  writeStore(store);
  return { item };
}

function updateItem(id, patch) {
  const errors = validateItemInput(patch, { partial: true });
  if (errors.length) return { errors };

  const store = readStore();
  const idx = store.items.findIndex((i) => i.id === id);
  if (idx === -1) return { notFound: true };

  const current = store.items[idx];
  const next = { ...current };

  if (patch.name !== undefined) next.name = String(patch.name).trim();
  if (patch.description !== undefined) next.description = patch.description ? String(patch.description).trim() : '';
  if (patch.price !== undefined) next.price = Number(patch.price);
  if (patch.halfPrice !== undefined) {
    next.halfPrice = patch.halfPrice === null || patch.halfPrice === '' ? null : Number(patch.halfPrice);
  }
  if (patch.category !== undefined) next.category = patch.category;
  if (patch.image !== undefined) next.image = patch.image || null;
  if (patch.veg !== undefined) next.veg = patch.veg;
  if (patch.available !== undefined) next.available = patch.available;
  if (patch.isNew !== undefined) next.isNew = patch.isNew;
  if (patch.isSpecial !== undefined) next.isSpecial = patch.isSpecial;
  next.updatedAt = new Date().toISOString();

  store.items[idx] = next;
  writeStore(store);
  return { item: next };
}

function setArchived(id, archived) {
  const store = readStore();
  const idx = store.items.findIndex((i) => i.id === id);
  if (idx === -1) return { notFound: true };
  store.items[idx] = { ...store.items[idx], archived: !!archived, updatedAt: new Date().toISOString() };
  writeStore(store);
  return { item: store.items[idx] };
}

// ---------- Image upload ----------

const ALLOWED_IMAGE_TYPES = {
  'image/jpeg': { ext: 'jpg', magic: (buf) => buf.length > 2 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff },
  'image/png': { ext: 'png', magic: (buf) => buf.length > 7 && buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  'image/webp': { ext: 'webp', magic: (buf) => buf.length > 11 && buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP' }
};
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB

// Accepts a data URL (e.g. "data:image/webp;base64,....") and, if it's a
// genuinely safe image, writes it under public/images/menu/ with a
// server-generated random filename (never anything derived from what the
// client sent) and returns its relative path. Returns { error } instead if
// anything about it looks unsafe or malformed.
function saveImageFromDataUrl(dataUrl) {
  ensureStore();
  if (typeof dataUrl !== 'string') return { error: 'No image data provided.' };

  const match = /^data:([a-zA-Z0-9.+-]+\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(dataUrl.trim());
  if (!match) return { error: 'Image must be a base64 data URL.' };

  const [, mimeType, base64Data] = match;
  const spec = ALLOWED_IMAGE_TYPES[mimeType.toLowerCase()];
  if (!spec) return { error: 'Unsupported image format. Use JPG, PNG, or WebP.' };

  let buffer;
  try {
    buffer = Buffer.from(base64Data, 'base64');
  } catch {
    return { error: 'Could not decode image data.' };
  }

  if (buffer.length === 0 || buffer.length > MAX_IMAGE_BYTES) {
    return { error: 'Image must be under 5MB.' };
  }

  // Verify the actual file bytes match the claimed type — a renamed
  // executable or script wrapped in a fake data:image/... prefix will fail
  // this check and get rejected, regardless of what the client claimed.
  if (!spec.magic(buffer)) {
    return { error: 'File does not look like a valid image.' };
  }

  // Filename is entirely server-generated — the client never influences it,
  // which rules out path traversal or overwriting another file.
  const filename = `${crypto.randomBytes(12).toString('hex')}.${spec.ext}`;
  const filePath = path.join(IMAGES_DIR, filename);
  fs.writeFileSync(filePath, buffer);

  return { image: `images/menu/${filename}` };
}

module.exports = {
  getCategories,
  getCategoryKeys,
  getActiveItemsFlat,
  getAllItemsFlat,
  getItemById,
  getGroupedMenu,
  getStaticExtras,
  validateItemInput,
  createItem,
  updateItem,
  setArchived,
  saveImageFromDataUrl
};
