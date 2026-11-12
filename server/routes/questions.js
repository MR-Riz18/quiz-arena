const express = require('express');
const { protect } = require('../middleware/auth');
const c = require('../controllers/questionController');

const router = express.Router();

router.get('/categories', c.listCategories);
router.get('/questions', protect, c.listQuestions);

module.exports = router;
