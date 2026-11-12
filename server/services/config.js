// Admin-editable platform configuration (Phase 4).
//
// Reads the Config collection with a 60s cache and falls back to compiled
// defaults when the DB is unreachable or a key is absent/invalid — so unit
// tests and offline paths never hang or throw.
//
// Two access styles:
//   await readConfig()  — async, freshest value (respects the 60s cache)
//   getCached()         — sync, returns last-known value (or defaults),
//                         kicking off a background refresh when stale.
//                         Safe to call from hot paths (match engine).
const mongoose = require('mongoose');

const CACHE_TTL_MS = 60 * 1000;

const DEFAULTS = {
  tiers: null, // null => use the compiled TIERS in services/ratings.js
  kFactor: 32,
  scoring: { base: 1000, speedBonus: 500, streakBonus: 100, streakCap: 500 },
  reconnectGraceMs: Number(process.env.RECONNECT_GRACE_MS) || 60000,
};

let cache = null; // { at: number, data: object }

function sanitizeScoring(v) {
  const out = {};
  for (const k of ['base', 'speedBonus', 'streakBonus', 'streakCap']) {
    if (Number.isFinite(Number(v[k])) && Number(v[k]) >= 0) out[k] = Math.round(Number(v[k]));
  }
  return out;
}

function sanitizeTiers(v) {
  if (!Array.isArray(v) || v.length === 0) return null;
  const cleaned = v
    .filter((t) => t && typeof t.name === 'string' && t.name.trim() && Number.isFinite(Number(t.min)))
    .map((t) => ({ name: t.name.trim(), min: Number(t.min) }));
  if (cleaned.length === 0) return null;
  // Highest tier first, for the lookup loop.
  cleaned.sort((a, b) => b.min - a.min);
  return cleaned;
}

function defaults() {
  return { ...DEFAULTS, scoring: { ...DEFAULTS.scoring } };
}

async function readConfig() {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_TTL_MS) return cache.data;

  const data = defaults();
  // Never touch the DB when there's no connection — instant fallback.
  if (mongoose.connection.readyState === 1) {
    try {
      const Config = require('../models/Config');
      const docs = await Config.find({}).lean();
      for (const d of docs) {
        if (d.key === 'tiers') {
          const t = sanitizeTiers(d.value);
          if (t) data.tiers = t;
        } else if (d.key === 'kFactor' && Number.isFinite(Number(d.value))) {
          const k = Math.round(Number(d.value));
          if (k >= 1 && k <= 200) data.kFactor = k;
        } else if (d.key === 'scoring' && d.value && typeof d.value === 'object') {
          Object.assign(data.scoring, sanitizeScoring(d.value));
        } else if (d.key === 'reconnectGraceMs' && Number.isFinite(Number(d.value))) {
          const ms = Math.round(Number(d.value));
          if (ms >= 5000 && ms <= 600000) data.reconnectGraceMs = ms;
        }
      }
    } catch {
      // Fall through to defaults — config must never break the request.
    }
  }

  cache = { at: now, data };
  return data;
}

// Sync accessor for hot paths. Returns cached values (or defaults) and
// refreshes in the background when stale. Never throws, never blocks.
function getCached() {
  if (!cache) {
    readConfig().catch(() => {});
    return defaults();
  }
  if (Date.now() - cache.at > CACHE_TTL_MS) readConfig().catch(() => {});
  return cache.data;
}

function clearConfigCache() {
  cache = null;
}

module.exports = { readConfig, getCached, clearConfigCache, DEFAULTS, CACHE_TTL_MS };
