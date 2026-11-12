// Central error handler — safe messages only, never stack traces to clients.
 // eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  let status = err.statusCode || 500;
  let message = err.message || 'Server error';

  if (err.name === 'CastError') {
    status = 400;
    message = 'Invalid ID format';
  } else if (err.code === 11000) {
    status = 409;
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    message = `Duplicate value for ${field}`;
  } else if (err.name === 'ValidationError') {
    status = 400;
    message = Object.values(err.errors || {}).map((e) => e.message).join(', ') || 'Validation failed';
  }

  if (status === 500 && process.env.NODE_ENV !== 'test') {
    console.error(err);
  }

  res.status(status).json({ success: false, message, data: null });
}

module.exports = errorHandler;
