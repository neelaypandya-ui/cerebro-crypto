/* ============================================================
   VIPER — STRIKE Mode (Micro Scalps)
   ============================================================
   Fast precision strikes: tight entries near VWAP, quick exits.
   Targets 0.12-0.22% (per-pair tuned), stops 0.08-0.14%.
   Max hold 4 minutes. Position size 2.5% of allocated capital.

   Cadence: 90s cooldown, 3min after 3 consecutive wins,
   skip next signal after a loss.
   ============================================================ */

import { getTuning } from '../tickerTuning.js';

/**
 * Check for STRIKE entry conditions on 1m candles.
 *
 * @param {Object[]} candles1m - 1-minute candle data
 * @param {Object} indicators1m - indicators computed on 1m data
 * @param {Object} orderBook - { bids, asks, spread }
 * @param {{ buyVolume: number, sellVolume: number, ratio: number }} tradeFlow
 * @param {Object} context - { pair, viperState, allocatedCapital, ... }
 * @returns {Object|null} entry signal or null
 */
export function checkStrikeEntry(candles1m, indicators1m, orderBook, tradeFlow, context) {
  if (!candles1m || candles1m.length < 25 || !indicators1m) return null;

  const { pair, viperState = {}, allocatedCapital = 0 } = context;
  const tuning = getTuning(pair);
  const lastIdx = candles1m.length - 1;
  const price = candles1m[lastIdx].close;

  // ---- Cooldown checks ----
  const now = Date.now();
  if (viperState.strikeLastTradeTs && now - viperState.strikeLastTradeTs < 90000) {
    return null; // 90s cooldown
  }
  if (viperState.strikeConsecutiveWins >= 3 &&
      viperState.strikeLastTradeTs && now - viperState.strikeLastTradeTs < 180000) {
    return null; // 3min cooldown after 3 wins
  }
  if (viperState.strikeSkipNext) {
    return null; // Skip after loss
  }

  // ---- No stacking: only 1 STRIKE position at a time ----
  if (viperState.openStrikePositions >= 1) return null;

  // ---- Condition 1: Price within 0.75% of 1m VWAP ----
  const vwap = getLastValid(indicators1m.vwap, lastIdx);
  if (vwap == null) return null;
  const vwapDist = Math.abs(price - vwap) / vwap;
  if (vwapDist > 0.0075) return null;

  // ---- Condition 2: StochRSI K > D and K < 75 ----
  const stochRsi = indicators1m.stochRsi;
  if (!stochRsi) return null;
  const k = getLastValid(stochRsi.k, lastIdx);
  const d = getLastValid(stochRsi.d, lastIdx);
  if (k == null || d == null) return null;
  if (k >= 75 || k <= d) return null;

  // ---- Condition 3: HMA20 rising ----
  const hma = indicators1m.hma;
  if (hma) {
    const hmaVal = getLastValid(hma, lastIdx);
    const hmaPrev = lastIdx >= 1 ? hma[lastIdx - 1] : null;
    if (hmaVal == null || hmaPrev == null || hmaVal <= hmaPrev) return null;
  }

  // ---- Condition 4: Buy flow > 55% ----
  if (tradeFlow) {
    const totalFlow = tradeFlow.buyVolume + tradeFlow.sellVolume;
    if (totalFlow > 0) {
      const buyPct = tradeFlow.buyVolume / totalFlow;
      if (buyPct <= 0.55) return null;
    }
  }

  // ---- Condition 5: Spread ≤ 0.15% ----
  const bestBid = orderBook?.bids?.[0]?.[0];
  const bestAsk = orderBook?.asks?.[0]?.[0];
  if (bestBid && bestAsk) {
    const spreadPct = (parseFloat(bestAsk) - parseFloat(bestBid)) / parseFloat(bestAsk);
    if (spreadPct > 0.0015) return null;
  }

  // ---- All conditions met — build entry signal ----
  const tp = price * (1 + tuning.strikeTP / 100);
  const stop = price * (1 - tuning.strikeStop / 100);
  const positionSize = allocatedCapital * 0.025; // 2.5%

  return {
    entry: true,
    strategy: 'viper',
    mode: 'STRIKE',
    pair,
    direction: 'long',
    entryPrice: price,
    tp1: tp,
    stopLoss: stop,
    maxHoldMs: tuning.strikeMaxDuration * 1000,
    positionSizeUSD: positionSize,
    baseSize: positionSize / price,
    confidence: Math.round((k < 40 ? 85 : 75) + (vwapDist < 0.0005 ? 10 : 0)),
    reason: `STRIKE: VWAP proximity ${(vwapDist * 100).toFixed(3)}%, StochRSI K=${k.toFixed(0)}>D=${d.toFixed(0)}, HMA rising`,
    signalTimestamp: now,
  };
}

/**
 * Check for STRIKE exit conditions.
 *
 * @param {Object} position - open position
 * @param {Object[]} candles1m
 * @param {Object} indicators1m
 * @param {number} currentPrice
 * @returns {Object|null} exit signal or null
 */
export function checkStrikeExit(position, candles1m, indicators1m, currentPrice) {
  if (!position || !currentPrice) return null;

  const entryPrice = position.entryPrice;
  const pnlPct = ((currentPrice - entryPrice) / entryPrice) * 100;
  const holdTimeMs = Date.now() - (position.entryTimestamp || position.openedAt || Date.now());
  const tuning = getTuning(position.pair);

  // ---- TP hit ----
  if (pnlPct >= tuning.strikeTP) {
    return {
      exit: true,
      exitType: 'tp',
      reason: `STRIKE TP hit: +${pnlPct.toFixed(3)}% (target: ${tuning.strikeTP}%)`,
      pnlPct,
    };
  }

  // ---- Stop hit ----
  if (pnlPct <= -tuning.strikeStop) {
    return {
      exit: true,
      exitType: 'stop',
      reason: `STRIKE stop hit: ${pnlPct.toFixed(3)}% (limit: -${tuning.strikeStop}%)`,
      pnlPct,
    };
  }

  // ---- Max hold time (4 min default) ----
  if (holdTimeMs >= tuning.strikeMaxDuration * 1000) {
    return {
      exit: true,
      exitType: 'timeout',
      reason: `STRIKE max hold ${tuning.strikeMaxDuration}s exceeded (P&L: ${pnlPct.toFixed(3)}%)`,
      pnlPct,
    };
  }

  // ---- StochRSI reversal: K drops below D while overbought ----
  if (indicators1m?.stochRsi && candles1m) {
    const lastIdx = candles1m.length - 1;
    const k = getLastValid(indicators1m.stochRsi.k, lastIdx);
    const d = getLastValid(indicators1m.stochRsi.d, lastIdx);
    if (k != null && d != null && k < d && k > 70 && pnlPct > 0) {
      return {
        exit: true,
        exitType: 'reversal',
        reason: `STRIKE StochRSI reversal: K=${k.toFixed(0)} < D=${d.toFixed(0)}, locking +${pnlPct.toFixed(3)}%`,
        pnlPct,
      };
    }
  }

  return null;
}

// =========================================================================
//  Helpers
// =========================================================================

function getLastValid(arr, idx) {
  if (!arr) return null;
  for (let i = Math.min(idx, arr.length - 1); i >= 0; i--) {
    if (arr[i] != null) return arr[i];
  }
  return null;
}
