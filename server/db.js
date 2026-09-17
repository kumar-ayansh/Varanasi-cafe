// Picks the data backend: PostgreSQL if DATABASE_URL is set (see db-pg.js),
// otherwise the local JSON file (see db-json.js, the Termux-friendly default).
// Routes only ever import this file, never the backends directly, so the
// choice is transparent to the rest of the app.

module.exports = process.env.DATABASE_URL ? require('./db-pg') : require('./db-json');
