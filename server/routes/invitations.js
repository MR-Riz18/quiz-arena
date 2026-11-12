const express = require('express');
const { protect } = require('../middleware/auth');
const c = require('../controllers/invitationController');

const router = express.Router();

router.use(protect);

router.post('/', c.sendInvitation);
router.get('/', c.listInvitations);
router.post('/:id/accept', c.acceptInvitation);
router.post('/:id/decline', c.declineInvitation);

module.exports = router;
