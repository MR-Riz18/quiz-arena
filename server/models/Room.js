const mongoose = require('mongoose');

const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous chars

function generateRoomCode() {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)];
  }
  return code;
}

const roomPlayerSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    ready: { type: Boolean, default: false },
    connected: { type: Boolean, default: true },
  },
  { _id: false }
);

const roomConfigSchema = new mongoose.Schema(
  {
    maxPlayers: { type: Number, default: 2, min: 2, max: 8 },
    categoryId: { type: String, default: 'mixed' }, // ObjectId string or 'mixed'
    difficulty: { type: String, enum: ['mixed', 'easy', 'medium', 'hard'], default: 'mixed' },
    questionCount: { type: Number, default: 5, min: 3, max: 20 },
    timePerQuestion: { type: Number, default: 15, min: 5, max: 60 }, // seconds
    rated: { type: Boolean, default: false }, // competitive mode — Phase 3
  },
  { _id: false }
);

const roomSchema = new mongoose.Schema(
  {
    code: { type: String, unique: true, required: true },
    name: { type: String, required: [true, 'Room name is required'], trim: true, maxlength: [60, 'Room name too long'] },
    host: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    visibility: { type: String, enum: ['public', 'private'], default: 'public' },
    config: { type: roomConfigSchema, default: () => ({}) },
    players: { type: [roomPlayerSchema], default: [] },
    status: { type: String, enum: ['waiting', 'inProgress', 'completed'], default: 'waiting' },
  },
  { timestamps: true }
);

roomSchema.index({ status: 1, visibility: 1, updatedAt: -1 });

roomSchema.statics.generateUniqueCode = async function () {
  for (let i = 0; i < 10; i++) {
    const code = generateRoomCode();
    const exists = await this.findOne({ code }).select('_id').lean();
    if (!exists) return code;
  }
  throw new Error('Could not generate a unique room code');
};

// Client-safe shape for lobby/match screens.
roomSchema.methods.toPublicJSON = function () {
  const o = this.toObject();
  return {
    id: o._id.toString(),
    code: o.code,
    name: o.name,
    visibility: o.visibility,
    status: o.status,
    config: o.config,
    host: o.host && o.host._id ? { id: o.host._id.toString(), username: o.host.username } : o.host,
    players: (o.players || []).map((p) => ({
      userId: p.user && p.user._id ? p.user._id.toString() : p.user.toString(),
      username: p.user && p.user.username ? p.user.username : undefined,
      avatar: p.user && p.user.avatar ? p.user.avatar : undefined,
      ready: p.ready,
      connected: p.connected,
    })),
  };
};

const Room = mongoose.model('Room', roomSchema);
Room.generateRoomCode = generateRoomCode; // exported for unit tests
module.exports = Room;
