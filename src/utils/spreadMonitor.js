/* ============================================================
   Cerebro Crypto — Spread Monitor
   ============================================================ */

/**
 * Spread health thresholds (as percentage).
 */
const THRESHOLDS = {
  GREEN: 0.05,   // < 0.05% = healthy
  YELLOW: 0.15,  // 0.05% - 0.15% = caution
  // > 0.15% = red (dangerous for scalping)
};

/**
 * Evaluate spread health from best bid and ask.
 * @param {number} bestBid
 * @param {number} bestAsk
 * @returns {{ spreadAbs, spreadPct, status: 'green'|'yellow'|'red', scalpSafe: boolean, message: string }}
 */
export function evaluateSpread(bestBid, bestAsk) {
  if (!bestBid || !bestAsk || bestBid <= 0 || bestAsk <= 0) {
    return { spreadAbs: 0, spreadPct: 0, status: 'red', scalpSafe: false, message: 'No spread data available' };
  }

  const spreadAbs = bestAsk - bestBid;
  const midPrice = (bestBid + bestAsk) / 2;
  const spreadPct = (spreadAbs / midPrice) * 100;

  let status, message;
  if (spreadPct < THRESHOLDS.GREEN) {
    status = 'green';
    message = `Tight spread (${spreadPct.toFixed(4)}%)`;
  } else if (spreadPct < THRESHOLDS.YELLOW) {
    status = 'yellow';
    message = `Moderate spread (${spreadPct.toFixed(4)}%) — scalp with caution`;
  } else {
    status = 'red';
    message = `Wide spread (${spreadPct.toFixed(4)}%) — scalping disabled`;
  }

  return {
    spreadAbs,
    spreadPct,
    status,
    scalpSafe: status !== 'red',
    message,
  };
}

/**
 * Track spread history for a pair (rolling window).
 */
export function createSpreadTracker(windowSize = 60) {
  return { history: [], windowSize };
}

export function addSpreadSample(tracker, spreadPct) {
  const next = { ...tracker, history: [...tracker.history, { spreadPct, timestamp: Date.now() }] };
  if (next.history.length > next.windowSize) {
    next.history = next.history.slice(-next.windowSize);
  }
  return next;
}

export function getSpreadStats(tracker) {
  if (tracker.history.length === 0) return { avg: 0, min: 0, max: 0, current: 0 };
  const spreads = tracker.history.map((s) => s.spreadPct);
  return {
    avg: spreads.reduce((a, b) => a + b, 0) / spreads.length,
    min: Math.min(...spreads),
    max: Math.max(...spreads),
    current: spreads[spreads.length - 1],
  };
}
