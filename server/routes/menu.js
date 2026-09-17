const express = require('express');
const router = express.Router();
const asyncHandler = require('../asyncHandler');
const settings = require('../settings');
const menuStore = require('../menu-store');

// ---- Public endpoint ----

router.get('/', asyncHandler(async (req, res) => {
  const { happyHours, loyalty } = menuStore.getStaticExtras();
  res.json({
    menu: menuStore.getGroupedMenu(),
    categories: menuStore.getCategories(),
    happyHours,
    loyalty,
    todaysSpecial: settings.getTodaysSpecial()
  });
}));

// ---- Admin-only endpoints (mounted behind requireAdmin in server/index.js) ----

// Full flat item list, including archived items — feeds the admin Menu
// Management table. (The public GET / above only ever returns non-archived
// items, grouped by category.)
router.get('/items', asyncHandler(async (req, res) => {
  res.json({ items: menuStore.getAllItemsFlat(), categories: menuStore.getCategories() });
}));

// Full item creation — the "+ Add New Item" flow in the admin dashboard.
router.post('/items', asyncHandler(async (req, res) => {
  const { errors, item } = menuStore.createItem(req.body || {});
  if (errors) return res.status(400).json({ error: errors[0], errors });
  res.status(201).json({ item });
}));

// Full item edit — name/description/price/category/image/veg/available/NEW/SPECIAL,
// any subset of fields. Server-side validation runs regardless of what the
// client already checked.
router.put('/items/:id', asyncHandler(async (req, res) => {
  const { errors, item, notFound } = menuStore.updateItem(req.params.id, req.body || {});
  if (notFound) return res.status(404).json({ error: 'Item not found.' });
  if (errors) return res.status(400).json({ error: errors[0], errors });
  res.json({ item });
}));

// Quick toggles used by the per-row buttons in the admin menu table.
router.patch('/items/:id/availability', asyncHandler(async (req, res) => {
  const { available } = req.body;
  if (typeof available !== 'boolean') return res.status(400).json({ error: '`available` must be true or false.' });
  const { item, notFound } = menuStore.updateItem(req.params.id, { available });
  if (notFound) return res.status(404).json({ error: 'Item not found.' });
  res.json({ item });
}));

router.patch('/items/:id/new', asyncHandler(async (req, res) => {
  const { isNew } = req.body;
  if (typeof isNew !== 'boolean') return res.status(400).json({ error: '`isNew` must be true or false.' });
  const { item, notFound } = menuStore.updateItem(req.params.id, { isNew });
  if (notFound) return res.status(404).json({ error: 'Item not found.' });
  res.json({ item });
}));

router.patch('/items/:id/special', asyncHandler(async (req, res) => {
  const { isSpecial } = req.body;
  if (typeof isSpecial !== 'boolean') return res.status(400).json({ error: '`isSpecial` must be true or false.' });
  const { item, notFound } = menuStore.updateItem(req.params.id, { isSpecial });
  if (notFound) return res.status(404).json({ error: 'Item not found.' });
  res.json({ item });
}));

// Archive (soft delete) — keeps order history intact (orders store their
// own snapshot of name/price already, see orderService.js) while removing
// the item from the customer-facing menu. Restorable from the same screen.
router.delete('/items/:id', asyncHandler(async (req, res) => {
  const { item, notFound } = menuStore.setArchived(req.params.id, true);
  if (notFound) return res.status(404).json({ error: 'Item not found.' });
  res.json({ item });
}));

router.patch('/items/:id/restore', asyncHandler(async (req, res) => {
  const { item, notFound } = menuStore.setArchived(req.params.id, false);
  if (notFound) return res.status(404).json({ error: 'Item not found.' });
  res.json({ item });
}));

// Image upload — accepts a base64 data URL, validates it's a genuine
// JPG/PNG/WebP (magic-byte checked, not just trusted by extension/mimetype),
// and stores it under public/images/menu/ with a server-generated filename.
// See server/index.js for the larger JSON body limit granted to this path.
router.post('/images', asyncHandler(async (req, res) => {
  const { image } = req.body || {};
  const result = menuStore.saveImageFromDataUrl(image);
  if (result.error) return res.status(400).json({ error: result.error });
  res.status(201).json({ image: result.image });
}));

// ---- Legacy endpoint, kept for backward compatibility ----
// (superseded by PATCH /items/:id/availability above, same behavior)
router.patch('/:id/availability', asyncHandler(async (req, res) => {
  const { available } = req.body;
  if (typeof available !== 'boolean') return res.status(400).json({ error: '`available` must be true or false.' });
  const { item, notFound } = menuStore.updateItem(req.params.id, { available });
  if (notFound) return res.status(404).json({ error: 'Item not found.' });
  res.json({ itemAvailability: { [req.params.id]: available } });
}));

router.put('/today-special', asyncHandler(async (req, res) => {
  const { title, description } = req.body;
  if (!title) {
    const cleared = settings.setTodaysSpecial(null);
    return res.json({ todaysSpecial: cleared });
  }
  const special = { title: String(title).trim().slice(0, 80), description: String(description || '').trim().slice(0, 200) };
  const saved = settings.setTodaysSpecial(special);
  res.json({ todaysSpecial: saved });
}));

module.exports = router;
