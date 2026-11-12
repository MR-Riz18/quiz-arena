const mongoose = require('mongoose');

// Persisted match record. Completed matches are fully denormalized
// (player snapshots) so history stays intact even if users/questions change.
const answerSchema = new mongoose.Schema(
  {
    questionIndex: { type: Number, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    username: { type: String }, // denormalized at finalize
    optionIndex: { type: Number, required: true, min: 0, max: 3 },
    correct: { type: Boolean, required: true },
    timeMs: { type: Number, required: true },
    points: { type: Number, required: true },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const placementSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    username: { type: String },
    avatar: { type: String },
    rank: { type: Number, required: true },
    score: { type: Number, required: true },
    abandoned: { type: Boolean, default: false }, // Phase 2: forfeit/abandon markers
  },
  { _id: false }
);

const playerSnapshotSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    username: { type: String },
    avatar: { type: String },
    abandoned: { type: Boolean, default: false }, // Phase 2
  },
  { _id: false }
);

const ratingChangeSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    before: { type: Number, required: true },
    after: { type: Number, required: true },
    delta: { type: Number, required: true },
    tierBefore: { type: String },
    tierAfter: { type: String },
  },
  { _id: false }
);

const matchSchema = new mongoose.Schema(
  {
    room: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', required: true },
    code: { type: String, required: true }, // room code, for convenience
    players: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    playerSnapshots: { type: [playerSnapshotSchema], default: [] }, // filled at finalize
    mode: { type: String, enum: ['casual', 'competitive'], default: 'casual' },
    rated: { type: Boolean, default: false }, // true for competitive matchmaking (Phase 3)
    categoryId: { type: String, default: 'mixed' }, // room config at match start (Phase 3)
    ratingChanges: { type: [ratingChangeSchema], default: [] }, // Phase 3: Elo deltas
    questionIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Question' }],
    currentIndex: { type: Number, default: 0 },
    state: {
      type: String,
      enum: ['waiting', 'countdown', 'inProgress', 'questionEnded', 'completed', 'cancelled'],
      default: 'waiting',
    },
    scores: { type: Map, of: Number, default: {} }, // userId -> points
    answers: { type: [answerSchema], default: [] },
    placements: { type: [placementSchema], default: [] },
    abandonedPlayers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', default: [] }], // Phase 2
    forfeit: { type: Boolean, default: false }, // Phase 2: ended by forfeit
    config: {
      timePerQuestion: { type: Number, default: 15 },
      questionCount: { type: Number, default: 5 },
    },
    startedAt: { type: Date },
    completedAt: { type: Date },
  },
  { timestamps: true }
);

matchSchema.index({ players: 1, createdAt: -1 });
matchSchema.index({ state: 1 });

module.exports = mongoose.model('Match', matchSchema);
