const asyncHandler = require('../utils/asyncHandler');
const { ApiError, ok, created } = require('../utils/response');
const Room = require('../models/Room');

function shapeRoom(room) {
  return room.toPublicJSON();
}

async function loadRoom(code) {
  const room = await Room.findOne({ code: String(code).toUpperCase() })
    .populate('players.user', 'username avatar')
    .populate('host', 'username');
  if (!room) throw new ApiError(404, 'Room not found');
  return room;
}

function requireMember(room, userId) {
  const uid = userId.toString();
  const member = room.host._id.toString() === uid || room.players.some((p) => p.user._id.toString() === uid);
  if (!member) throw new ApiError(403, 'You are not a member of this room');
}

// POST /api/rooms — create a room; creator becomes host + first player.
const createRoom = asyncHandler(async (req, res) => {
  const { name, visibility = 'public', config = {} } = req.body || {};
  if (!name || !String(name).trim()) throw new ApiError(400, 'Room name is required');
  if (visibility && !['public', 'private'].includes(visibility)) throw new ApiError(400, 'Invalid visibility');

  const cleanConfig = {};
  if (config.maxPlayers !== undefined) {
    const n = Number(config.maxPlayers);
    if (!Number.isInteger(n) || n < 2 || n > 8) throw new ApiError(400, 'maxPlayers must be 2-8');
    cleanConfig.maxPlayers = n;
  }
  if (config.questionCount !== undefined) {
    const n = Number(config.questionCount);
    if (!Number.isInteger(n) || n < 3 || n > 20) throw new ApiError(400, 'questionCount must be 3-20');
    cleanConfig.questionCount = n;
  }
  if (config.timePerQuestion !== undefined) {
    const n = Number(config.timePerQuestion);
    if (!Number.isInteger(n) || n < 5 || n > 60) throw new ApiError(400, 'timePerQuestion must be 5-60 seconds');
    cleanConfig.timePerQuestion = n;
  }
  if (config.difficulty !== undefined) {
    if (!['mixed', 'easy', 'medium', 'hard'].includes(config.difficulty)) throw new ApiError(400, 'Invalid difficulty');
    cleanConfig.difficulty = config.difficulty;
  }
  if (config.categoryId !== undefined) cleanConfig.categoryId = String(config.categoryId);

  const code = await Room.generateUniqueCode();
  const room = await Room.create({
    code,
    name: String(name).trim(),
    host: req.user._id,
    visibility,
    config: cleanConfig,
    players: [{ user: req.user._id, ready: false, connected: true }],
  });

  const populated = await loadRoom(code);
  created(res, { room: shapeRoom(populated), code }, 'Room created');
});

// GET /api/rooms — public waiting rooms, paginated.
const listRooms = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 12));
  const filter = { visibility: 'public', status: 'waiting' };
  const [rooms, total] = await Promise.all([
    Room.find(filter)
      .populate('players.user', 'username avatar')
      .populate('host', 'username')
      .sort({ updatedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Room.countDocuments(filter),
  ]);
  ok(res, {
    rooms: rooms.map(shapeRoom),
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  });
});

// GET /api/rooms/:code — private rooms only visible to members.
const getRoom = asyncHandler(async (req, res) => {
  const room = await loadRoom(req.params.code);
  if (room.visibility === 'private') requireMember(room, req.user._id);
  ok(res, { room: shapeRoom(room) });
});

// POST /api/rooms/:code/join — the code IS the invite for private rooms.
const joinRoom = asyncHandler(async (req, res) => {
  const room = await loadRoom(req.params.code);
  if (room.status !== 'waiting') throw new ApiError(409, 'Match has already started');

  const uid = req.user._id.toString();
  const already = room.players.some((p) => p.user._id.toString() === uid);
  if (!already) {
    if (room.players.length >= room.config.maxPlayers) throw new ApiError(409, 'Room is full');
    room.players.push({ user: req.user._id, ready: false, connected: true });
    await room.save();
  }

  const fresh = await loadRoom(req.params.code);
  ok(res, { room: shapeRoom(fresh) }, already ? 'Already in room' : 'Joined room');
});

// POST /api/rooms/:code/leave
const leaveRoom = asyncHandler(async (req, res) => {
  const room = await loadRoom(req.params.code);
  if (room.status !== 'waiting') throw new ApiError(409, 'Cannot leave a live match from here');

  const uid = req.user._id.toString();
  const before = room.players.length;
  room.players = room.players.filter((p) => p.user._id.toString() !== uid);

  if (room.host._id.toString() === uid) {
    if (room.players.length > 0) {
      // Host leaves -> promote the longest-waiting player.
      room.host = room.players[0].user;
    } else {
      await room.deleteOne();
      return ok(res, null, 'Room closed');
    }
  } else if (room.players.length === before) {
    throw new ApiError(400, 'You are not in this room');
  }

  await room.save();
  const fresh = await loadRoom(req.params.code);
  ok(res, { room: shapeRoom(fresh) }, 'Left room');
});

module.exports = { createRoom, listRooms, getRoom, joinRoom, leaveRoom };
