// Distributed rate limiting. Backed by Redis (shared across every Node.js
// instance/process behind a load balancer) when REDIS_URL is set; falls
// back to the original per-process in-memory counter when it isn't, or
// when Redis is briefly unreachable.
//
// FAILURE POLICY — this is the important part: a Redis outage must never
// silently disable rate limiting. If a Redis command fails or times out,
// this module does NOT let the request through unchecked — it falls back
// to counting that same request against the in-process in-memory limiter
// (the exact mechanism this file replaces) and logs the Redis failure
// server-side. That means during a Redis outage, limits briefly stop being
// shared across instances (each instance enforces its own copy again) —
// degraded, but never off. Nothing about a Redis failure is ever shown to
// the customer; they just see the same 429 (or a normal response) they
// always would.

const crypto = require('crypto');

let Redis;
try {
  Redis = require('ioredis');
} catch {
  Redis = null; // ioredis isn't installed — treated the same as REDIS_URL not being set.
}

const REDIS_URL = process.env.REDIS_URL;

let redisClient = null;
let redisWarnedDown = false; // avoid spamming the log every single request during an outage

if (REDIS_URL && Redis) {
  redisClient = new Redis(REDIS_URL, {
    // Fail fast rather than queueing/hanging a request while Redis is
    // down — a slow rate-limit check must never make the whole API feel
    // broken. Falls back to the in-memory limiter (see below) instead.
    connectTimeout: 2000,
    commandTimeout: 500,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    lazyConnect: true,
    retryStrategy(times) {
      // Keep trying to reconnect in the background, capped backoff.
      return Math.min(times * 500, 10000);
    }
  });

  redisClient.on('error', (err) => {
    // ioredis emits 'error' liberally (including transient ones); avoid
    // flooding the log, but always make sure an operator can see it.
    if (!redisWarnedDown) {
      console.error('⚠️  Redis rate-limit backend error — falling back to per-process limiting until it recovers:', err.message);
      redisWarnedDown = true;
    }
  });
  redisClient.on('ready', () => {
    if (redisWarnedDown) {
      console.log('✓ Redis rate-limit backend reconnected.');
      redisWarnedDown = false;
    }
  });
  redisClient.connect().catch((err) => {
    console.error('⚠️  Could not connect to REDIS_URL at startup — rate limiting will run in per-process fallback mode until Redis is reachable:', err.message);
  });
} else if (!REDIS_URL) {
  console.warn(
    '⚠️  REDIS_URL not set — rate limiting will run per-process only, not shared across ' +
    'multiple instances/a load balancer. Fine for a single Node.js instance; set REDIS_URL ' +
    'before scaling horizontally.'
  );
}

// Atomic fixed-window counter: INCR then, only on the first hit in this
// window, set the expiry — both inside one Lua script so two requests
// racing at the very start of a window can't both "win" the PEXPIRE step
// (the same atomicity concern as the payment-status CAS elsewhere in this
// project, just against Redis instead of Postgres/JSON).
const INCR_AND_MAYBE_EXPIRE = `
local current = redis.call('INCR', KEYS[1])
if tonumber(current) == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
return current
`;

// Per-process fallback store — identical in behavior to the limiter this
// file replaces. Used whenever Redis is not configured, not reachable, or
// a command fails/times out.
const fallbackHitLog = new Map(); // key -> [timestamps]
function fallbackCheck(key, max, windowMs) {
  const now = Date.now();
  const hits = (fallbackHitLog.get(key) || []).filter((t) => now - t < windowMs);
  const allowed = hits.length < max;
  if (allowed) {
    hits.push(now);
    fallbackHitLog.set(key, hits);
  }
  return allowed;
}

// IPv4/IPv6 (with optional zone id) character set only. req.ip comes from
// Express/Node's own connection handling — not read from any
// client-controlled header unless the app explicitly sets `trust proxy`
// (it doesn't, see index.js) — so this is a defense-in-depth sanity check,
// not the only thing standing between a client and an arbitrary Redis key.
// Anything that doesn't look like a real IP falls back to a single shared
// bucket rather than letting unexpected input become part of a key.
const IP_PATTERN = /^[0-9a-fA-F:.%]{1,45}$/;

function safeIpKeyPart(ip) {
  return typeof ip === 'string' && IP_PATTERN.test(ip) ? ip : 'unknown';
}

// bucket identifies which limit this is (e.g. "upi-status", "create-order")
// — always a hardcoded string from the call site below, never derived from
// request input, so the resulting Redis key can never be attacker-chosen.
function createRateLimiter(bucket, max, windowMs) {
  return async function rateLimitMiddleware(req, res, next) {
    const ipPart = safeIpKeyPart(req.ip);
    const key = `rl:${bucket}:${ipPart}`;

    if (redisClient && redisClient.status === 'ready') {
      try {
        const count = await redisClient.eval(INCR_AND_MAYBE_EXPIRE, 1, key, windowMs);
        if (count > max) {
          return res.status(429).json({ error: 'Too many requests. Please wait a bit and try again.' });
        }
        return next();
      } catch (err) {
        // Redis reachable-but-erroring on this specific command (timeout,
        // etc). Don't let the request through unchecked — fall back.
        console.error(`Rate-limit Redis command failed for bucket "${bucket}" — using per-process fallback for this request:`, err.message);
      }
    }

    // Redis not configured, not connected, or the command above failed.
    const allowed = fallbackCheck(`${bucket}:${ipPart}`, max, windowMs);
    if (!allowed) {
      return res.status(429).json({ error: 'Too many requests. Please wait a bit and try again.' });
    }
    return next();
  };
}

module.exports = { createRateLimiter };
