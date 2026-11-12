const mongoose = require('mongoose');

// Immutable record of sensitive/administrative actions.
// Written via utils/audit.js logAudit() — failures are swallowed so logging
// can never break the request it instruments.
const auditLogSchema = new mongoose.Schema(
  {
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    action: { type: String, required: true, trim: true }, // e.g. 'admin.users.update'
    targetType: { type: String, default: null }, // e.g. 'User', 'Question'
    targetId: { type: String, default: null },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ actor: 1, createdAt: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
