/* ============================================================
   HYDRA — Session Profiles (per-pair UTC hour scoring)
   ============================================================ */

const LS_KEY = 'hydra_session_profiles';

// Hard-coded baselines for major pairs
const BASELINE_PROFILES = {
  'BTC-USD': {
    0: 6, 1: 3, 2: 2, 3: 2, 4: 3, 5: 4, 6: 7, 7: 10,
    8: 9, 9: 11, 10: 8, 11: 8, 12: 9, 13: 12, 14: 12,
    15: 11, 16: 10, 17: 8, 18: 7, 19: 7, 20: 6, 21: 6, 22: 5, 23: 5,
    default: 7,
  },
  'ETH-USD': {
    0: 5, 1: 3, 2: 2, 3: 2, 4: 3, 5: 4, 6: 6, 7: 9,
    8: 9, 9: 10, 10: 8, 11: 8, 12: 9, 13: 12, 14: 12,
    15: 12, 16: 11, 17: 9, 18: 7, 19: 7, 20: 6, 21: 5, 22: 5, 23: 5,
    default: 7,
  },
  'SOL-USD': {
    0: 5, 1: 4, 2: 3, 3: 3, 4: 4, 5: 5, 6: 6, 7: 8,
    8: 8, 9: 9, 10: 8, 11: 8, 12: 9, 13: 11, 14: 11,
    15: 11, 16: 10, 17: 10, 18: 8, 19: 7, 20: 6, 21: 6, 22: 5, 23: 5,
    default: 7,
  },
  'DOGE-USD': {
    0: 4, 1: 3, 2: 2, 3: 2, 4: 3, 5: 3, 6: 5, 7: 6,
    8: 7, 9: 8, 10: 7, 11: 7, 12: 7, 13: 9, 14: 9,
    15: 9, 16: 8, 17: 7, 18: 6, 19: 5, 20: 5, 21: 4, 22: 4, 23: 4,
    default: 5,
  },
  'XRP-USD': {
    0: 4, 1: 2, 2: 2, 3: 2, 4: 2, 5: 3, 6: 5, 7: 7,
    8: 8, 9: 9, 10: 7, 11: 7, 12: 8, 13: 10, 14: 10,
    15: 10, 16: 9, 17: 7, 18: 6, 19: 5, 20: 5, 21: 4, 22: 3, 23: 3,
    default: 5,
  },
  DEFAULT: {
    0: 5, 1: 3, 2: 3, 3: 3, 4: 3, 5: 4, 6: 6, 7: 8,
    8: 8, 9: 9, 10: 7, 11: 7, 12: 8, 13: 10, 14: 10,
    15: 10, 16: 9, 17: 7, 18: 6, 19: 6, 20: 5, 21: 5, 22: 4, 23: 4,
    default: 6,
  },
};

/**
 * Get session score for a pair at a given UTC hour (0-12 scale).
 */
export function getSessionScore(pair, utcHour) {
  // Check localStorage for learned profiles first
  const learned = loadLearnedProfiles();
  const profile = learned[pair] || BASELINE_PROFILES[pair] || BASELINE_PROFILES.DEFAULT;
  return profile[utcHour] ?? profile.default ?? 6;
}

/**
 * Load learned profiles from localStorage.
 */
export function loadLearnedProfiles() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/**
 * Save learned profiles to localStorage.
 */
export function saveLearnedProfiles(profiles) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(profiles));
  } catch { /* ignore */ }
}

/**
 * Update session profile for a pair based on completed trades.
 * Called after every 20 trades on a pair.
 * Blends historical baseline with live win rate data.
 */
export function updateSessionProfile(pair, trades) {
  if (!trades || trades.length < 20) return;

  // Group trades by UTC hour
  const hourBuckets = {};
  for (const t of trades) {
    const hour = new Date(t.timestamp || t.entryTime).getUTCHours();
    if (!hourBuckets[hour]) hourBuckets[hour] = { wins: 0, total: 0 };
    hourBuckets[hour].total++;
    if ((t.pnl || t.netPnL || 0) > 0) hourBuckets[hour].wins++;
  }

  const baseline = BASELINE_PROFILES[pair] || BASELINE_PROFILES.DEFAULT;
  const learned = loadLearnedProfiles();
  const newProfile = { ...baseline };

  // For hours with enough data (5+ trades), blend with live win rate
  for (const [hour, data] of Object.entries(hourBuckets)) {
    if (data.total >= 5) {
      const winRate = data.wins / data.total;
      // Map win rate to 0-12 score: 0% → 0, 50% → 6, 80%+ → 12
      const liveScore = Math.min(12, Math.round(winRate * 15));
      // Blend: 40% baseline, 60% live (trust live data more)
      const baseScore = baseline[hour] ?? baseline.default ?? 6;
      newProfile[hour] = Math.round(baseScore * 0.4 + liveScore * 0.6);
    }
  }

  learned[pair] = newProfile;
  saveLearnedProfiles(learned);
  return newProfile;
}

export { BASELINE_PROFILES };
