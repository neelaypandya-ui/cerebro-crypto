/* ============================================================
   VIPER — Ratchet System
   ============================================================
   Progressively locks in intraday gains by restricting which
   modes can trade and reducing position sizing as daily P&L
   reaches higher thresholds.

   Levels:
     NORMAL      →  0 to +0.3%   →  all modes, 1.0x sizing
     PROTECTED   → +0.3% to +0.6% → LUNGE disabled, 0.8x
     PRESERVATION→ +0.6% to +1.0% → STRIKE only, 0.6x
     LOCKED      → >+1.0%        → no trading
     RECOVERY    → session in loss → LUNGE disabled, 0.75x
   ============================================================ */

export const RATCHET_LEVELS = {
  NORMAL:       'NORMAL',
  PROTECTED:    'PROTECTED',
  PRESERVATION: 'PRESERVATION',
  LOCKED:       'LOCKED',
  RECOVERY:     'RECOVERY',
};

const THRESHOLDS = {
  PROTECTED:    0.5,   // +0.5%
  PRESERVATION: 1.0,   // +1.0%
  LOCKED:       2.0,   // +2.0%
};

/**
 * Evaluate which ratchet level should be active given current daily P&L.
 * Ratchet only moves upward (tighter) based on daily high P&L.
 *
 * @param {number} dailyPnLPct - current daily P&L as percentage of allocated capital
 * @param {number} dailyHighPnLPct - highest daily P&L hit today (for ratchet locking)
 * @param {string} currentLevel - current ratchet level
 * @returns {string} new ratchet level
 */
export function evaluateRatchet(dailyPnLPct, dailyHighPnLPct, currentLevel) {
  // If in loss territory, enter RECOVERY
  if (dailyPnLPct < 0) {
    return RATCHET_LEVELS.RECOVERY;
  }

  // Use the higher of current P&L and historical daily high for ratchet decisions
  // This prevents the ratchet from loosening when P&L dips
  const effectivePnL = Math.max(dailyPnLPct, dailyHighPnLPct);

  // Ratchet only moves up (tighter), never down during a session
  if (effectivePnL >= THRESHOLDS.LOCKED) {
    return RATCHET_LEVELS.LOCKED;
  }

  if (effectivePnL >= THRESHOLDS.PRESERVATION) {
    // Can only stay same or tighten
    if (currentLevel === RATCHET_LEVELS.LOCKED) return RATCHET_LEVELS.LOCKED;
    return RATCHET_LEVELS.PRESERVATION;
  }

  if (effectivePnL >= THRESHOLDS.PROTECTED) {
    if (currentLevel === RATCHET_LEVELS.LOCKED) return RATCHET_LEVELS.LOCKED;
    if (currentLevel === RATCHET_LEVELS.PRESERVATION) return RATCHET_LEVELS.PRESERVATION;
    return RATCHET_LEVELS.PROTECTED;
  }

  // Below PROTECTED threshold
  // If we were already at a higher ratchet level, stay there (ratchet doesn't loosen)
  if (currentLevel === RATCHET_LEVELS.LOCKED ||
      currentLevel === RATCHET_LEVELS.PRESERVATION ||
      currentLevel === RATCHET_LEVELS.PROTECTED) {
    return currentLevel;
  }

  return RATCHET_LEVELS.NORMAL;
}

/**
 * Get which modes are allowed at the current ratchet level.
 * @param {string} level
 * @returns {string[]} - array of allowed mode names
 */
export function getAllowedModes(level) {
  switch (level) {
    case RATCHET_LEVELS.LOCKED:
      return [];
    case RATCHET_LEVELS.PRESERVATION:
      return ['STRIKE'];
    case RATCHET_LEVELS.PROTECTED:
      return ['STRIKE', 'COIL'];
    case RATCHET_LEVELS.RECOVERY:
      return ['STRIKE', 'COIL'];
    case RATCHET_LEVELS.NORMAL:
    default:
      return ['STRIKE', 'COIL', 'LUNGE'];
  }
}

/**
 * Get the sizing multiplier for the current ratchet level.
 * @param {string} level
 * @returns {number}
 */
export function getSizingMultiplier(level) {
  switch (level) {
    case RATCHET_LEVELS.LOCKED:       return 0;
    case RATCHET_LEVELS.PRESERVATION: return 0.6;
    case RATCHET_LEVELS.PROTECTED:    return 0.8;
    case RATCHET_LEVELS.RECOVERY:     return 0.75;
    case RATCHET_LEVELS.NORMAL:
    default:                          return 1.0;
  }
}

/**
 * Get display info for a ratchet level (for UI rendering).
 * @param {string} level
 * @returns {{ label: string, color: string, index: number }}
 */
export function getRatchetDisplayInfo(level) {
  switch (level) {
    case RATCHET_LEVELS.RECOVERY:
      return { label: 'Recovery', color: '#ff4560', index: 0 };
    case RATCHET_LEVELS.NORMAL:
      return { label: 'Normal', color: '#00d4aa', index: 1 };
    case RATCHET_LEVELS.PROTECTED:
      return { label: 'Protected', color: '#f0b429', index: 2 };
    case RATCHET_LEVELS.PRESERVATION:
      return { label: 'Preservation', color: '#ff8c00', index: 3 };
    case RATCHET_LEVELS.LOCKED:
      return { label: 'Locked', color: '#ff4560', index: 4 };
    default:
      return { label: 'Normal', color: '#00d4aa', index: 1 };
  }
}
