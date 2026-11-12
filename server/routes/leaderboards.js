const express = require('express');
const { optionalAuth } = require('../middleware/auth');
const c = require('../controllers/leaderboardController');

const router = express.Router();

// Public leaderboards; `me` is included when the request carries a session.
router.get('/rating', optionalAuth, c.byRating);
router.get('/wins', optionalAuth, c.byWins);
router.get('/accuracy', optionalAuth, c.byAccuracy);

module.exports = router;
