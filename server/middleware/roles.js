const { ApiError } = require('../utils/response');

// Role gate: authorize('admin'), authorize('player','admin'), ...
const authorize = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    throw new ApiError(403, 'Forbidden');
  }
  next();
};

module.exports = { authorize };
