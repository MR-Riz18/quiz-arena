// Consistent JSON envelope: { success, message, data }
class ApiError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

const ok = (res, data = null, message = 'OK', statusCode = 200) =>
  res.status(statusCode).json({ success: true, message, data });

const created = (res, data = null, message = 'Created') => ok(res, data, message, 201);

module.exports = { ApiError, ok, created };
