// Socket.IO server for QuizArena Phase 1.
//
// Auth: staff/player sockets authenticate via the httpOnly `token` cookie
// (same JWT as REST). Bad auth -> handshake rejected.
// Rooms: `room:<code>` — every join/action re-validates membership against
// the Room document. The server never trusts client payloads.

const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Room = require('../models/Room');

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

async function findRoomByCode(code) {
  return Room.findOne({ code: String(code).toUpperCase() })
    .populate('players.user', 'username avatar')
    .populate('host', 'username');
}

function isMember(room, userId) {
  const uid = userId.toString();
  if (room.host._id.toString() === uid) return true;
  return room.players.some((p) => p.user._id.toString() === uid);
}

// --- Phase 4: presence -------------------------------------------------------
// Tracks open sockets per user (module scope so controllers can query it).
// A user is "online" when they hold at least one open socket.
const userSockets = new Map(); // userId -> Set<socketId>

function isUserOnline(userId) {
  const set = userSockets.get(String(userId));
  return !!set && set.size > 0;
}

function getOnlineUserIds() {
  const ids = [];
  for (const [uid, set] of userSockets) {
    if (set.size > 0) ids.push(uid);
  }
  return ids;
}

function initSocket(httpServer, engine, matchmaker = null) {
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.CLIENT_URL || 'http://localhost:5173',
      credentials: true,
    },
  });

  // --- auth middleware -------------------------------------------------------
  io.use(async (socket, next) => {
    try {
      const cookies = parseCookies(socket.handshake.headers.cookie);
      const token = cookies.token;
      if (!token) return next(new Error('unauthorized: missing token'));
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select('_id role username isActive');
      if (!user || !user.isActive) return next(new Error('unauthorized: inactive account'));
      socket.user = {
        id: user._id.toString(),
        role: user.role,
        username: user.username,
      };
      next();
    } catch (err) {
      next(new Error('unauthorized: invalid or expired token'));
    }
  });

  // Simple per-socket rate limiter for answer:submit (10/sec sliding window).
  function checkAnswerRate(socket) {
    const now = Date.now();
    socket.data.answerTimes = (socket.data.answerTimes || []).filter((t) => now - t < 1000);
    if (socket.data.answerTimes.length >= 10) return false;
    socket.data.answerTimes.push(now);
    return true;
  }

  // Track open sockets per user (module-scope map above) so a second tab
  // doesn't look like a disconnect. Only the LAST socket closing starts
  // the grace period.
  io.on('connection', (socket) => {
    const { id: userId, username } = socket.user;

    // Per-user room: rematch offers today, friends/invites in Phase 4.
    socket.join(`user:${userId}`);

    let set = userSockets.get(userId);
    if (!set) {
      set = new Set();
      userSockets.set(userId, set);
    }
    const firstSocket = set.size === 0;
    set.add(socket.id);
    if (firstSocket) engine.markReconnected(userId);

    // Track which user this socket belongs to for disconnect handling.
    socket.data.userId = userId;

    socket.on('room:join', async ({ code } = {}) => {
      try {
        const room = await findRoomByCode(code);
        if (!room) return socket.emit('room:error', { message: 'Room not found' });
        if (!isMember(room, userId)) return socket.emit('room:error', { message: 'You are not a member of this room' });
        socket.join(`room:${room.code}`);
        socket.emit('room:updated', { room: room.toPublicJSON() });
        socket.to(`room:${room.code}`).emit('room:player-joined', {
          user: { id: userId, username },
        });
      } catch (err) {
        socket.emit('room:error', { message: 'Could not join room' });
      }
    });

    socket.on('room:leave', async ({ code } = {}) => {
      const roomCode = String(code || '').toUpperCase();
      socket.leave(`room:${roomCode}`);
      socket.to(`room:${roomCode}`).emit('room:player-left', { userId, username });
      // Intentional leave during a LIVE match = immediate abandon (no grace).
      // Leaving a waiting lobby is a no-op here (no live match exists yet).
      engine.abandonOnRoomLeave(userId, roomCode);
    });

    socket.on('room:ready', async ({ code } = {}) => {
      try {
        const room = await findRoomByCode(code);
        if (!room || !isMember(room, userId)) return socket.emit('room:error', { message: 'Not a member of this room' });
        if (room.status !== 'waiting') return socket.emit('room:error', { message: 'Match already started' });
        const entry = room.players.find((p) => p.user._id.toString() === userId);
        if (entry) {
          entry.ready = true;
          await room.save();
        }
        io.to(`room:${room.code}`).emit('room:updated', { room: room.toPublicJSON() });
      } catch (err) {
        socket.emit('room:error', { message: 'Could not update ready state' });
      }
    });

    socket.on('room:unready', async ({ code } = {}) => {
      try {
        const room = await findRoomByCode(code);
        if (!room || !isMember(room, userId)) return socket.emit('room:error', { message: 'Not a member of this room' });
        if (room.status !== 'waiting') return socket.emit('room:error', { message: 'Match already started' });
        const entry = room.players.find((p) => p.user._id.toString() === userId);
        if (entry) {
          entry.ready = false;
          await room.save();
        }
        io.to(`room:${room.code}`).emit('room:updated', { room: room.toPublicJSON() });
      } catch (err) {
        socket.emit('room:error', { message: 'Could not update ready state' });
      }
    });

    socket.on('match:start', async ({ code } = {}) => {
      try {
        const room = await Room.findOne({ code: String(code).toUpperCase() });
        if (!room) return socket.emit('room:error', { message: 'Room not found' });
        const { matchId } = await engine.startMatch(room._id.toString(), userId);
        socket.emit('match:accepted', { matchId });
      } catch (err) {
        socket.emit('room:error', { message: err.message || 'Could not start match' });
      }
    });

    socket.on('answer:submit', async ({ matchId, optionIndex } = {}) => {
      if (!checkAnswerRate(socket)) {
        return socket.emit('answer:received', { accepted: false, reason: 'rate-limited' });
      }
      const result = engine.submitAnswer(String(matchId || ''), userId, optionIndex);
      socket.emit('answer:received', result); // private ack — only to the submitter
    });

    socket.on('match:reconnect', async ({ matchId } = {}) => {
      try {
        const snapshot = await engine.getSnapshot(String(matchId || ''), userId);
        if (!snapshot) return socket.emit('room:error', { message: 'Match not found or access denied' });
        socket.emit('match:snapshot', snapshot);
      } catch (err) {
        socket.emit('room:error', { message: 'Could not restore match state' });
      }
    });

    // --- Phase 3: matchmaking ------------------------------------------------
    // Mirrors the REST endpoints (POST /api/matchmaking/join|/cancel) over the
    // socket so the Quick Match UI stays on one transport. Same validation.
    socket.on('matchmaking:join', async ({ mode, category } = {}) => {
      if (!matchmaker) return socket.emit('matchmaking:error', { message: 'Matchmaking unavailable' });
      try {
        const me = await User.findById(userId).select('username avatar rating');
        if (!me) return socket.emit('matchmaking:error', { message: 'Account not found' });
        const result = await matchmaker.join({
          userId,
          username: me.username,
          avatar: me.avatar,
          rating: me.rating,
          mode,
          category,
        });
        if (result.matched) {
          socket.emit('matchmaking:matched', {});
        } else {
          socket.emit('matchmaking:queued', { position: result.position });
        }
      } catch (err) {
        socket.emit('matchmaking:error', { message: err.message || 'Could not join matchmaking' });
      }
    });

    socket.on('matchmaking:cancel', async () => {
      if (!matchmaker) return;
      const removed = matchmaker.leave(userId);
      socket.emit('matchmaking:cancelled', { removed });
    });

    socket.on('disconnect', () => {
      // Only the last socket closing counts as a disconnect (multi-tab safe).
      // The engine starts the reconnect grace period; matches CONTINUE.
      const uid = socket.data.userId;
      const set = userSockets.get(uid);
      if (set) {
        set.delete(socket.id);
        if (set.size === 0) {
          userSockets.delete(uid);
          engine.markDisconnected(uid);
          // Phase 3: leaving the site while queued drops the queue entry.
          if (matchmaker) matchmaker.leave(uid);
        }
      } else {
        engine.markDisconnected(uid);
        if (matchmaker) matchmaker.leave(uid);
      }
    });
  });

  return io;
}

module.exports = { initSocket, isUserOnline, getOnlineUserIds };
