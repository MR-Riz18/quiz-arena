const jwt = require('jsonwebtoken');
const asyncHandler = require('../utils/asyncHandler');
const { ApiError } = require('../utils/response');
const User = require('../models/User');

// Reads the JWT from the httpOnly `token` cookie and attaches req.user.
// 401 when missing, invalid, expired, or the account is disabled.
const protect = asyncHandler(async (req, res, next) => {
  const token = req.cookies && req.cookies.token;
  if (!token) throw new ApiError(401, 'Not authenticated');

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    throw new ApiError(401, 'Session expired — please log in again');
  }

  const user = await User.findById(decoded.id).select('-passwordHash');
  if (!user || !user.isActive) throw new ApiError(401, 'Account is disabled');

  req.user = user;
  next();
});

// Optional auth: attaches req.user when a valid session cookie is present,
// otherwise continues anonymously. Used by public endpoints that personalize
// when logged in (e.g. leaderboards include `me`).
const optionalAuth = asyncHandler(async (req, res, next) => {
  const token = req.cookies && req.cookies.token;
  if (!token) return next();
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-passwordHash');
    if (user && user.isActive) req.user = user;
  } catch (err) {
    // ignore — anonymous
  }
  next();
});

// Signs a fresh 8h token for a user.
function signToken(user) {
  if (!process.env.JWT_SECRET) {
    throw new ApiError(500, 'Server is missing JWT_SECRET — set it in server/.env and restart the server');
  }
  return jwt.sign(
    { id: user._id.toString(), role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE || '8h' }
  );
}

module.exports = { protect, optionalAuth, signToken };
