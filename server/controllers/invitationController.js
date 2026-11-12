const asyncHandler = require('../utils/asyncHandler');
const { ApiError, ok, created } = require('../utils/response');
const Invitation = require('../models/Invitation');
const Room = require('../models/Room');
const User = require('../models/User');

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function loadRoomOr404(code) {
  const room = await Room.findOne({ code: String(code || '').toUpperCase() })
    .populate('players.user', 'username avatar')
    .populate('host', 'username');
  if (!room) throw new ApiError(404, 'Room not found');
  return room;
}

function isMember(room, userId) {
  const uid = userId.toString();
  return room.host._id.toString() === uid || room.players.some((p) => p.user._id.toString() === uid);
}

function ensureJoinable(room) {
  if (room.status !== 'waiting') throw new ApiError(409, 'Match has already started');
  if (room.players.length >= room.config.maxPlayers) throw new ApiError(409, 'Room is full');
}

// POST /api/invitations { recipientUsername, roomCode }
// Anyone may be invited (no friendship required), but the sender must be a
// room member and the room must be waiting with space.
const sendInvitation = asyncHandler(async (req, res) => {
  const { recipientUsername, roomCode } = req.body || {};
  if (!recipientUsername || !roomCode) throw new ApiError(400, 'recipientUsername and roomCode are required');

  const recipient = await User.findOne({
    username: new RegExp(`^${escapeRegExp(String(recipientUsername).trim())}$`, 'i'),
  }).select('_id username');
  if (!recipient) throw new ApiError(404, 'Player not found');

  const meId = req.user._id.toString();
  if (recipient._id.toString() === meId) throw new ApiError(400, 'You cannot invite yourself');

  const room = await loadRoomOr404(roomCode);
  if (!isMember(room, meId)) throw new ApiError(403, 'You are not a member of this room');
  ensureJoinable(room);
  if (isMember(room, recipient._id.toString())) throw new ApiError(409, 'Player is already in this room');

  const invitation = await Invitation.create({
    sender: req.user._id,
    recipient: recipient._id,
    room: room._id,
  });

  // Real-time notify the recipient on their per-user socket room.
  const io = req.app.get('io');
  if (io) {
    io.to(`user:${recipient._id.toString()}`).emit('invite:received', {
      invitationId: invitation._id.toString(),
      fromUsername: req.user.username,
      roomCode: room.code,
      roomName: room.name,
    });
  }

  created(
    res,
    {
      invitation: {
        id: invitation._id.toString(),
        status: invitation.status,
        expiresAt: invitation.expiresAt,
        roomCode: room.code,
        roomName: room.name,
        recipientUsername: recipient.username,
      },
    },
    'Invitation sent'
  );
});

// GET /api/invitations — my pending incoming invitations
const listInvitations = asyncHandler(async (req, res) => {
  const now = new Date();
  const rows = await Invitation.find({
    recipient: req.user._id,
    status: 'pending',
    expiresAt: { $gt: now },
  })
    .populate('sender', 'username avatar')
    .populate('room', 'code name config')
    .sort({ createdAt: -1 });

  ok(res, {
    invitations: rows.map((inv) => ({
      id: inv._id.toString(),
      status: inv.status,
      expiresAt: inv.expiresAt,
      from: inv.sender ? { username: inv.sender.username, avatar: inv.sender.avatar } : null,
      room: inv.room ? { code: inv.room.code, name: inv.room.name, maxPlayers: inv.room.config.maxPlayers } : null,
    })),
  });
});

async function loadPendingForMe(invitationId, userId) {
  const inv = await Invitation.findOne({ _id: invitationId, recipient: userId, status: 'pending' })
    .populate('sender', 'username')
    .populate('room');
  if (!inv) throw new ApiError(404, 'Invitation not found or expired');
  if (inv.isExpired()) {
    inv.status = 'expired';
    await inv.save().catch(() => {});
    throw new ApiError(410, 'Invitation expired');
  }
  return inv;
}

// POST /api/invitations/:id/accept — join the room, return its code
const acceptInvitation = asyncHandler(async (req, res) => {
  const inv = await loadPendingForMe(req.params.id, req.user._id);
  const room = await loadRoomOr404(inv.room.code);
  ensureJoinable(room);

  const meId = req.user._id.toString();
  if (!isMember(room, meId)) {
    room.players.push({ user: req.user._id, ready: false, connected: true });
    await room.save();
  }

  inv.status = 'accepted';
  await inv.save();

  ok(res, { code: room.code }, 'Invitation accepted');
});

// POST /api/invitations/:id/decline
const declineInvitation = asyncHandler(async (req, res) => {
  const inv = await loadPendingForMe(req.params.id, req.user._id);
  inv.status = 'declined';
  await inv.save();
  ok(res, null, 'Invitation declined');
});

module.exports = { sendInvitation, listInvitations, acceptInvitation, declineInvitation };
