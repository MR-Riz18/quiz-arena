const express = require('express');
const { protect } = require('../middleware/auth');
const { loginLimiter } = require('../middleware/rateLimit');
const c = require('../controllers/authController');

const router = express.Router();

router.post('/register', c.register);
router.post('/login', loginLimiter, c.login);
router.post('/logout', c.logout);
router.get('/me', protect, c.me);
router.patch('/password', protect, c.changePassword);

module.exports = router;
