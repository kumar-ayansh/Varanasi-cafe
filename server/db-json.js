// Default data backend: a JSON file on disk. No native modules, so it
// installs cleanly in Termux. Fine for a single small cafe's traffic.
// Used automatically unless DATABASE_URL is set (see db.js).

const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'db.json');

function ensureDb() {
  if (!fs.existsSync(DB_PATH)) {
    const initial = { orders: [], bookings: [], payments: [] };
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    fs.writeFileSync(DB_PATH, JSON.stringify(initial, null, 2));
  }
}

function readDb() {
  ensureDb();
  const raw = fs.readFileSync(DB_PATH, 'utf-8');
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    data = { orders: [], bookings: [] };
  }
  // Backfill collections added after this db.json file was first created,
  // so upgrading the app doesn't crash on an older data file.
  if (!Array.isArray(data.orders)) data.orders = [];
  if (!Array.isArray(data.bookings)) data.bookings = [];
  if (!Array.isArray(data.payments)) data.payments = [];
  return data;
}

function writeDb(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

async function insert(collection, record) {
  const db = readDb();
  db[collection].push(record);
  writeDb(db);
  return record;
}

async function updateById(collection, id, patch) {
  const db = readDb();
  const idx = db[collection].findIndex((r) => r.id === id);
  if (idx === -1) return null;
  db[collection][idx] = { ...db[collection][idx], ...patch };
  writeDb(db);
  return db[collection][idx];
}

async function all(collection) {
  return readDb()[collection];
}

// Atomic "compare-and-swap" update: only applies `patch` if the record's
// current value at `field` still equals `expectedValue` at the moment of
// the write. Used for payment-status transitions (see routes/orders.js
// verify-upi/reject-upi) so that two concurrent admin requests racing to
// transition the same order can't both succeed — e.g. one "verify" and
// one "reject" landing at the same instant. Routed through the same
// in-process mutex as insertBookingIfCapacity below, for the same reason:
// `await` yields to the event loop, so a plain read-check-write here could
// still interleave between two concurrent request handlers without it.
// Returns the updated record on success, or null if the record didn't
// exist or the CAS check failed (someone else already transitioned it).
let updateMutex = Promise.resolve();

function updateByIdIfFieldEquals(collection, id, field, expectedValue, patch) {
  const run = () => {
    const data = readDb();
    const idx = data[collection].findIndex((r) => r.id === id);
    if (idx === -1) return null;
    if (data[collection][idx][field] !== expectedValue) return null;
    data[collection][idx] = { ...data[collection][idx], ...patch };
    writeDb(data);
    return data[collection][idx];
  };
  const result = updateMutex.then(run, run);
  updateMutex = result.then(() => undefined, () => undefined);
  return result;
}

// Atomic "check capacity, then insert" for table bookings. The naive version
// of this (count active bookings, then insert if under capacity) has a race:
// two simultaneous requests can both read the same count before either has
// written, so both pass the check and the table gets double-booked.
//
// Node is single-threaded, but `await` still yields to the event loop, so
// two concurrent request handlers CAN interleave between an async count and
// a later async insert. The fix here is a simple in-process mutex: every
// call to this function is queued onto the same promise chain, so the
// count-then-insert for one booking always finishes before the next one
// starts. That's enough for a single Node process (which is exactly how
// this JSON-file backend is meant to run — see db.js).
let bookingMutex = Promise.resolve();

function insertBookingIfCapacity(record, totalTables) {
  const run = () => {
    const data = readDb();
    const activeCount = data.bookings.filter(
      (b) => b.date === record.date && b.time === record.time && b.status !== 'cancelled'
    ).length;
    if (activeCount >= totalTables) return null; // slot full
    data.bookings.push(record);
    writeDb(data);
    return record;
  };
  const result = bookingMutex.then(run, run);
  // Keep the chain alive even if this attempt threw, so a later booking
  // isn't stuck waiting on a rejected promise forever.
  bookingMutex = result.then(() => undefined, () => undefined);
  return result;
}

module.exports = { insert, updateById, all, insertBookingIfCapacity, updateByIdIfFieldEquals, DB_PATH };
