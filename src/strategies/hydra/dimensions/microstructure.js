/* ============================================================
   HYDRA Dimension 4 — Market Microstructure Score (0–20 pts)
   ============================================================
   Order book imbalance, spread quality, and price location
   relative to VWAP. Institutional-grade signal data.
   ============================================================ */

/**
 * Score market microstructure.
 *
 * @param {Object} orderBook - { bids: [[price, qty], ...], asks: [[price, qty], ...] }
 * @param {number} spread - current spread as percentage of mid price (0.05 = 0.05%)
 * @param {number} price - current price
 * @param {number} vwap - current VWAP value
 * @param {number[]} closes - last few close prices (for VWAP reclaim detection)
 *
 * @returns {{ score: number, detail: string[], spreadBlocked: boolean }}
 */
export function scoreMicrostructure(orderBook, spread, price, vwap, closes) {
  const detail = [];
  let score = 0;
  let spreadBlocked = false;

  // ---- Order Book Imbalance (0–8 pts) ----
  const bidVol = sumTopLevels(orderBook?.bids, 10);
  const askVol = sumTopLevels(orderBook?.asks, 10);

  if (bidVol > 0 && askVol > 0) {
    const ratio = bidVol / askVol;
    if (ratio > 2.0) {
      score += 8;
      detail.push(`Book imbalance ${ratio.toFixed(2)} — strong bid (+8)`);
    } else if (ratio >= 1.5) {
      score += 6;
      detail.push(`Book imbalance ${ratio.toFixed(2)} — moderate bid (+6)`);
    } else if (ratio >= 1.2) {
      score += 4;
      detail.push(`Book imbalance ${ratio.toFixed(2)} — slight bid (+4)`);
    } else {
      detail.push(`Book imbalance ${ratio.toFixed(2)} — balanced (+0)`);
    }
  } else {
    detail.push('Order book data unavailable');
  }

  // ---- Spread Quality (0–6 pts) ----
  // Calculate spread from order book if not provided
  let spreadPct = spread;
  if (spreadPct == null && orderBook?.bids?.length > 0 && orderBook?.asks?.length > 0) {
    const bestBid = parseFloat(orderBook.bids[0][0]);
    const bestAsk = parseFloat(orderBook.asks[0][0]);
    if (bestBid > 0 && bestAsk > 0) {
      const mid = (bestBid + bestAsk) / 2;
      spreadPct = ((bestAsk - bestBid) / mid) * 100;
    }
  }

  if (spreadPct != null) {
    if (spreadPct > 0.25) {
      spreadBlocked = true;
      score += 0;
      detail.push(`Spread ${spreadPct.toFixed(3)}% — BLOCKED (>0.25%)`);
    } else if (spreadPct <= 0.03) {
      score += 6;
      detail.push(`Spread ${spreadPct.toFixed(3)}% — excellent (+6)`);
    } else if (spreadPct <= 0.08) {
      score += 4;
      detail.push(`Spread ${spreadPct.toFixed(3)}% — good (+4)`);
    } else if (spreadPct <= 0.15) {
      score += 3;
      detail.push(`Spread ${spreadPct.toFixed(3)}% — acceptable (+3)`);
    } else {
      score += 1;
      detail.push(`Spread ${spreadPct.toFixed(3)}% — wide (+1)`);
    }
  } else {
    detail.push('Spread data unavailable');
  }

  // ---- Price Location vs VWAP (0–6 pts) ----
  if (price != null && vwap != null && vwap > 0) {
    const vwapDist = ((price - vwap) / vwap) * 100; // % above/below VWAP

    // Check for VWAP reclaim (crossed above in last 2 bars)
    const justReclaimed = checkVwapReclaim(closes, vwap);

    if (justReclaimed) {
      score += 6;
      detail.push(`Price just reclaimed VWAP (+6)`);
    } else if (vwapDist >= 0 && vwapDist <= 0.2) {
      score += 5;
      detail.push(`Price ${vwapDist.toFixed(2)}% above VWAP — prime (+5)`);
    } else if (vwapDist > 0.2 && vwapDist <= 0.5) {
      score += 3;
      detail.push(`Price ${vwapDist.toFixed(2)}% above VWAP (+3)`);
    } else if (vwapDist > 0.5) {
      score += 1;
      detail.push(`Price ${vwapDist.toFixed(2)}% above VWAP — chasing (+1)`);
    } else {
      detail.push(`Price below VWAP by ${Math.abs(vwapDist).toFixed(2)}% (+0)`);
    }
  } else {
    detail.push('VWAP data unavailable');
  }

  return { score: Math.min(20, score), detail, spreadBlocked };
}

/**
 * Sum quantity of top N levels in an order book side.
 */
function sumTopLevels(levels, n) {
  if (!levels || !levels.length) return 0;
  let sum = 0;
  for (let i = 0; i < Math.min(n, levels.length); i++) {
    sum += parseFloat(levels[i][1]) || 0;
  }
  return sum;
}

/**
 * Check if price just reclaimed VWAP from below in the last 2 bars.
 */
function checkVwapReclaim(closes, vwap) {
  if (!closes || closes.length < 3 || vwap == null) return false;
  const len = closes.length;
  const prev2 = closes[len - 3];
  const prev1 = closes[len - 2];
  const current = closes[len - 1];

  // Was below VWAP 2 bars ago, now above
  return prev2 != null && prev1 != null && current != null &&
    prev2 < vwap && current > vwap;
}
