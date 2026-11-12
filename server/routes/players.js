const express = require('express');
const { protect } = require('../middleware/auth');
const c = require('../controllers/playerController');

const router = express.Router();

// NOTE: /search and /me/* must be registered before /:username.
router.get('/search', protect, c.searchPlayers);
router.get('/me/matches', protect, c.myMatches);
router.patch('/me', protect, c.updateMe);
router.get('/:username', protect, c.publicProfile);

module.exports = router;
