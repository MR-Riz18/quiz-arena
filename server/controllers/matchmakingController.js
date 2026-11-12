const asyncHandler = require('../utils/asyncHandler');
const { ApiError, ok } = require('../utils/response');
const User = require('../models/User');

function getMatchmaker(req) {
  const mm = req.app.get('matchmaker');
  if (!mm) throw new ApiError(503, 'Matchmaking is currently unavailable');
  return mm;
}

// POST /api/matchmaking/join — enter the quick-match queue.
// Body: { mode: 'competitive'|'casual', category: categoryId|'mixed' }
// 409 when already queued or already in a live match.
const joinQueue = asyncHandler(async (req, res) => {
  const mm = getMatchmaker(req);
  const user = await User.findById(req.user._id).select('username avatar rating');
  if (!user) throw new ApiError(401, 'Account not found');

  const { mode, category } = req.body || {};
  const result = await mm.join({
    userId: req.user._id,
    username: user.username,
    avatar: user.avatar,
    rating: user.rating,
    mode,
    category,
  });

  if (result.matched) {
    return ok(res, { matched: true, position: 0 }, 'Match found! Check your notifications.');
  }
  ok(res, { matched: false, position: result.position }, 'Added to the matchmaking queue');
});

// POST /api/matchmaking/cancel — leave the queue (idempotent).
const cancelQueue = asyncHandler(async (req, res) => {
  const mm = getMatchmaker(req);
  const removed = mm.leave(req.user._id);
  ok(res, { removed }, removed ? 'Left the matchmaking queue' : 'You were not in the queue');
});

// GET /api/matchmaking/status — am I queued, and at which position?
const queueStatus = asyncHandler(async (req, res) => {
  const mm = getMatchmaker(req);
  ok(res, mm.status(req.user._id));
});

module.exports = { joinQueue, cancelQueue, queueStatus };
