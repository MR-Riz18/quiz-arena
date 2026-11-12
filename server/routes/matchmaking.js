const express = require('express');
const { protect } = require('../middleware/auth');
const c = require('../controllers/matchmakingController');

const router = express.Router();

router.post('/join', protect, c.joinQueue);
router.post('/cancel', protect, c.cancelQueue);
router.get('/status', protect, c.queueStatus);

module.exports = router;
