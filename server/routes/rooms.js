const express = require('express');
const { protect } = require('../middleware/auth');
const c = require('../controllers/roomController');

const router = express.Router();

router.post('/', protect, c.createRoom);
router.get('/', protect, c.listRooms);
router.get('/:code', protect, c.getRoom);
router.post('/:code/join', protect, c.joinRoom);
router.post('/:code/leave', protect, c.leaveRoom);

module.exports = router;
