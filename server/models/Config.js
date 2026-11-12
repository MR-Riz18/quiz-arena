const mongoose = require('mongoose');

// Singleton-style key/value store for admin-editable platform configuration.
// Known keys (see services/config.js DEFAULTS):
//   tiers             [{name, min}]  — rating tier bands, ascending by min
//   kFactor           number        — Elo K-factor
//   scoring           {base, speedBonus, streakBonus, streakCap}
//   reconnectGraceMs  number        — ms a disconnected player keeps their seat
const configSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, trim: true },
    value: { type: mongoose.Schema.Types.Mixed, required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Config', configSchema);
