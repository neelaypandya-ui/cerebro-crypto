/* ============================================================
   HYDRA — Exit Score Monitor
   ============================================================
   After entry, recalculates D1 + D2 + D3 every bar.
   If the exit score drops below 40, close immediately.
   Also checks stop loss, TP1, TP2, and trailing stop.
   ============================================================ */

import { calculateExitScore } from './scoring.js';

/**
 * Check if a HYDRA position should exit early based on score degradation.
 *
 * @param {Object} params
 * @param {Object} params.position - open position data
 * @param {Object} params.indicators - current indicator data
 * @param {Object} params.tradeFlow - buy/sell flow
 * @param {Object} params.candles - current candle array
 * @param {number} params.currentPrice - current market price
 * @param {number} params.exitThreshold - score threshold for early exit (default 40)
 *
 * @returns {{ shouldExit: boolean, reason: string, exitType: string, partialClose: number|null }}
 */
export function checkHydraExit({
  position,
  indicators,
  tradeFlow,
  candles,
  currentPrice,
  exitThreshold = 40,
}) {
  if (!position || !currentPrice) {
    return { shouldExit: false, reason: '', exitType: '', partialClose: null };
  }

  const entryPrice = position.entryPrice;
  const stopLoss = position.stopLoss;
  const tp1 = position.tp1;
  const tp2 = position.tp2;
  const trailDistance = position.trailDistance;
  const tp1Hit = position.tp1Hit || false;

  // ---- 1. Stop Loss ----
  if (stopLoss && currentPrice <= stopLoss) {
    return {
      shouldExit: true,
      reason: `Stop loss hit at $${stopLoss.toFixed(2)}`,
      exitType: 'StopLoss',
      partialClose: null, // close full position
    };
  }

  // ---- 2. TP1 (partial close 40%) ----
  if (!tp1Hit && tp1 && currentPrice >= tp1) {
    return {
      shouldExit: true,
      reason: `TP1 reached at $${tp1.toFixed(2)}`,
      exitType: 'TP1',
      partialClose: position.tp1ClosePct || 0.4,
    };
  }

  // ---- 3. TP2 (partial close 40%) ----
  if (tp1Hit && !position.tp2Hit && tp2 && currentPrice >= tp2) {
    return {
      shouldExit: true,
      reason: `TP2 reached at $${tp2.toFixed(2)}`,
      exitType: 'TP2',
      partialClose: position.tp2ClosePct || 0.4,
    };
  }

  // ---- 4. Trailing Stop (after TP1) ----
  if (tp1Hit && trailDistance) {
    const highSinceTP1 = position.highSinceTP1 || currentPrice;
    const trailStop = highSinceTP1 - trailDistance;

    if (currentPrice <= trailStop) {
      return {
        shouldExit: true,
        reason: `Trailing stop hit at $${trailStop.toFixed(2)} (high: $${highSinceTP1.toFixed(2)})`,
        exitType: 'TrailingStop',
        partialClose: null,
      };
    }
  }

  // ---- 5. Exit Score Monitor (D1 + D2 + D3 < exitThreshold) ----
  if (indicators && candles) {
    const { exitScore } = calculateExitScore({ indicators, tradeFlow, candles });

    if (exitScore < exitThreshold) {
      return {
        shouldExit: true,
        reason: `Exit score ${exitScore}/60 dropped below ${exitThreshold} — conviction lost`,
        exitType: 'EarlyExit',
        partialClose: null,
        exitScore,
      };
    }
  }

  return { shouldExit: false, reason: '', exitType: '', partialClose: null };
}

/**
 * Update position tracking after TP1 hit (for trailing stop).
 */
export function updatePositionAfterTP1(position, currentPrice) {
  return {
    ...position,
    tp1Hit: true,
    highSinceTP1: Math.max(currentPrice, position.highSinceTP1 || currentPrice),
    qty: position.qty * (1 - (position.tp1ClosePct || 0.4)),
  };
}

/**
 * Update position tracking after TP2 hit.
 */
export function updatePositionAfterTP2(position) {
  return {
    ...position,
    tp2Hit: true,
    qty: position.qty * (1 - (position.tp2ClosePct || 0.4) / (1 - (position.tp1ClosePct || 0.4))),
  };
}

/**
 * Update the high-water mark for trailing stop.
 */
export function updateHighWaterMark(position, currentPrice) {
  if (!position.tp1Hit) return position;
  return {
    ...position,
    highSinceTP1: Math.max(currentPrice, position.highSinceTP1 || currentPrice),
  };
}
