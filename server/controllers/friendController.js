const asyncHandler = require('../utils/asyncHandler');
const { ApiError, ok, created } = require('../utils/response');
const Friendship = require('../models/Friendship');
const User = require('../models/User');
const { isUserOnline } = require('../socket');

const PUBLIC_USER_FIELDS = 'username avatar rating tier';

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function findUserByUsername(username) {
  const name = String(username || '').trim();
  if (!name) return null;
  // Case-insensitive exact match — friendlier than case-sensitive.
  return User.findOne({ username: new RegExp(`^${escapeRegExp(name)}$`, 'i') });
}

function shapeFriend(user) {
  const uid = user._id.toString();
  return {
    id: uid,
    username: user.username,
    avatar: user.avatar,
    rating: user.rating,
    tier: user.tier,
    isOnline: isUserOnline(uid),
  };
}

// POST /api/friends/request { username }
const sendRequest = asyncHandler(async (req, res) => {
  const target = await findUserByUsername(req.body && req.body.username);
  if (!target) throw new ApiError(404, 'Player not found');
  const meId = req.user._id.toString();
  const themId = target._id.toString();
  if (meId === themId) throw new ApiError(400, 'You cannot send a friend request to yourself');

  const pairKey = [meId, themId].sort().join(':');
  const existing = await Friendship.findOne({ pairKey });
  if (existing) {
    throw new ApiError(
      409,
      existing.status === 'accepted' ? 'You are already friends' : 'A friend request is already pending'
    );
  }

  const fr = await Friendship.create({ requester: req.user._id, recipient: target._id });
  created(res, { request: { id: fr._id.toString(), status: fr.status } }, 'Friend request sent');
});

// GET /api/friends/requests — incoming pending requests (I am the recipient)
const listRequests = asyncHandler(async (req, res) => {
  const rows = await Friendship.find({ recipient: req.user._id, status: 'pending' })
    .populate('requester', PUBLIC_USER_FIELDS)
    .sort({ createdAt: -1 });
  ok(res, {
    requests: rows.map((r) => ({
      id: r._id.toString(),
      status: r.status,
      createdAt: r.createdAt,
      from: r.requester
        ? {
            id: r.requester._id.toString(),
            username: r.requester.username,
            avatar: r.requester.avatar,
            rating: r.requester.rating,
            tier: r.requester.tier,
          }
        : null,
    })),
  });
});

// POST /api/friends/requests/:id/accept
const acceptRequest = asyncHandler(async (req, res) => {
  const fr = await Friendship.findOne({
    _id: req.params.id,
    recipient: req.user._id,
    status: 'pending',
  }).populate('requester', PUBLIC_USER_FIELDS);
  if (!fr) throw new ApiError(404, 'Friend request not found');
  fr.status = 'accepted';
  await fr.save();
  ok(res, { friend: shapeFriend(fr.requester) }, 'Friend request accepted');
});

// POST /api/friends/requests/:id/decline
const declineRequest = asyncHandler(async (req, res) => {
  const fr = await Friendship.findOneAndDelete({
    _id: req.params.id,
    recipient: req.user._id,
    status: 'pending',
  });
  if (!fr) throw new ApiError(404, 'Friend request not found');
  ok(res, null, 'Friend request declined');
});

// DELETE /api/friends/:friendId — remove an accepted friendship
const removeFriend = asyncHandler(async (req, res) => {
  const meId = req.user._id.toString();
  const themId = String(req.params.friendId);
  const pairKey = [meId, themId].sort().join(':');
  const fr = await Friendship.findOneAndDelete({ pairKey, status: 'accepted' });
  if (!fr) throw new ApiError(404, 'Friend not found');
  ok(res, null, 'Friend removed');
});

// GET /api/friends — accepted friends with online status
const listFriends = asyncHandler(async (req, res) => {
  const meId = req.user._id.toString();
  const rows = await Friendship.find({
    status: 'accepted',
    $or: [{ requester: req.user._id }, { recipient: req.user._id }],
  })
    .populate('requester', PUBLIC_USER_FIELDS)
    .populate('recipient', PUBLIC_USER_FIELDS)
    .sort({ updatedAt: -1 });

  const friends = rows
    .map((r) => {
      const other = r.requester._id.toString() === meId ? r.recipient : r.requester;
      return other ? shapeFriend(other) : null;
    })
    .filter(Boolean);

  ok(res, { friends });
});

module.exports = { sendRequest, listRequests, acceptRequest, declineRequest, removeFriend, listFriends };
