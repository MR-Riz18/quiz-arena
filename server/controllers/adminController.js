const mongoose = require('mongoose');
const asyncHandler = require('../utils/asyncHandler');
const { ApiError, ok, created } = require('../utils/response');
const User = require('../models/User');
const Match = require('../models/Match');
const Question = require('../models/Question');
const Category = require('../models/Category');
const AuditLog = require('../models/AuditLog');
const Config = require('../models/Config');
const { logAudit } = require('../utils/audit');
const { clearConfigCache } = require('../services/config');

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function paging(query) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(query.limit, 10) || DEFAULT_LIMIT));
  return { page, limit, skip: (page - 1) * limit };
}

function pageResult(rows, total, page, limit) {
  return { page, limit, total, totalPages: Math.ceil(total / limit) };
}

// Zero-filled per-day series for the last `days` days (UTC day buckets).
function zeroFilledDays(days) {
  const out = [];
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 86400000);
    out.push({ date: d.toISOString().slice(0, 10), count: 0 });
  }
  return out;
}

function fillSeries(days, agg, dateField = '_id') {
  const byDate = new Map(agg.map((r) => [r[dateField], r.count]));
  return days.map((d) => ({ date: d.date, count: byDate.get(d.date) || 0 }));
}

// ---------------------------------------------------------------------------
// GET /api/admin/stats
// ---------------------------------------------------------------------------
const getStats = asyncHandler(async (req, res) => {
  const engine = req.app.get('engine');
  const matchmaker = req.app.get('matchmaker');

  const [totalUsers, completedMatches, totalQuestions] = await Promise.all([
    User.countDocuments(),
    Match.countDocuments({ state: 'completed' }),
    Question.countDocuments(),
  ]);

  const activeMatches = engine && engine.live ? engine.live.size : 0;

  const durAgg = await Match.aggregate([
    { $match: { state: 'completed', startedAt: { $ne: null }, completedAt: { $ne: null } } },
    {
      $group: {
        _id: null,
        avgMs: { $avg: { $subtract: ['$completedAt', '$startedAt'] } },
      },
    },
  ]);
  const avgMatchDurationMin =
    durAgg.length && durAgg[0].avgMs != null ? Math.round((durAgg[0].avgMs / 60000) * 10) / 10 : 0;

  const days = zeroFilledDays(7);
  const since = new Date(days[0].date + 'T00:00:00.000Z');

  const signups = await User.aggregate([
    { $match: { createdAt: { $gte: since } } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
        count: { $sum: 1 },
      },
    },
  ]);
  const matchesAgg = await Match.aggregate([
    { $match: { state: 'completed', completedAt: { $gte: since } } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$completedAt' } },
        count: { $sum: 1 },
      },
    },
  ]);

  const popular = await Match.aggregate([
    { $match: { state: 'completed' } },
    { $group: { _id: '$categoryId', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 5 },
  ]);
  const catIds = popular.map((p) => p._id).filter((id) => id && id !== 'mixed' && mongoose.Types.ObjectId.isValid(id));
  const cats = catIds.length ? await Category.find({ _id: { $in: catIds } }).select('name') : [];
  const nameById = new Map(cats.map((c) => [c._id.toString(), c.name]));
  const popularCategories = popular.map((p) => ({
    categoryId: p._id,
    name: p._id === 'mixed' ? 'Mixed' : nameById.get(String(p._id)) || 'Unknown',
    matches: p.count,
  }));

  ok(res, {
    totalUsers,
    activeMatches,
    completedMatches,
    totalQuestions,
    avgMatchDurationMin,
    signupsPerDay: fillSeries(days, signups),
    matchesPerDay: fillSeries(days, matchesAgg),
    popularCategories,
    matchmaking: { queuedNow: matchmaker && matchmaker._queue ? matchmaker._queue.length : 0 },
  });
});

// ---------------------------------------------------------------------------
// Users: GET /api/admin/users, PATCH /api/admin/users/:id
// ---------------------------------------------------------------------------
const listUsers = asyncHandler(async (req, res) => {
  const { page, limit, skip } = paging(req.query);
  const filter = {};
  if (req.query.search) {
    const q = String(req.query.search).trim();
    filter.$or = [
      { username: new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') },
      { email: new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') },
    ];
  }
  const [total, users] = await Promise.all([
    User.countDocuments(filter),
    User.find(filter).select('-passwordHash').sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
  ]);
  ok(res, {
    users: users.map((u) => ({ ...u, id: u._id.toString() })),
    ...pageResult(users, total, page, limit),
  });
});

const updateUser = asyncHandler(async (req, res) => {
  const target = await User.findById(req.params.id).select('-passwordHash');
  if (!target) throw new ApiError(404, 'User not found');

  const meId = req.user._id.toString();
  const { role, isActive } = req.body || {};
  const changes = {};

  if (role !== undefined) {
    if (!['player', 'admin'].includes(role)) throw new ApiError(400, 'Invalid role');
    if (target._id.toString() === meId && role !== target.role) {
      throw new ApiError(403, 'You cannot change your own role');
    }
    if (role !== target.role) changes.role = [target.role, role];
    target.role = role;
  }
  if (isActive !== undefined) {
    if (typeof isActive !== 'boolean') throw new ApiError(400, 'isActive must be a boolean');
    if (target._id.toString() === meId && isActive === false) {
      throw new ApiError(403, 'You cannot deactivate your own account');
    }
    if (isActive !== target.isActive) changes.isActive = [target.isActive, isActive];
    target.isActive = isActive;
  }

  await target.save();
  await logAudit({
    actor: req.user._id,
    action: 'admin.users.update',
    targetType: 'User',
    targetId: target._id,
    metadata: { username: target.username, changes },
  });
  ok(res, { user: target.toSafeJSON(true) }, 'User updated');
});

// ---------------------------------------------------------------------------
// GET /api/admin/matches ?status=&mode=&page=&limit=
// ---------------------------------------------------------------------------
const listMatches = asyncHandler(async (req, res) => {
  const { page, limit, skip } = paging(req.query);
  const filter = {};
  if (req.query.status) {
    if (!['waiting', 'countdown', 'inProgress', 'questionEnded', 'completed', 'cancelled'].includes(req.query.status)) {
      throw new ApiError(400, 'Invalid status');
    }
    filter.state = req.query.status;
  }
  if (req.query.mode) {
    if (!['casual', 'competitive'].includes(req.query.mode)) throw new ApiError(400, 'Invalid mode');
    filter.mode = req.query.mode;
  }
  const [total, matches] = await Promise.all([
    Match.countDocuments(filter),
    Match.find(filter)
      .populate('players', 'username avatar rating')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
  ]);
  ok(res, {
    matches: matches.map((m) => ({
      id: m._id.toString(),
      mode: m.mode,
      rated: !!m.rated,
      state: m.state,
      categoryId: m.categoryId,
      playerCount: (m.players || []).length,
      players: (m.players || []).map((p) => ({ username: p.username, avatar: p.avatar })),
      questionCount: (m.questionIds || []).length,
      forfeit: !!m.forfeit,
      createdAt: m.createdAt,
      startedAt: m.startedAt,
      completedAt: m.completedAt,
      durationSec:
        m.startedAt && m.completedAt ? Math.round((new Date(m.completedAt) - new Date(m.startedAt)) / 1000) : null,
    })),
    ...pageResult(matches, total, page, limit),
  });
});

// ---------------------------------------------------------------------------
// GET /api/admin/audit-logs ?action=&page=&limit=
// ---------------------------------------------------------------------------
const listAuditLogs = asyncHandler(async (req, res) => {
  const { page, limit, skip } = paging(req.query);
  const filter = {};
  if (req.query.action) filter.action = String(req.query.action);
  const [total, logs] = await Promise.all([
    AuditLog.countDocuments(filter),
    AuditLog.find(filter)
      .populate('actor', 'username')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
  ]);
  ok(res, {
    logs: logs.map((l) => ({
      id: l._id.toString(),
      action: l.action,
      actor: l.actor ? { id: l.actor._id.toString(), username: l.actor.username } : null,
      targetType: l.targetType,
      targetId: l.targetId,
      metadata: l.metadata,
      createdAt: l.createdAt,
    })),
    ...pageResult(logs, total, page, limit),
  });
});

// ---------------------------------------------------------------------------
// Questions (admin sees correctIndex — never exposed on player endpoints)
// ---------------------------------------------------------------------------
function shapeAdminQuestion(q) {
  const o = q.toObject ? q.toObject() : q;
  return {
    id: o._id.toString(),
    text: o.text,
    options: o.options,
    correctIndex: o.correctIndex,
    explanation: o.explanation,
    category: o.category,
    difficulty: o.difficulty,
    tags: o.tags,
    isActive: o.isActive,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  };
}

function validateQuestionBody(body) {
  const { text, options, correctIndex, category, difficulty } = body || {};
  if (!text || !String(text).trim()) throw new ApiError(400, 'Question text is required');
  if (!Array.isArray(options) || options.length !== 4 || !options.every((s) => typeof s === 'string' && s.trim())) {
    throw new ApiError(400, 'A question must have exactly 4 non-empty options');
  }
  if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex > 3) {
    throw new ApiError(400, 'correctIndex must be an integer 0-3');
  }
  if (!category || !mongoose.Types.ObjectId.isValid(category)) throw new ApiError(400, 'Valid category is required');
  if (difficulty !== undefined && !['easy', 'medium', 'hard'].includes(difficulty)) {
    throw new ApiError(400, 'Invalid difficulty');
  }
}

const listQuestionsAdmin = asyncHandler(async (req, res) => {
  const { page, limit, skip } = paging(req.query);
  const filter = {};
  if (req.query.category) {
    if (!mongoose.Types.ObjectId.isValid(req.query.category)) throw new ApiError(400, 'Invalid category');
    filter.category = req.query.category;
  }
  if (req.query.difficulty) {
    if (!['easy', 'medium', 'hard'].includes(req.query.difficulty)) throw new ApiError(400, 'Invalid difficulty');
    filter.difficulty = req.query.difficulty;
  }
  if (req.query.search) {
    filter.text = new RegExp(String(req.query.search).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  }
  if (req.query.active !== undefined && req.query.active !== '') {
    filter.isActive = req.query.active === 'true';
  }
  const [total, questions] = await Promise.all([
    Question.countDocuments(filter),
    Question.find(filter).populate('category', 'name').sort({ createdAt: -1 }).skip(skip).limit(limit),
  ]);
  ok(res, { questions: questions.map(shapeAdminQuestion), ...pageResult(questions, total, page, limit) });
});

const createQuestion = asyncHandler(async (req, res) => {
  validateQuestionBody(req.body);
  const cat = await Category.findById(req.body.category).select('_id').lean();
  if (!cat) throw new ApiError(400, 'Category does not exist');
  const q = await Question.create({
    text: String(req.body.text).trim(),
    options: req.body.options.map((s) => String(s).trim()),
    correctIndex: req.body.correctIndex,
    explanation: String(req.body.explanation || '').trim(),
    category: req.body.category,
    difficulty: req.body.difficulty || 'medium',
    tags: Array.isArray(req.body.tags) ? req.body.tags.map(String) : [],
    isActive: req.body.isActive !== undefined ? !!req.body.isActive : true,
  });
  await logAudit({
    actor: req.user._id,
    action: 'admin.questions.create',
    targetType: 'Question',
    targetId: q._id,
    metadata: { text: q.text.slice(0, 80) },
  });
  created(res, { question: shapeAdminQuestion(q) }, 'Question created');
});

const updateQuestion = asyncHandler(async (req, res) => {
  validateQuestionBody(req.body);
  const cat = await Category.findById(req.body.category).select('_id').lean();
  if (!cat) throw new ApiError(400, 'Category does not exist');
  const q = await Question.findById(req.params.id);
  if (!q) throw new ApiError(404, 'Question not found');
  q.text = String(req.body.text).trim();
  q.options = req.body.options.map((s) => String(s).trim());
  q.correctIndex = req.body.correctIndex;
  q.explanation = String(req.body.explanation || '').trim();
  q.category = req.body.category;
  q.difficulty = req.body.difficulty || 'medium';
  if (Array.isArray(req.body.tags)) q.tags = req.body.tags.map(String);
  if (req.body.isActive !== undefined) q.isActive = !!req.body.isActive;
  await q.save();
  await logAudit({
    actor: req.user._id,
    action: 'admin.questions.update',
    targetType: 'Question',
    targetId: q._id,
    metadata: { text: q.text.slice(0, 80) },
  });
  ok(res, { question: shapeAdminQuestion(q) }, 'Question updated');
});

const deleteQuestion = asyncHandler(async (req, res) => {
  const q = await Question.findByIdAndDelete(req.params.id);
  if (!q) throw new ApiError(404, 'Question not found');
  await logAudit({
    actor: req.user._id,
    action: 'admin.questions.delete',
    targetType: 'Question',
    targetId: req.params.id,
    metadata: { text: q.text.slice(0, 80) },
  });
  ok(res, null, 'Question deleted');
});

// ---------------------------------------------------------------------------
// Categories: POST / PUT / DELETE /api/admin/categories[/:id]
// ---------------------------------------------------------------------------
const createCategory = asyncHandler(async (req, res) => {
  const { name, description, icon } = req.body || {};
  if (!name || !String(name).trim()) throw new ApiError(400, 'Category name is required');
  const exists = await Category.findOne({ name: String(name).trim() }).select('_id').lean();
  if (exists) throw new ApiError(409, 'Category already exists');
  const cat = await Category.create({
    name: String(name).trim(),
    description: String(description || '').trim(),
    icon: String(icon || '❓').trim(),
  });
  await logAudit({ actor: req.user._id, action: 'admin.categories.create', targetType: 'Category', targetId: cat._id, metadata: { name: cat.name } });
  created(res, { category: cat }, 'Category created');
});

const updateCategory = asyncHandler(async (req, res) => {
  const cat = await Category.findById(req.params.id);
  if (!cat) throw new ApiError(404, 'Category not found');
  const { name, description, icon, isActive } = req.body || {};
  if (name !== undefined) {
    if (!String(name).trim()) throw new ApiError(400, 'Category name is required');
    const clash = await Category.findOne({ name: String(name).trim(), _id: { $ne: cat._id } }).select('_id').lean();
    if (clash) throw new ApiError(409, 'Category name already exists');
    cat.name = String(name).trim();
  }
  if (description !== undefined) cat.description = String(description).trim();
  if (icon !== undefined) cat.icon = String(icon).trim();
  if (isActive !== undefined) cat.isActive = !!isActive;
  await cat.save();
  await logAudit({ actor: req.user._id, action: 'admin.categories.update', targetType: 'Category', targetId: cat._id, metadata: { name: cat.name } });
  ok(res, { category: cat }, 'Category updated');
});

const deleteCategory = asyncHandler(async (req, res) => {
  const cat = await Category.findById(req.params.id);
  if (!cat) throw new ApiError(404, 'Category not found');
  const used = await Question.countDocuments({ category: cat._id });
  if (used > 0) throw new ApiError(409, `Cannot delete: ${used} question(s) use this category`);
  await cat.deleteOne();
  await logAudit({ actor: req.user._id, action: 'admin.categories.delete', targetType: 'Category', targetId: req.params.id, metadata: { name: cat.name } });
  ok(res, null, 'Category deleted');
});

// ---------------------------------------------------------------------------
// Config: GET / PATCH /api/admin/config
// ---------------------------------------------------------------------------
const CONFIG_DEFAULTS_DOC = {
  tiers: [
    { name: 'Bronze', min: 0 },
    { name: 'Silver', min: 1000 },
    { name: 'Gold', min: 1200 },
    { name: 'Platinum', min: 1400 },
    { name: 'Diamond', min: 1600 },
    { name: 'Master', min: 1800 },
  ],
  kFactor: 32,
  scoring: { base: 1000, speedBonus: 500, streakBonus: 100, streakCap: 500 },
  reconnectGraceMs: Number(process.env.RECONNECT_GRACE_MS) || 60000,
};

function validateTiers(tiers) {
  if (!Array.isArray(tiers) || tiers.length === 0) throw new ApiError(400, 'tiers must be a non-empty array');
  const cleaned = tiers.map((t) => {
    if (!t || typeof t.name !== 'string' || !t.name.trim()) throw new ApiError(400, 'Each tier needs a name');
    if (!Number.isFinite(Number(t.min))) throw new ApiError(400, 'Each tier needs a numeric min');
    return { name: t.name.trim(), min: Number(t.min) };
  });
  const names = new Set(cleaned.map((t) => t.name.toLowerCase()));
  if (names.size !== cleaned.length) throw new ApiError(400, 'Tier names must be unique');
  const mins = cleaned.map((t) => t.min).sort((a, b) => a - b);
  for (let i = 1; i < mins.length; i++) {
    if (mins[i] <= mins[i - 1]) throw new ApiError(400, 'Tier bands must be strictly ascending by min');
  }
  cleaned.sort((a, b) => a.min - b.min);
  return cleaned;
}

const getConfig = asyncHandler(async (req, res) => {
  const docs = await Config.find({}).lean();
  const cfg = JSON.parse(JSON.stringify(CONFIG_DEFAULTS_DOC));
  for (const d of docs) {
    if (d.key in cfg) cfg[d.key] = d.value;
  }
  ok(res, { config: cfg });
});

const updateConfig = asyncHandler(async (req, res) => {
  const { tiers, kFactor, scoring, reconnectGraceMs } = req.body || {};
  const updates = {};

  if (tiers !== undefined) updates.tiers = validateTiers(tiers);
  if (kFactor !== undefined) {
    const k = Math.round(Number(kFactor));
    if (!Number.isFinite(k) || k < 1 || k > 200) throw new ApiError(400, 'kFactor must be 1-200');
    updates.kFactor = k;
  }
  if (scoring !== undefined) {
    if (!scoring || typeof scoring !== 'object') throw new ApiError(400, 'scoring must be an object');
    const clean = {};
    for (const k of ['base', 'speedBonus', 'streakBonus', 'streakCap']) {
      if (scoring[k] === undefined) continue;
      const n = Math.round(Number(scoring[k]));
      if (!Number.isFinite(n) || n < 0) throw new ApiError(400, `scoring.${k} must be a non-negative number`);
      clean[k] = n;
    }
    updates.scoring = { ...CONFIG_DEFAULTS_DOC.scoring, ...clean };
  }
  if (reconnectGraceMs !== undefined) {
    const ms = Math.round(Number(reconnectGraceMs));
    if (!Number.isFinite(ms) || ms < 5000 || ms > 600000) {
      throw new ApiError(400, 'reconnectGraceMs must be 5000-600000');
    }
    updates.reconnectGraceMs = ms;
  }

  if (Object.keys(updates).length === 0) throw new ApiError(400, 'Nothing to update');

  for (const [key, value] of Object.entries(updates)) {
    await Config.findOneAndUpdate({ key }, { key, value }, { upsert: true, new: true });
  }
  clearConfigCache(); // ratings/engine pick up new values within the next read

  await logAudit({
    actor: req.user._id,
    action: 'admin.config.update',
    targetType: 'Config',
    metadata: { keys: Object.keys(updates) },
  });
  ok(res, { updated: Object.keys(updates) }, 'Configuration updated');
});

module.exports = {
  getStats,
  listUsers,
  updateUser,
  listMatches,
  listAuditLogs,
  listQuestionsAdmin,
  createQuestion,
  updateQuestion,
  deleteQuestion,
  createCategory,
  updateCategory,
  deleteCategory,
  getConfig,
  updateConfig,
  CONFIG_DEFAULTS_DOC,
};
