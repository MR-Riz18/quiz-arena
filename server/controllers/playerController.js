const asyncHandler = require('../utils/asyncHandler');
const { ApiError, ok } = require('../utils/response');
const Match = require('../models/Match');
const User = require('../models/User');
const Category = require('../models/Category');

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

// One history row for a completed match, from the requester's perspective.
function shapeHistoryRow(match, uid) {
  const m = match.toObject ? match.toObject() : match;
  const id = m._id.toString();
  const placement = (m.placements || []).find((p) => p.userId.toString() === uid);
  const opponents = (m.playerSnapshots || [])
    .filter((p) => p.userId.toString() !== uid)
    .map((p) => ({ username: p.username, avatar: p.avatar }));
  const rc = (m.ratingChanges || []).find((r) => r.userId.toString() === uid);
  const scores = m.scores instanceof Map ? Object.fromEntries(m.scores) : m.scores || {};
  const durationSec =
    m.startedAt && m.completedAt ? Math.round((new Date(m.completedAt) - new Date(m.startedAt)) / 1000) : 0;
  return {
    id,
    mode: m.mode,
    rated: !!m.rated,
    forfeit: !!m.forfeit,
    categoryId: m.categoryId || 'mixed',
    date: m.completedAt || m.createdAt,
    durationSec,
    questionCount: (m.questionIds || []).length,
    opponents,
    myRank: placement ? placement.rank : null,
    myScore: scores[uid] || 0,
    result: placement ? (placement.rank === 1 ? 'win' : 'loss') : null,
    ratingDelta: rc ? rc.delta : null,
  };
}

// GET /api/players/me/matches — my completed match history.
// Query: ?mode=casual|competitive&result=win|loss&page=&limit=
const myMatches = asyncHandler(async (req, res) => {
  const uid = req.user._id.toString();
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(req.query.limit, 10) || DEFAULT_LIMIT));

  const filter = { players: req.user._id, state: 'completed' };
  if (req.query.mode && ['casual', 'competitive'].includes(req.query.mode)) {
    filter.mode = req.query.mode;
  }

  let matches = await Match.find(filter).sort({ completedAt: -1 }).lean();
  let rows = matches.map((m) => shapeHistoryRow(m, uid));
  if (req.query.result && ['win', 'loss'].includes(req.query.result)) {
    rows = rows.filter((r) => r.result === req.query.result);
  }

  const total = rows.length;
  rows = rows.slice((page - 1) * limit, page * limit);
  ok(res, { matches: rows, page, limit, total, totalPages: Math.ceil(total / limit) });
});

// GET /api/players/:username — public profile. No email, ever.
const publicProfile = asyncHandler(async (req, res) => {
  const user = await User.findOne({ username: req.params.username }).select('-passwordHash -email');
  if (!user) throw new ApiError(404, 'Player not found');
  const uid = user._id.toString();
  const s = user.stats || {};
  const matchesPlayed = s.matchesPlayed || 0;

  // Favorite categories: top 2 by completed matches.
  const favAgg = await Match.aggregate([
    { $match: { players: user._id, state: 'completed' } },
    { $group: { _id: '$categoryId', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 2 },
  ]);
  const catIds = favAgg.map((f) => f._id).filter((id) => id && id !== 'mixed');
  const cats = catIds.length ? await Category.find({ _id: { $in: catIds } }).select('name') : [];
  const catNameById = new Map(cats.map((c) => [c._id.toString(), c.name]));
  const favoriteCategories = favAgg.map((f) => ({
    categoryId: f._id,
    name: f._id === 'mixed' ? 'Mixed' : catNameById.get(String(f._id)) || 'Unknown',
    matches: f.count,
  }));

  const recentDocs = await Match.find({ players: user._id, state: 'completed' })
    .sort({ completedAt: -1 })
    .limit(5)
    .lean();
  const recentMatches = recentDocs.map((m) => shapeHistoryRow(m, uid));

  ok(res, {
    profile: {
      username: user.username,
      avatar: user.avatar,
      rating: user.rating,
      tier: user.tier,
      wins: s.wins || 0,
      losses: s.losses || 0,
      matchesPlayed,
      winRate: matchesPlayed ? Math.round(((s.wins || 0) / matchesPlayed) * 100) : 0,
      accuracy: s.totalAnswers ? Math.round(((s.correctAnswers || 0) / s.totalAnswers) * 100) : 0,
      avgResponseMs: s.totalAnswers ? Math.round((s.totalResponseMs || 0) / s.totalAnswers) : 0,
      favoriteCategories,
      recentMatches,
      memberSince: user.createdAt,
    },
  });
});

// Avatar presets must match the frontend Avatar component's BG keys.
const AVATAR_PRESETS = ['default', 'violet', 'blue', 'teal', 'amber', 'rose', 'emerald', 'indigo'];

// PATCH /api/players/me { username?, avatar? }
const updateMe = asyncHandler(async (req, res) => {
  const { username, avatar } = req.body || {};
  const user = await User.findById(req.user._id);
  if (!user) throw new ApiError(404, 'User not found');

  if (username !== undefined) {
    const name = String(username).trim();
    if (name.length < 3 || name.length > 20) throw new ApiError(400, 'Username must be 3-20 characters');
    if (!/^[A-Za-z0-9_]+$/.test(name)) throw new ApiError(400, 'Username may only contain letters, numbers and underscores');
    if (name !== user.username) {
      const taken = await User.findOne({ username: name }).select('_id').lean();
      if (taken) throw new ApiError(409, 'Username is already taken');
      user.username = name;
    }
  }
  if (avatar !== undefined) {
    if (!AVATAR_PRESETS.includes(avatar)) throw new ApiError(400, 'Invalid avatar preset');
    user.avatar = avatar;
  }
  await user.save();
  ok(res, { user: user.toSafeJSON(true) }, 'Profile updated');
});

// GET /api/players/search?q= — username prefix search, max 10, no emails.
const searchPlayers = asyncHandler(async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) return ok(res, { players: [] });
  const players = await User.find({
    username: new RegExp(`^${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i'),
    isActive: true,
  })
    .select('username avatar rating tier')
    .limit(10)
    .lean();
  ok(res, {
    players: players.map((p) => ({
      id: p._id.toString(),
      username: p.username,
      avatar: p.avatar,
      rating: p.rating,
      tier: p.tier,
    })),
  });
});

module.exports = { myMatches, publicProfile, updateMe, searchPlayers, AVATAR_PRESETS };
