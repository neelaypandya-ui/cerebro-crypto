/* ============================================================
   VIPER — Per-Ticker Tuning
   ============================================================
   Per-pair calibration for STRIKE TP/Stop, COIL sizing, and
   LUNGE eligibility. Stored in localStorage for persistence.
   ============================================================ */

const DEFAULT_TUNING = {
  'BTC-USD':  { strikeTP: 0.13, strikeStop: 0.08, strikeMaxDuration: 240, coilPositionMult: 1.0, lungeEligible: true },
  'ETH-USD':  { strikeTP: 0.17, strikeStop: 0.10, strikeMaxDuration: 240, coilPositionMult: 1.0, lungeEligible: true },
  'SOL-USD':  { strikeTP: 0.22, strikeStop: 0.14, strikeMaxDuration: 210, coilPositionMult: 0.9, lungeEligible: true },
  'DOGE-USD': { strikeTP: 0.20, strikeStop: 0.12, strikeMaxDuration: 180, coilPositionMult: 0.8, lungeEligible: true },
  'XRP-USD':  { strikeTP: 0.16, strikeStop: 0.10, strikeMaxDuration: 210, coilPositionMult: 0.9, lungeEligible: true },
  'AVAX-USD': { strikeTP: 0.20, strikeStop: 0.12, strikeMaxDuration: 210, coilPositionMult: 0.85, lungeEligible: true },
  'LINK-USD': { strikeTP: 0.18, strikeStop: 0.11, strikeMaxDuration: 210, coilPositionMult: 0.9, lungeEligible: true },
  'ADA-USD':  { strikeTP: 0.18, strikeStop: 0.11, strikeMaxDuration: 200, coilPositionMult: 0.85, lungeEligible: true },
  'DOT-USD':  { strikeTP: 0.19, strikeStop: 0.12, strikeMaxDuration: 200, coilPositionMult: 0.85, lungeEligible: true },
  'MATIC-USD':{ strikeTP: 0.20, strikeStop: 0.12, strikeMaxDuration: 200, coilPositionMult: 0.8, lungeEligible: true },
};

// Fallback for unknown pairs
const FALLBACK_TUNING = {
  strikeTP: 0.18,
  strikeStop: 0.11,
  strikeMaxDuration: 210,  // seconds
  coilPositionMult: 0.85,
  lungeEligible: true,
};

const LS_KEY = 'viper_ticker_tuning';

/**
 * Get tuning for a given pair.
 * @param {string} pair - e.g. 'BTC-USD'
 * @returns {{ strikeTP: number, strikeStop: number, strikeMaxDuration: number, coilPositionMult: number, lungeEligible: boolean }}
 */
export function getTuning(pair) {
  const saved = loadTuning();
  if (saved[pair]) return { ...FALLBACK_TUNING, ...saved[pair] };
  if (DEFAULT_TUNING[pair]) return { ...DEFAULT_TUNING[pair] };
  return { ...FALLBACK_TUNING };
}

/**
 * Load all saved tuning from localStorage.
 * @returns {Object}
 */
export function loadTuning() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/**
 * Save tuning overrides to localStorage.
 * @param {Object} tuning - { 'BTC-USD': { strikeTP: ... }, ... }
 */
export function saveTuning(tuning) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(tuning));
  } catch {
    /* quota exceeded */
  }
}

/**
 * Update tuning for a single pair.
 * @param {string} pair
 * @param {Object} overrides
 */
export function updatePairTuning(pair, overrides) {
  const current = loadTuning();
  current[pair] = { ...(current[pair] || {}), ...overrides };
  saveTuning(current);
}

/**
 * Get the full default tuning table (for Settings UI).
 */
export function getDefaultTuningTable() {
  return { ...DEFAULT_TUNING };
}
