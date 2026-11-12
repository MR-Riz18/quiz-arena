const asyncHandler = require('../utils/asyncHandler');
const { ApiError, ok, created } = require('../utils/response');
const Match = require('../models/Match');
const Room = require('../models/Room');

// GET /api/matches/:id — participants only.
// Correct answers are included ONLY when the match is completed.
const getMatch = asyncHandler(async (req, res) => {
  const match = await Match.findById(req.params.id).populate('questionIds');
  if (!match) throw new ApiError(404, 'Match not found');

  const uid = req.user._id.toString();
  const isParticipant = (match.players || []).some((p) => p.toString() === uid);
  if (!isParticipant) throw new ApiError(403, 'You did not take part in this match');

  const completed = match.state === 'completed';
  const questions = (match.questionIds || []).map((q) => {
    const base = {
      id: q._id.toString(),
      text: q.text,
      options: q.options,
      difficulty: q.difficulty,
    };
    // Reveal answers only after the match is over.
    if (completed) {
      base.correctIndex = q.correctIndex;
      base.explanation = q.explanation;
    }
    return base;
  });

  ok(res, {
    match: {
      id: match._id.toString(),
      code: match.code,
      mode: match.mode,
      state: match.state,
      currentIndex: match.currentIndex,
      scores: match.scores instanceof Map ? Object.fromEntries(match.scores) : match.scores,
      answers: match.answers,
      placements: match.placements,
      playerSnapshots: match.playerSnapshots,
      ratingChanges: match.ratingChanges || [], // Phase 3: Elo deltas (empty for casual)
      abandonedPlayers: (match.abandonedPlayers || []).map((p) => p.toString()),
      forfeit: !!match.forfeit,
      questions,
      config: match.config,
      startedAt: match.startedAt,
      completedAt: match.completedAt,
    },
  });
});

// POST /api/matches/:id/rematch — any participant of a COMPLETED match can
// spin up a fresh room with identical config. The requester becomes host;
// the other participants get a `match:rematch-offered` socket event on their
// per-user rooms (`user:<userId>`) so they can one-click join. No rating impact.
const rematch = asyncHandler(async (req, res) => {
  const match = await Match.findById(req.params.id);
  if (!match) throw new ApiError(404, 'Match not found');

  const uid = req.user._id.toString();
  const isParticipant = (match.players || []).some((p) => p.toString() === uid);
  if (!isParticipant) throw new ApiError(403, 'You did not take part in this match');
  if (match.state !== 'completed') throw new ApiError(409, 'Only completed matches can be rematched');

  const origRoom = await Room.findById(match.room).lean();
  const code = await Room.generateUniqueCode();
  const baseName = (origRoom && origRoom.name) || 'Quiz battle';

  const room = await Room.create({
    code,
    name: `${baseName} (rematch)`.slice(0, 60),
    host: req.user._id,
    visibility: (origRoom && origRoom.visibility) || 'public',
    config: (origRoom && origRoom.config) || {},
    players: [{ user: req.user._id, ready: false, connected: true }],
  });

  // Notify the other participants via their per-user socket rooms.
  const io = req.app.get('io');
  if (io) {
    const others = (match.players || []).map((p) => p.toString()).filter((id) => id !== uid);
    for (const otherId of others) {
      io.to(`user:${otherId}`).emit('match:rematch-offered', {
        roomCode: code,
        fromUsername: req.user.username,
        matchId: match._id.toString(),
      });
    }
  }

  const populated = await Room.findOne({ code })
    .populate('players.user', 'username avatar')
    .populate('host', 'username');
  created(res, { room: populated.toPublicJSON(), code }, 'Rematch room created');
});

module.exports = { getMatch, rematch };
