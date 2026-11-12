const mongoose = require('mongoose');

const INVITE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// A room invitation from one player to another. Expires after 5 minutes —
// a TTL index deletes the document, so "expired" is observed as "not found"
// and the accept endpoint also defensively checks expiresAt.
const invitationSchema = new mongoose.Schema(
  {
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    room: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', required: true },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'declined', 'expired'],
      default: 'pending',
    },
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + INVITE_TTL_MS),
      index: { expireAfterSeconds: 0 },
    },
  },
  { timestamps: true }
);

invitationSchema.index({ recipient: 1, status: 1 });
invitationSchema.index({ sender: 1, status: 1 });

invitationSchema.methods.isExpired = function () {
  return this.expiresAt && this.expiresAt.getTime() <= Date.now();
};

module.exports = mongoose.model('Invitation', invitationSchema);
module.exports.INVITE_TTL_MS = INVITE_TTL_MS;
