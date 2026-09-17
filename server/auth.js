// Simple signed-token auth for the admin dashboard. Not a full session
// store — it's a stateless HMAC token with an expiry, which is enough for
// a single-owner dashboard and a real improvement over sending the raw
// password on every request.

const crypto = require('crypto');

const isProduction = process.env.NODE_ENV === 'production';

// In production, an unset ADMIN_TOKEN_SECRET must not silently fall back to
// something guessable (the admin password, or a hardcoded dev string) —
// that would let anyone who ever saw the password reuse it to forge tokens
// indefinitely, even after a password change. checkStartupSecret() is
// called once at boot (see index.js) and refuses to start if this isn't set.
function checkStartupSecret() {
  if (isProduction && !process.env.ADMIN_TOKEN_SECRET) {
    console.error(
      '\n✗ ADMIN_TOKEN_SECRET is not set. Refusing to start in production.\n' +
      '  Generate one with: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"\n' +
      '  and add it to your .env as ADMIN_TOKEN_SECRET=...\n'
    );
    process.exit(1);
  }
  if (!isProduction && !process.env.ADMIN_TOKEN_SECRET) {
    console.warn('⚠️  ADMIN_TOKEN_SECRET not set — using an insecure dev-only fallback. Fine for local testing only.');
  }
}

function getSecret() {
  return process.env.ADMIN_TOKEN_SECRET || process.env.ADMIN_PASSWORD || 'dev-only-insecure-secret';
}

const TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

function createToken() {
  const expires = Date.now() + TOKEN_TTL_MS;
  const payload = `${expires}`;
  const sig = crypto.createHmac('sha256', getSecret()).update(payload).digest('hex');
  return Buffer.from(`${payload}.${sig}`).toString('base64url');
}

function verifyToken(token) {
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf-8');
    const [payload, sig] = decoded.split('.');
    if (!payload || !sig) return false;

    const expectedSig = crypto.createHmac('sha256', getSecret()).update(payload).digest('hex');
    const sigBuf = Buffer.from(sig, 'utf-8');
    const expBuf = Buffer.from(expectedSig, 'utf-8');
    const sigOk = sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf);
    if (!sigOk) return false;

    const expires = Number(payload);
    return Number.isFinite(expires) && Date.now() < expires;
  } catch {
    return false;
  }
}

function requireAdmin(req, res, next) {
  const header = req.header('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token || !verifyToken(token)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

module.exports = { createToken, verifyToken, requireAdmin, checkStartupSecret };
