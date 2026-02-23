/* ============================================================
   VIPER — COIL Mode (Range Exploitation)
   ============================================================
   Coiled and waiting: detects trading ranges, buys near support,
   sells at midpoint and 85% of range. Range must be valid
   (0.8-4.0 ATR, 2+ touches each side, no clean breakout).

   Position size 3.5%, max 2 concurrent COIL positions.
   ============================================================ */

import { getTuning } from '../tickerTuning.js';

/**
 * Detect if a valid trading range exists in recent 5m candles.
 *
 * @param {Object[]} candles5m
 * @param {Object} indicators5m - must include atr
 * @returns {{ support: number, resistance: number, midpoint: number, valid: boolean, width: number, atrRatio: number }}
 */
export function detectRange(candles5m, indicators5m) {
  const result = { support: 0, resistance: 0, midpoint: 0, valid: false, width: 0, atrRatio: 0 };

  if (!candles5m || candles5m.length < 20) return result;

  // Use last 40 candles (or available) for range detection
  const lookback = Math.min(40, candles5m.length);
  const recent = candles5m.slice(-lookback);

  const highs = recent.map(c => c.high);
  const lows = recent.map(c => c.low);
  const resistance = Math.max(...highs);
  const support = Math.min(...lows);
  const width = resistance - support;
  const midpoint = (resistance + support) / 2;

  // Get ATR
  const lastIdx = candles5m.length - 1;
  const atr = getLastValid(indicators5m?.atr, lastIdx);
  if (!atr || atr <= 0) return result;

  const atrRatio = width / atr;
  result.support = support;
  result.resistance = resistance;
  result.midpoint = midpoint;
  result.width = width;
  result.atrRatio = atrRatio;

  // Width must be 0.8-4.0 ATR
  if (atrRatio < 0.8 || atrRatio > 4.0) return result;

  // Count touches near support and resistance
  const touchThreshold = width * 0.08; // Within 8% of range edges
  let supportTouches = 0;
  let resistanceTouches = 0;

  for (const c of recent) {
    if (c.low <= support + touchThreshold) supportTouches++;
    if (c.high >= resistance - touchThreshold) resistanceTouches++;
  }

  // Need 2+ touches on each side
  if (supportTouches < 2 || resistanceTouches < 2) return result;

  // No clean breakout: last 5 candles should be within range
  const recentFive = candles5m.slice(-5);
  const breakout = recentFive.some(c => c.close > resistance + touchThreshold || c.close < support - touchThreshold);
  if (breakout) return result;

  result.valid = true;
  return result;
}

/**
 * Check for COIL entry conditions.
 *
 * @param {Object[]} candles5m
 * @param {Object} indicators5m
 * @param {Object[]} candles15m - for higher timeframe confirmation
 * @param {Object} orderBook
 * @param {Object} context - { pair, viperState, allocatedCapital }
 * @returns {Object|null} entry signal or null
 */
export function checkCoilEntry(candles5m, indicators5m, candles15m, orderBook, context) {
  if (!candles5m || candles5m.length < 25 || !indicators5m) return null;

  const { pair, viperState = {}, allocatedCapital = 0 } = context;
  const tuning = getTuning(pair);
  const lastIdx = candles5m.length - 1;
  const price = candles5m[lastIdx].close;

  // ---- Max 2 concurrent COIL positions ----
  if ((viperState.openCoilPositions || 0) >= 2) return null;

  // ---- Detect valid range ----
  const range = detectRange(candles5m, indicators5m);
  if (!range.valid) return null;

  // ---- Condition 1: Price within 1.5% of support ----
  const distToSupport = (price - range.support) / range.support;
  if (distToSupport > 0.015 || distToSupport < -0.003) return null;

  // ---- Condition 2: RSI < 55 and rising (building from dip) ----
  const rsi = getLastValid(indicators5m.rsi, lastIdx);
  const rsiPrev = indicators5m.rsi ? indicators5m.rsi[lastIdx - 1] : null;
  if (rsi == null || rsi >= 55) return null;
  if (rsiPrev != null && rsi <= rsiPrev) return null; // Must be rising

  // ---- Condition 3: Bullish candle pattern ----
  const lastCandle = candles5m[lastIdx];
  const isBullish = lastCandle.close > lastCandle.open;
  if (!isBullish) return null;

  // ---- Condition 4: Volume > 1.3x average ----
  const volumeSMA = getLastValid(indicators5m.volumeSMA20, lastIdx);
  if (volumeSMA != null && volumeSMA > 0) {
    if (lastCandle.volume < volumeSMA * 1.3) return null;
  }

  // ---- Condition 5: ADX < 25 (confirms range-bound) ----
  const adx = getLastValid(indicators5m.adx, lastIdx);
  if (adx != null && adx >= 25) return null;

  // ---- All conditions met — build entry signal ----
  const atr = getLastValid(indicators5m.atr, lastIdx) || (range.width * 0.3);
  const tp1 = range.midpoint;                              // 40% at midpoint
  const tp2 = range.support + range.width * 0.85;          // 60% at 85% of range
  const stop = range.support - atr * 0.6;                  // 0.6 ATR below support
  const positionSize = allocatedCapital * 0.035 * tuning.coilPositionMult; // 3.5% * pair multiplier

  return {
    entry: true,
    strategy: 'viper',
    mode: 'COIL',
    pair,
    direction: 'long',
    entryPrice: price,
    tp1,
    tp2,
    tp1ClosePct: 0.4,
    tp2ClosePct: 0.6,
    stopLoss: stop,
    rangeSupport: range.support,
    rangeResistance: range.resistance,
    positionSizeUSD: positionSize,
    baseSize: positionSize / price,
    confidence: Math.round(70 + (range.atrRatio < 2 ? 15 : 5) + (rsi < 35 ? 10 : 0)),
    reason: `COIL: Near support ($${range.support.toFixed(2)}), RSI=${rsi.toFixed(0)} rising, range ${range.atrRatio.toFixed(1)}x ATR`,
    signalTimestamp: Date.now(),
  };
}

/**
 * Check for COIL exit conditions.
 *
 * @param {Object} position
 * @param {Object[]} candles5m
 * @param {Object} indicators5m
 * @param {number} currentPrice
 * @returns {Object|null} exit signal or null
 */
export function checkCoilExit(position, candles5m, indicators5m, currentPrice) {
  if (!position || !currentPrice) return null;

  const entryPrice = position.entryPrice;
  const pnlPct = ((currentPrice - entryPrice) / entryPrice) * 100;

  // ---- TP1: midpoint (partial close 40%) ----
  if (position.tp1 && currentPrice >= position.tp1 && !position.tp1Hit) {
    return {
      exit: true,
      exitType: 'tp1',
      closePct: 0.4,
      reason: `COIL TP1 hit at midpoint ($${position.tp1.toFixed(2)}), closing 40%`,
      pnlPct,
    };
  }

  // ---- TP2: 85% of range (close remaining) ----
  if (position.tp2 && currentPrice >= position.tp2) {
    return {
      exit: true,
      exitType: 'tp2',
      closePct: 1.0,
      reason: `COIL TP2 hit at 85% range ($${position.tp2.toFixed(2)}), closing remaining`,
      pnlPct,
    };
  }

  // ---- Stop loss: 0.6 ATR below support ----
  if (position.stopLoss && currentPrice <= position.stopLoss) {
    return {
      exit: true,
      exitType: 'stop',
      closePct: 1.0,
      reason: `COIL stop hit: $${currentPrice.toFixed(2)} below $${position.stopLoss.toFixed(2)}`,
      pnlPct,
    };
  }

  // ---- Range break invalidation ----
  if (position.rangeResistance && candles5m && candles5m.length > 0) {
    const lastCandle = candles5m[candles5m.length - 1];
    const breakThreshold = position.rangeResistance + (position.rangeResistance - position.rangeSupport) * 0.05;

    // Break below support (not just stop loss, but range invalidation)
    if (lastCandle.close < position.rangeSupport && pnlPct < -0.1) {
      return {
        exit: true,
        exitType: 'invalidation',
        closePct: 1.0,
        reason: `COIL range break: close below support $${position.rangeSupport.toFixed(2)}`,
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
