/* ============================================================
   HYDRA — Self-Calibrating Threshold
   ============================================================
   Monitors win rate and adjusts entry threshold automatically.
   After every 10 completed trades:
   - Win rate < 40% → raise threshold +3 (be more selective)
   - Win rate > 70% for 20+ trades → lower threshold -2
   - Never above 95, never below 65
   ============================================================ */

const LS_KEY = 'hydra_threshold';
const LS_HISTORY_KEY = 'hydra_calibration_history';

/**
 * Recalibrate the entry threshold based on recent trade performance.
 *
 * @param {Object[]} recentTrades - array of completed trades with { pnl } field
 * @param {number} currentThreshold - current entry threshold (65-95)
 * @param {number} initialThreshold - the threshold set by user in settings
 *
 * @returns {{ threshold: number, changed: boolean, reason: string }}
 */
export function recalibrateThreshold(recentTrades, currentThreshold, initialThreshold = 80) {
  if (!recentTrades || recentTrades.length < 10) {
    return { threshold: currentThreshold, changed: false, reason: 'Not enough trades (need 10+)' };
  }

  const last10 = recentTrades.slice(0, 10);
  const winRate10 = last10.filter((t) => (t.pnl || t.netPnL || 0) > 0).length / last10.length;

  // Max reduction from initial threshold
  const maxReduction = 10;
  const floor = Math.max(65, initialThreshold - maxReduction);

  // Win rate < 40% over last 10 → raise by 3
  if (winRate10 < 0.40) {
    const newThreshold = Math.min(currentThreshold + 3, 95);
    if (newThreshold !== currentThreshold) {
      saveCalibrationEvent({ from: currentThreshold, to: newThreshold, winRate: winRate10, trades: 10 });
      return {
        threshold: newThreshold,
        changed: true,
        reason: `Win rate ${(winRate10 * 100).toFixed(0)}% (last 10) — raised threshold to ${newThreshold}`,
      };
    }
  }

  // Win rate > 70% over 20+ trades → lower by 2
  if (recentTrades.length >= 20) {
    const last20 = recentTrades.slice(0, 20);
    const winRate20 = last20.filter((t) => (t.pnl || t.netPnL || 0) > 0).length / last20.length;

    if (winRate20 > 0.70) {
      const newThreshold = Math.max(currentThreshold - 2, floor);
      if (newThreshold !== currentThreshold) {
        saveCalibrationEvent({ from: currentThreshold, to: newThreshold, winRate: winRate20, trades: 20 });
        return {
          threshold: newThreshold,
          changed: true,
          reason: `Win rate ${(winRate20 * 100).toFixed(0)}% (last 20) — lowered threshold to ${newThreshold}`,
        };
      }
    }
  }

  return { threshold: currentThreshold, changed: false, reason: 'No adjustment needed' };
}

/**
 * Save threshold to localStorage.
 */
export function saveThreshold(threshold) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(threshold));
  } catch { /* ignore */ }
}

/**
 * Load threshold from localStorage.
 */
export function loadThreshold(defaultVal = 80) {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw != null) {
      const val = JSON.parse(raw);
      return Math.max(65, Math.min(95, val));
    }
  } catch { /* ignore */ }
  return defaultVal;
}

/**
 * Save a calibration event to history.
 */
function saveCalibrationEvent(event) {
  try {
    const raw = localStorage.getItem(LS_HISTORY_KEY);
    const history = raw ? JSON.parse(raw) : [];
    history.unshift({ ...event, timestamp: Date.now() });
    // Keep last 50 events
    localStorage.setItem(LS_HISTORY_KEY, JSON.stringify(history.slice(0, 50)));
  } catch { /* ignore */ }
}

/**
 * Load calibration history.
 */
export function loadCalibrationHistory() {
  try {
    const raw = localStorage.getItem(LS_HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
