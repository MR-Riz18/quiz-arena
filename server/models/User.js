const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const statsSchema = new mongoose.Schema(
  {
    wins: { type: Number, default: 0 },
    losses: { type: Number, default: 0 },
    matchesPlayed: { type: Number, default: 0 },
    correctAnswers: { type: Number, default: 0 }, // Phase 3: accuracy leaderboard
    totalAnswers: { type: Number, default: 0 }, // Phase 3: accuracy leaderboard
    totalResponseMs: { type: Number, default: 0 }, // Phase 3: avg response time
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: [true, 'Username is required'],
      unique: true,
      trim: true,
      minlength: [3, 'Username must be at least 3 characters'],
      maxlength: [20, 'Username must be at most 20 characters'],
      match: [/^[A-Za-z0-9_]+$/, 'Username may only contain letters, numbers and underscores'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Invalid email address'],
    },
    passwordHash: { type: String, required: true, select: false },
    avatar: { type: String, default: 'default' },
    role: { type: String, enum: ['player', 'admin'], default: 'player' },
    rating: { type: Number, default: 1000 }, // Elo-style rating — used from Phase 3
    tier: { type: String, default: 'Silver' }, // player tiers — 1000 rating = Silver (Phase 3)
    stats: { type: statsSchema, default: () => ({}) },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Virtual setter hashes with bcrypt(10) before validation runs.
userSchema.virtual('password').set(function (pw) {
  this._plainPassword = pw;
});

userSchema.pre('validate', async function () {
  if (this._plainPassword) {
    if (this._plainPassword.length < 8) {
      this.invalidate('password', 'Password must be at least 8 characters');
      return;
    }
    this.passwordHash = await bcrypt.hash(this._plainPassword, 10);
    this._plainPassword = undefined;
  }
});

userSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.passwordHash);
};

// Safe shape for clients. Email is only ever included for the owner themself.
userSchema.methods.toSafeJSON = function (self = false) {
  const o = this.toObject ? this.toObject() : this;
  const safe = {
    id: o._id.toString(),
    username: o.username,
    avatar: o.avatar,
    role: o.role,
    rating: o.rating,
    tier: o.tier,
    stats: o.stats,
  };
  if (self) safe.email = o.email;
  return safe;
};

module.exports = mongoose.model('User', userSchema);
