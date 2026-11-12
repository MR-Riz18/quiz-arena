const express = require('express');
const { protect } = require('../middleware/auth');
const c = require('../controllers/friendController');

const router = express.Router();

router.use(protect);

router.post('/request', c.sendRequest);
router.get('/requests', c.listRequests);
router.post('/requests/:id/accept', c.acceptRequest);
router.post('/requests/:id/decline', c.declineRequest);
router.delete('/:friendId', c.removeFriend);
router.get('/', c.listFriends);

module.exports = router;
