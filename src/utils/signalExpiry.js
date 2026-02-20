/* ============================================================
   Cerebro Crypto — Signal Expiry Manager
   ============================================================ */

const EXPIRY_MS = {
  ONE_MINUTE: 15000,      // 15 seconds for 1m timeframe
  FIVE_MINUTE: 30000,     // 30 seconds for 5m timeframe
  FIFTEEN_MINUTE: 60000,  // 60 seconds for 15m
  ONE_HOUR: 120000,       // 2 minutes for 1H
  FOUR_HOUR: 300000,      // 5 minutes for 4H
  ONE_DAY: 600000,        // 10 minutes for 1D
  ONE_WEEK: 1800000,      // 30 minutes for 1W
};

/**
 * Create a timestamped signal.
 */
export function createSignal(signal, timeframe = 'FIVE_MINUTE') {
  return {
    ...signal,
    createdAt: Date.now(),
    expiresAt: Date.now() + (EXPIRY_MS[timeframe] || 30000),
    timeframe,
    expired: false,
  };
}

/**
 * Check if a signal is still valid.
 */
export function isSignalValid(signal) {
  if (!signal || signal.expired) return false;
  return Date.now() < signal.expiresAt;
}

/**
 * Filter out expired signals from an array.
 */
export function filterExpiredSignals(signals) {
  const now = Date.now();
  return signals.filter((s) => now < s.expiresAt && !s.expired);
}

/**
 * Get remaining time for a signal in ms.
 */
export function signalTTL(signal) {
  if (!signal) return 0;
  return Math.max(0, signal.expiresAt - Date.now());
}
