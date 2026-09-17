// One-off migration: copies every record currently in data/db.json into
// PostgreSQL. Run this ONCE when you're ready to move an existing
// Termux/JSON deployment onto Postgres.
//
//   node server/migrate-json-to-pg.js
//
// Requirements:
// - DATABASE_URL must be set in your environment (or .env) — this script
//   refuses to run without it, since there's nothing to migrate TO otherwise.
// - data/db.json must exist (if it doesn't, there's nothing to migrate;
//   the script says so and exits cleanly — a fresh Postgres deployment
//   just starts empty, same as a fresh JSON one would).
//
// Safety:
// - This script only ever INSERTs. It never deletes, truncates, or
//   modifies data/db.json — you can re-run it as many times as you like.
// - Each insert uses ON CONFLICT (id) DO NOTHING, so re-running after a
//   partial run (or after the JSON file has gained a few more orders since
//   your first migration) only inserts what's actually new — existing
//   Postgres rows are left untouched, never overwritten.
// - Nothing here changes which backend the app actually uses at runtime —
//   that's still decided by db.js (Postgres if DATABASE_URL is set, JSON
//   otherwise). This script just copies data across; you flip DATABASE_URL
//   on for the live app whenever you're ready.

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const JSON_DB_PATH = path.join(__dirname, '..', 'data', 'db.json');

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error(
      '✗ DATABASE_URL is not set. Set it (in your environment or .env) to the\n' +
      '  Postgres connection string you want to migrate INTO, then re-run this script.'
    );
    process.exit(1);
  }

  if (!fs.existsSync(JSON_DB_PATH)) {
    console.log('No data/db.json found — nothing to migrate. A fresh Postgres deployment will just start empty.');
    process.exit(0);
  }

  const raw = fs.readFileSync(JSON_DB_PATH, 'utf-8');
  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    console.error('✗ data/db.json exists but is not valid JSON — refusing to migrate from a corrupt file.', err.message);
    process.exit(1);
  }

  const collections = ['orders', 'bookings', 'payments'];
  for (const c of collections) {
    if (!Array.isArray(data[c])) data[c] = [];
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  // Same table/index setup the app itself creates on startup (see
  // db-pg.js) — running it here too means this script works even against
  // a completely fresh, empty Postgres database, before the app has ever
  // been started against it.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY, created_at TIMESTAMPTZ NOT NULL, status TEXT NOT NULL, data JSONB NOT NULL
    );
    CREATE TABLE IF NOT EXISTS bookings (
      id TEXT PRIMARY KEY, created_at TIMESTAMPTZ NOT NULL, status TEXT NOT NULL, data JSONB NOT NULL
    );
    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY, created_at TIMESTAMPTZ NOT NULL, status TEXT NOT NULL, data JSONB NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders (created_at);
    CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (status);
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_orders_payment_id ON orders ((data->>'paymentId'));
    CREATE INDEX IF NOT EXISTS idx_bookings_date_time ON bookings ((data->>'date'), (data->>'time'));
    CREATE INDEX IF NOT EXISTS idx_payments_status ON payments (status);
    CREATE INDEX IF NOT EXISTS idx_payments_razorpay_payment_id ON payments ((data->>'razorpayPaymentId'));
  `);

  const summary = {};
  for (const collection of collections) {
    let inserted = 0;
    let skipped = 0;
    for (const record of data[collection]) {
      if (!record || !record.id) { skipped++; continue; }
      const result = await pool.query(
        `INSERT INTO ${collection} (id, created_at, status, data)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (id) DO NOTHING`,
        [record.id, record.createdAt || new Date().toISOString(), record.status || 'unknown', record]
      );
      if (result.rowCount > 0) inserted++;
      else skipped++; // already existed in Postgres — left untouched
    }
    summary[collection] = { total: data[collection].length, inserted, skipped };
  }

  await pool.end();

  console.log('\nMigration complete. data/db.json was NOT modified or deleted.\n');
  for (const [collection, s] of Object.entries(summary)) {
    console.log(`  ${collection}: ${s.total} in JSON — ${s.inserted} inserted, ${s.skipped} already present / skipped`);
  }
  console.log('\nNext step: set DATABASE_URL in your production .env and restart the server — it will pick up Postgres automatically (see server/db.js).');
}

main().catch((err) => {
  console.error('✗ Migration failed:', err);
  process.exit(1);
});
