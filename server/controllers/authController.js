const asyncHandler = require('../utils/asyncHandler');
const { ApiError, ok, created } = require('../utils/response');
const { signToken } = require('../middleware/auth');
const { setTokenCookie, clearTokenCookie } = require('../utils/cookies');
const User = require('../models/User');

const register = asyncHandler(async (req, res) => {
  const { username, email, password } = req.body || {};
  if (!username || !email || !password) throw new ApiError(400, 'Username, email and password are required');

  const emailTaken = await User.findOne({ email: String(email).toLowerCase() }).select('_id').lean();
  if (emailTaken) throw new ApiError(409, 'Email is already registered');
  const nameTaken = await User.findOne({ username: String(username).trim() }).select('_id').lean();
  if (nameTaken) throw new ApiError(409, 'Username is already taken');

  const user = new User({ username: String(username).trim(), email: String(email).toLowerCase().trim() });
  user.password = password; // virtual setter -> bcrypt(10) in pre('validate')
  await user.save();

  setTokenCookie(res, signToken(user));
  created(res, { user: user.toSafeJSON(true) }, 'Registered successfully');
});

const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) throw new ApiError(400, 'Email and password are required');

  const user = await User.findOne({ email: String(email).toLowerCase() }).select('+passwordHash');
  if (!user || !(await user.comparePassword(password))) {
    throw new ApiError(401, 'Invalid email or password');
  }
  if (!user.isActive) throw new ApiError(401, 'Account is disabled');

  setTokenCookie(res, signToken(user));
  ok(res, { user: user.toSafeJSON(true) }, 'Logged in successfully');
});

const logout = asyncHandler(async (req, res) => {
  clearTokenCookie(res);
  ok(res, null, 'Logged out');
});

const me = asyncHandler(async (req, res) => {
  ok(res, { user: req.user.toSafeJSON(true) });
});

const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) throw new ApiError(400, 'Current and new passwords are required');

  const user = await User.findById(req.user._id).select('+passwordHash');
  if (!(await user.comparePassword(currentPassword))) {
    throw new ApiError(401, 'Current password is incorrect');
  }
  user.password = newPassword; // virtual setter -> bcrypt(10)
  await user.save();
  ok(res, null, 'Password changed');
});

module.exports = { register, login, logout, me, changePassword };
