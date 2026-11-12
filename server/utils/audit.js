const AuditLog = require('../models/AuditLog');

// Best-effort audit logging. Never throws — a logging failure must not break
// the admin action being recorded.
async function logAudit({ actor, action, targetType = null, targetId = null, metadata = {} }) {
  try {
    if (!actor || !action) return;
    await AuditLog.create({
      actor,
      action,
      targetType,
      targetId: targetId != null ? String(targetId) : null,
      metadata: metadata || {},
    });
  } catch {
    // intentionally swallowed
  }
}

module.exports = { logAudit };
