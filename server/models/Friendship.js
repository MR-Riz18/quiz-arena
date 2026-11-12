const mongoose = require('mongoose');

// A friendship between two players. Direction matters only while pending
// (requester -> recipient); once accepted it is symmetric.
// pairKey is the two user ids sorted + joined, with a unique index so the
// same pair can never have two rows (in either direction).
const friendshipSchema = new mongoose.Schema(
  {
    requester: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ['pending', 'accepted'], default: 'pending' },
    pairKey: { type: String, required: true },
  },
  { timestamps: true }
);

friendshipSchema.index({ pairKey: 1 }, { unique: true });
friendshipSchema.index({ recipient: 1, status: 1 });
friendshipSchema.index({ requester: 1, status: 1 });

friendshipSchema.pre('validate', function () {
  // Compute once at creation. Never recompute on later saves: populated
  // paths (e.g. after .populate('requester')) would corrupt the key.
  if (!this.isNew || this.pairKey) return;
  if (!this.requester || !this.recipient) return;
  const a = this.requester.toString();
  const b = this.recipient.toString();
  this.pairKey = [a, b].sort().join(':');
});

// The "other" user in this friendship from the perspective of userId.
friendshipSchema.methods.otherUserId = function (userId) {
  const uid = userId.toString();
  if (this.requester.toString() === uid) return this.recipient.toString();
  return this.requester.toString();
};

module.exports = mongoose.model('Friendship', friendshipSchema);
