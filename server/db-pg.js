// Optional PostgreSQL data backend. Activates automatically when
// DATABASE_URL is set in .env — otherwise db.js uses db-json.js instead.
// Uses the 'pg' package, which is pure JavaScript (no native compile step),
// so it still installs fine in Termux.
//
// Schema: one table per collection, storing each record as a JSONB blob
// plus a couple of indexed columns for fast filtering. Simple by design —
// swap for a fuller relational schema later if you need real joins/reports.

const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

let ready = null;
function init() {
  if (!ready) {
    ready = pool.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY,
        created_at TIMESTAMPTZ NOT NULL,
        status TEXT NOT NULL,
        data JSONB NOT NULL
      );
      CREATE TABLE IF NOT EXISTS bookings (
        id TEXT PRIMARY KEY,
        created_at TIMESTAMPTZ NOT NULL,
        status TEXT NOT NULL,
        data JSONB NOT NULL
      );
      CREATE TABLE IF NOT EXISTS payments (
        id TEXT PRIMARY KEY,
        created_at TIMESTAMPTZ NOT NULL,
        status TEXT NOT NULL,
        data JSONB NOT NULL
      );

      -- Speeds up the report/top-items queries and the booking-capacity
      -- check, which filter on these fields constantly.
      CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders (created_at);
      CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (status);
      CREATE INDEX IF NOT EXISTS idx_orders_payment_id ON orders ((data->>'paymentId'));
      CREATE UNIQUE INDEX IF NOT EXISTS uniq_orders_payment_id ON orders ((data->>'paymentId'));
      CREATE INDEX IF NOT EXISTS idx_bookings_date_time ON bookings ((data->>'date'), (data->>'time'));
      CREATE INDEX IF NOT EXISTS idx_payments_status ON payments (status);
      CREATE INDEX IF NOT EXISTS idx_payments_razorpay_payment_id ON payments ((data->>'razorpayPaymentId'));
    `);
  }
  return ready;
}

async function insert(collection, record) {
  await init();
  await pool.query(
    `INSERT INTO ${collection} (id, created_at, status, data) VALUES ($1, $2, $3, $4)`,
    [record.id, record.createdAt, record.status, record]
  );
  return record;
}

async function updateById(collection, id, patch) {
  await init();
  const { rows } = await pool.query(`SELECT data FROM ${collection} WHERE id = $1`, [id]);
  if (rows.length === 0) return null;
  const updated = { ...rows[0].data, ...patch };
  await pool.query(`UPDATE ${collection} SET data = $1, status = $2 WHERE id = $3`, [
    updated,
    updated.status,
    id
  ]);
  return updated;
}

async function all(collection) {
  await init();
  const { rows } = await pool.query(`SELECT data FROM ${collection} ORDER BY created_at DESC`);
  return rows.map((r) => r.data);
}

// Atomic "compare-and-swap" update: a single UPDATE ... WHERE ... RETURNING
// statement, so the "does the field still match" check and the write
// happen inside one row-level operation — Postgres's own row locking
// during UPDATE makes this safe even across multiple server instances
// hitting the same database at once (unlike the JSON backend's in-process
// mutex, which only protects a single process). Used for payment-status
// transitions (see routes/orders.js verify-upi/reject-upi): two concurrent
// admin requests racing to transition the same order can't both succeed —
// only the one that still sees `expectedValue` at commit time updates the
// row; the other gets null back and a 409. `field` is only ever passed in
// from trusted call sites (never request input), so this is not
// SQL-injectable despite not being a bound parameter.
async function updateByIdIfFieldEquals(collection, id, field, expectedValue, patch) {
  await init();
  // Defense in depth: `field` should only ever come from trusted call
  // sites, never request input — but since it's interpolated into the
  // query text (Postgres doesn't support parameterized identifiers), this
  // whitelist makes sure a coding mistake elsewhere can never turn it into
  // a SQL-injection vector.
  const allowedFields = ['paymentStatus', 'status'];
  if (!allowedFields.includes(field)) {
    throw new Error(`updateByIdIfFieldEquals: unsupported field "${field}"`);
  }
  const { rows } = await pool.query(
    `UPDATE ${collection}
     SET data = data || $1::jsonb
     WHERE id = $2 AND data->>'${field}' = $3
     RETURNING data`,
    [JSON.stringify(patch), id, expectedValue]
  );
  return rows[0] ? rows[0].data : null;
}

// Atomic "check capacity, then insert" for table bookings, using a
// Postgres advisory lock scoped to this exact date+time slot. Two
// concurrent requests for the SAME slot serialize on the lock (one waits
// for the other to commit or roll back); requests for DIFFERENT slots
// don't block each other at all. This is what makes the capacity check
// safe even with multiple server instances talking to the same database
// (the in-process JS mutex in db-json.js only protects a single process).
async function insertBookingIfCapacity(record, totalTables) {
  await init();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // pg_advisory_xact_lock auto-releases at COMMIT/ROLLBACK — no separate
    // unlock call needed, and it can't leak a held lock if the process dies.
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`${record.date}|${record.time}`]);

    const { rows } = await client.query(
      `SELECT COUNT(*)::int AS cnt FROM bookings
       WHERE data->>'date' = $1 AND data->>'time' = $2 AND status != 'cancelled'`,
      [record.date, record.time]
    );

    if (rows[0].cnt >= totalTables) {
      await client.query('ROLLBACK');
      return null; // slot full
    }

    await client.query(
      `INSERT INTO bookings (id, created_at, status, data) VALUES ($1, $2, $3, $4)`,
      [record.id, record.createdAt, record.status, record]
    );
    await client.query('COMMIT');
    return record;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { insert, updateById, all, insertBookingIfCapacity, updateByIdIfFieldEquals };
