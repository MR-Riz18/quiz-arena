const mongoose = require('mongoose');
const asyncHandler = require('../utils/asyncHandler');
const { ApiError, ok } = require('../utils/response');
const Category = require('../models/Category');
const Question = require('../models/Question');

// GET /api/categories — public list of active categories.
const listCategories = asyncHandler(async (req, res) => {
  const categories = await Category.find({ isActive: true }).sort({ name: 1 });
  ok(res, { categories });
});

// GET /api/questions?category=&difficulty=&limit=
// Authenticated. NEVER includes correctIndex or explanation — the engine
// only reveals those when a question ends.
const listQuestions = asyncHandler(async (req, res) => {
  const filter = { isActive: true };
  if (req.query.category) {
    if (!mongoose.Types.ObjectId.isValid(req.query.category)) throw new ApiError(400, 'Invalid category');
    filter.category = req.query.category;
  }
  if (req.query.difficulty) {
    if (!['easy', 'medium', 'hard'].includes(req.query.difficulty)) throw new ApiError(400, 'Invalid difficulty');
    filter.difficulty = req.query.difficulty;
  }
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));

  const questions = await Question.find(filter)
    .populate('category', 'name')
    .sort({ createdAt: -1 })
    .limit(limit);

  ok(res, { questions: questions.map((q) => q.toPublicJSON()) });
});

module.exports = { listCategories, listQuestions };
