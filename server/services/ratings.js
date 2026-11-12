// QuizArena Elo rating service (Phase 3).
//
// RATING POLICY (documented for players/admins):
// - Every player starts at 1000. K-factor is 32 for everyone.
// - 2-player match: standard Elo.
//     expected = 1 / (1 + 10^((Rb - Ra) / 400))
//     delta    = round(K * (actual - expected)), actual = 1 win / 0 loss
//     (draws score 0.5 — supported by the math, though the engine always
//     breaks ties, so draws don't occur in practice).
// - Multiplayer (3+ players): each player gets a fractional score from their
//   placement: score_i = (n - rank_i) / (n - 1)  (rank 1 -> 1.0, last -> 0.0).
//   expected_i is the standard Elo expectation against the FIELD AVERAGE
//   rating (mean of the other players' ratings), then
//   delta_i = round(K * (score_i - expected_i)).
//   This is approximately zero-sum (sums to ~0 up to rounding), so rating
//   points are conserved across the player base.
// - Ratings apply ONLY to competitive (rated) matches. Casual matches and
//   cancelled matches never touch ratings. Forfeit WINS count as wins
//   (the loser takes a loss) — quitting a rated match you were losing
//   still costs you rating.

const User = require('../models/User');
const { readConfig, clearConfigCache } = require('./config');

const ELO_K = 32;
const INITIAL_RATING = 1000;

// Tier thresholds. The compiled default — an admin can override these via
// the Config collection (key 'tiers'); applyMatchRatings always prefers the
// DB value when present (60s cache, see services/config.js).
const TIERS = [
  { name: 'Master', min: 1800 },
  { name: 'Diamond', min: 1600 },
  { name: 'Platinum', min: 1400 },
  { name: 'Gold', min: 1200 },
  { name: 'Silver', min: 1000 },
  { name: 'Bronze', min: -Infinity },
];

function tierForTiers(rating, tiers) {
  const r = Number(rating) || 0;
  const list = Array.isArray(tiers) && tiers.length ? tiers : TIERS;
  for (const t of list) {
    if (r >= t.min) return t.name;
  }
  return list.length ? list[list.length - 1].name : 'Bronze';
}

function tierForRating(rating) {
  return tierForTiers(rating, TIERS);
}

// Effective rating configuration: DB overrides (60s cached) with compiled
// fallbacks. Returns { tiers, kFactor }.
async function getRatingConfig() {
  const cfg = await readConfig();
  return { tiers: cfg.tiers || TIERS, kFactor: cfg.kFactor || ELO_K };
}

function expectedScore(ratingA, ratingB) {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

// Pure function — unit-testable without a DB.
// entries: [{ userId: string, rating: number, rank: number }]
// kFactor defaults to ELO_K; the live path passes the admin-configured value.
// Returns:  [{ userId, delta: integer }]
function computeRatingDeltas(entries, kFactor = ELO_K) {
  const K = Number.isFinite(kFactor) && kFactor > 0 ? kFactor : ELO_K;
  const n = entries.length;
  if (n === 0) return [];
  if (n === 1) {
    return [{ userId: entries[0].userId, delta: 0 }];
  }

  if (n === 2) {
    const [a, b] = entries;
    const actualA = a.rank === b.rank ? 0.5 : a.rank < b.rank ? 1 : 0;
    const expectedA = expectedScore(a.rating, b.rating);
    const deltaA = Math.round(K * (actualA - expectedA));
    // Zero-sum for 2 players: what one gains, the other loses.
    return [
      { userId: a.userId, delta: deltaA },
      { userId: b.userId, delta: -deltaA },
    ];
  }

  // Multiplayer: fractional placement score vs field-average expectation.
  return entries.map((p) => {
    const score = (n - p.rank) / (n - 1);
    const others = entries.filter((e) => e.userId !== p.userId);
    const fieldAvg = others.reduce((sum, e) => sum + e.rating, 0) / others.length;
    const expected = expectedScore(p.rating, fieldAvg);
    return { userId: p.userId, delta: Math.round(K * (score - expected)) };
  });
}

// Applies rating changes for one finished match. Idempotency is guaranteed by
// the caller (the engine's finalize path is double-finalize guarded), and
// matches finalize serially, so sequential saves are safe.
// Returns ratingChanges: [{ userId, before, after, delta, tierBefore, tierAfter }]
// — [] when the match is not rated.
async function applyMatchRatings({ placements, rated }) {
  if (!rated || !placements || placements.length === 0) return [];

  // Phase 4: tiers + K-factor come from admin config (60s cache), falling
  // back to the compiled constants when unset or unreachable.
  const { tiers, kFactor } = await getRatingConfig();

  const ids = placements.map((p) => p.userId);
  const users = await User.find({ _id: { $in: ids } }).select('_id username rating tier');
  const byId = new Map(users.map((u) => [u._id.toString(), u]));

  const entries = placements.map((p) => {
    const uid = p.userId.toString();
    const u = byId.get(uid);
    return { userId: uid, rating: u ? u.rating : INITIAL_RATING, rank: p.rank };
  });

  const deltas = computeRatingDeltas(entries, kFactor);
  const deltaById = new Map(deltas.map((d) => [d.userId, d.delta]));

  const changes = [];
  for (const p of placements) {
    const uid = p.userId.toString();
    const u = byId.get(uid);
    const before = u ? u.rating : INITIAL_RATING;
    // tierBefore is recomputed from the rating, not trusted from storage —
    // this self-heals tiers for users created before Phase 3.
    const tierBefore = tierForTiers(before, tiers);
    const delta = deltaById.get(uid) || 0;
    const after = before + delta;
    const tierAfter = tierForTiers(after, tiers);
    if (u) {
      u.rating = after;
      u.tier = tierAfter;
      await u.save();
    }
    changes.push({ userId: uid, before, after, delta, tierBefore, tierAfter });
  }
  return changes;
}

module.exports = {
  ELO_K,
  INITIAL_RATING,
  TIERS,
  tierForRating,
  tierForTiers,
  getRatingConfig,
  clearRatingConfigCache: clearConfigCache,
  expectedScore,
  computeRatingDeltas,
  applyMatchRatings,
};
