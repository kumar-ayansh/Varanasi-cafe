const express = require('express');
const router = express.Router();
const asyncHandler = require('../asyncHandler');
const settings = require('../settings');

// ---- Public endpoint ----
// Customers can only READ the public UPI payment configuration. Returns
// { enabled: false } (nothing else) whenever UPI hasn't been configured/
// turned on, so the checkout page never shows a half-set-up option.
router.get('/settings', asyncHandler(async (req, res) => {
  res.json(settings.getUpiSettingsForCustomer());
}));

// ---- Admin-only endpoints (mounted behind requireAdmin in server/index.js) ----

// Full settings (including when disabled) — feeds the admin "UPI Payment
// Settings" screen so the admin can configure everything before turning it on.
router.get('/admin-settings', asyncHandler(async (req, res) => {
  res.json(settings.getUpiSettingsForAdmin());
}));

router.put('/settings', asyncHandler(async (req, res) => {
  const { upiId, businessName, enabled, qrImage } = req.body || {};
  const result = settings.setUpiSettings({ upiId, businessName, enabled, qrImage });
  if (result.error) return res.status(400).json({ error: result.error });
  res.json({ upi: result.upi });
}));

// QR image upload — same careful handling as menu image uploads: a base64
// data URL, magic-byte verified, stored under public/images/upi/ with a
// server-generated filename. See server/index.js for the larger JSON body
// limit granted to this path.
router.post('/qr-image', asyncHandler(async (req, res) => {
  const { image } = req.body || {};
  const result = settings.saveUpiQrImage(image);
  if (result.error) return res.status(400).json({ error: result.error });
  res.status(201).json({ image: result.image });
}));

module.exports = router;
