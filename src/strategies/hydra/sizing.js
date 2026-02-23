/* ============================================================
   HYDRA — ATR-Based Position Sizing
   ============================================================
   Calculates position size based on ATR volatility, not fixed %.
   Score-based multiplier for higher conviction = larger size.
   ============================================================ */

// Default settings
const DEFAULTS = {
  riskPerTrade: 0.01,       // 1% of portfolio at base
  maxPositionPct: 0.08,     // 8% hard cap
  stopATRMultiple: 1.5,     // Stop = 1.5 × ATR below entry
  tp1ATRMultiple: 1.2,      // TP1 = 1.2 × ATR above entry
  tp2ATRMultiple: 2.5,      // TP2 = 2.5 × ATR above entry
  trailATRMultiple: 0.8,    // Trail by 0.8 × ATR after TP1
  tp1ClosePct: 0.40,        // Close 40% at TP1
  tp2ClosePct: 0.40,        // Close 40% at TP2
};

/**
 * Get score-based size multiplier.
 * Higher conviction scores = larger position sizes.
 */
function getScoreMultiplier(totalScore) {
  if (totalScore >= 95) return 1.5;
  if (totalScore >= 90) return 1.25;
  if (totalScore >= 85) return 1.0;
  return 0.75; // 80-84
}

/**
 * Calculate ATR-based position size.
 *
 * @param {Object} params
 * @param {number} params.portfolioValue - total portfolio value in USD
 * @param {number} params.entryPrice - expected entry price
 * @param {number} params.atr14 - current ATR(14) value
 * @param {number} params.totalScore - HYDRA total score (80-100)
 * @param {Object} params.settings - override default sizing params
 *
 * @returns {Object} Sizing result with size, stops, and targets
 */
export function calculateHydraSize({
  portfolioValue,
  entryPrice,
  atr14,
  totalScore,
  settings = {},
}) {
  const cfg = { ...DEFAULTS, ...settings };

  if (!portfolioValue || !entryPrice || !atr14 || atr14 <= 0) {
    return {
      positionUSD: 0,
      baseSize: 0,
      blocked: true,
      reason: 'Missing portfolio value, price, or ATR data',
    };
  }

  // Risk per trade in USD
  const baseRisk = portfolioValue * cfg.riskPerTrade;

  // Stop distance: 1.5 × ATR(14)
  const stopDistance = atr14 * cfg.stopATRMultiple;

  // Position size in USD: risk / (stopDistance / entryPrice)
  const rawPositionUSD = baseRisk / (stopDistance / entryPrice);

  // Score-based multiplier
  const multiplier = getScoreMultiplier(totalScore);
  const positionUSD = rawPositionUSD * multiplier;

  // Hard cap
  const maxPosition = portfolioValue * cfg.maxPositionPct;
  const finalUSD = Math.min(positionUSD, maxPosition);
  const baseSize = finalUSD / entryPrice;

  // Dynamic targets based on ATR
  const stopLoss = entryPrice - stopDistance;
  const tp1 = entryPrice + (atr14 * cfg.tp1ATRMultiple);
  const tp2 = entryPrice + (atr14 * cfg.tp2ATRMultiple);
  const trailDistance = atr14 * cfg.trailATRMultiple;

  return {
    positionUSD: finalUSD,
    baseSize,
    multiplier,
    stopLoss,
    stopDistance,
    tp1,
    tp2,
    trailDistance,
    tp1ClosePct: cfg.tp1ClosePct,
    tp2ClosePct: cfg.tp2ClosePct,
    blocked: false,
    detail: `Size: $${finalUSD.toFixed(2)} (${multiplier}x multiplier), Stop: $${stopLoss.toFixed(2)}, TP1: $${tp1.toFixed(2)}, TP2: $${tp2.toFixed(2)}`,
  };
}

export { DEFAULTS as SIZING_DEFAULTS };
