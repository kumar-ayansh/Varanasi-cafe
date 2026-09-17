// Express 4 doesn't automatically catch rejected promises thrown inside
// async route handlers — an unhandled `await db.all(...)` failure would
// otherwise just hang the request (or, in some Node versions, crash the
// process via 'unhandledRejection'). Wrapping handlers with this forwards
// any rejection to Express's error-handling middleware (see index.js),
// which logs it and returns a safe generic error instead.
module.exports = function asyncHandler(fn) {
  return function (req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
