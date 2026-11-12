const asyncHandler = require('../utils/asyncHandler');
const { ok } = require('../utils/response');
const User = require('../models/User');

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

function parsePaging(req) {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(req.query.limit, 10) || DEFAULT_LIMIT));
  return { page, limit };
}

function accuracyOf(u) {
  const s = u.stats || {};
  return s.totalAnswers ? Math.round((s.correctAnswers / s.totalAnswers) * 100) : 0;
}

function shapeRow(u, rank) {
  const s = u.stats || {};
  const matchesPlayed = s.matchesPlayed || 0;
  return {
    rank,
    userId: u._id.toString(),
    username: u.username,
    avatar: u.avatar,
    rating: u.rating,
    tier: u.tier,
    wins: s.wins || 0,
    losses: s.losses || 0,
    matchesPlayed,
    winRate: matchesPlayed ? Math.round(((s.wins || 0) / matchesPlayed) * 100) : 0,
    accuracy: accuracyOf(u),
  };
}

// Rank of a user by rating: 1 + everyone strictly above them.
async function ratingRankOf(rating) {
  return (await User.countDocuments({ rating: { $gt: rating } })) + 1;
}

function withMe(rows, req) {
  if (!req.user) return { rows, me: null };
  const mine = rows.find((r) => r.userId === req.user._id.toString());
  return { rows, me: mine || null };
}

// GET /api/leaderboards/rating — top players by Elo rating.
const byRating = asyncHandler(async (req, res) => {
  const { page, limit } = parsePaging(req);
  const filter = {};
  if (req.query.search) {
    filter.username = { $regex: String(req.query.search).trim(), $options: 'i' };
  }
  const users = await User.find(filter).sort({ rating: -1, username: 1 }).lean();
  const total = users.length;
  const rows = users
    .slice((page - 1) * limit, page * limit)
    .map((u, i) => shapeRow(u, (page - 1) * limit + i + 1));

  let me = null;
  if (req.user) {
    const meDoc = await User.findById(req.user._id).lean();
    if (meDoc) {
      me = { ...shapeRow(meDoc, 0), rank: await ratingRankOf(meDoc.rating) };
    }
  }
  ok(res, { ...withMe(rows, req), me, page, limit, total, totalPages: Math.ceil(total / limit) });
});

// GET /api/leaderboards/wins — top players by total wins.
const byWins = asyncHandler(async (req, res) => {
  const { page, limit } = parsePaging(req);
  const filter = {};
  if (req.query.search) {
    filter.username = { $regex: String(req.query.search).trim(), $options: 'i' };
  }
  const users = await User.find(filter).sort({ 'stats.wins': -1, rating: -1 }).lean();
  const total = users.length;
  const rows = users
    .slice((page - 1) * limit, page * limit)
    .map((u, i) => shapeRow(u, (page - 1) * limit + i + 1));
  ok(res, { ...withMe(rows, req), page, limit, total, totalPages: Math.ceil(total / limit) });
});

// GET /api/leaderboards/accuracy — top players by answer accuracy.
// Minimum 10 played matches keeps one-match wonders off the board.
const byAccuracy = asyncHandler(async (req, res) => {
  const { page, limit } = parsePaging(req);
  const filter = { 'stats.matchesPlayed': { $gte: 10 } };
  if (req.query.search) {
    filter.username = { $regex: String(req.query.search).trim(), $options: 'i' };
  }
  const users = await User.find(filter).lean();
  users.sort((a, b) => accuracyOf(b) - accuracyOf(a) || (b.stats.totalAnswers || 0) - (a.stats.totalAnswers || 0));
  const total = users.length;
  const rows = users
    .slice((page - 1) * limit, page * limit)
    .map((u, i) => shapeRow(u, (page - 1) * limit + i + 1));
  ok(res, { ...withMe(rows, req), page, limit, total, totalPages: Math.ceil(total / limit) });
});

module.exports = { byRating, byWins, byAccuracy };
