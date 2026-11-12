const express = require('express');
const { protect } = require('../middleware/auth');
const c = require('../controllers/matchController');

const router = express.Router();

router.get('/:id', protect, c.getMatch);
router.post('/:id/rematch', protect, c.rematch);

module.exports = router;
