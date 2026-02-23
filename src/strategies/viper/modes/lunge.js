/* ============================================================
   VIPER — LUNGE Mode (Momentum Riding)
   ============================================================
   Explosive momentum entries: EMA alignment on 15m, volume
   confirmation, MACD histogram rising, RSI in 52-72 zone.

   Exits: TP1 2.0×ATR (35%), TP2 3.5×ATR (35%), trail 1.2×ATR
   after TP1, stop 1.8×ATR. Emergency exit if EMA9 < EMA21.

   Position size: risk 1.5%, cap 10%. Max 1 concurrent LUNGE.
   ============================================================ */

import { getTuning } from '../tickerTuning.js';

/**
 * Check for LUNGE entry conditions on 15m candles.
 *
 * @param {Object[]} candles15m
 * @param {Object} indicators15m
 * @param {Object} orderBook
 * @param {Object} context - { pair, viperState, allocatedCapital }
 * @returns {Object|null} entry signal or null
 */
export function checkLungeEntry(candles15m, indicators15m, orderBook, context) {
  if (!candles15m || candles15m.length < 55 || !indicators15m) return null;

  const { pair, viperState = {}, allocatedCapital = 0 } = context;
  const tuning = getTuning(pair);

  // ---- Must be eligible for this pair ----
  if (!tuning.lungeEligible) return null;

  // ---- Max 1 concurrent LUNGE ----
  if ((viperState.openLungePositions || 0) >= 1) return null;

  const lastIdx = candles15m.length - 1;
  const price = candles15m[lastIdx].close;

  // ---- Condition 1: EMA 9 > 21 > 50 on 15m ----
  const ema9 = getLastValid(indicators15m.ema9, lastIdx);
  const ema21 = getLastValid(indicators15m.ema21, lastIdx);
  const ema50 = getLastValid(indicators15m.ema50, lastIdx);
  if (ema9 == null || ema21 == null || ema50 == null) return null;
  if (!(ema9 > ema21 && ema21 > ema50)) return null;

  // ---- Condition 2: Close above previous candle's high ----
  if (lastIdx < 1) return null;
  const prevHigh = candles15m[lastIdx - 1].high;
  if (price <= prevHigh) return null;

  // ---- Condition 3: Volume > 2x average ----
  const volumeSMA = getLastValid(indicators15m.volumeSMA20, lastIdx);
  if (volumeSMA == null || volumeSMA <= 0) return null;
  if (candles15m[lastIdx].volume < volumeSMA * 2) return null;

  // ---- Condition 4: MACD histogram positive and increasing ----
  const macd = indicators15m.macd;
  if (!macd || !macd.histogram) return null;
  const hist = getLastValid(macd.histogram, lastIdx);
  const histPrev = lastIdx >= 1 ? macd.histogram[lastIdx - 1] : null;
  if (hist == null || hist <= 0) return null;
  if (histPrev != null && hist <= histPrev) return null;

  // ---- Condition 5: RSI 52-72 ----
  const rsi = getLastValid(indicators15m.rsi, lastIdx);
  if (rsi == null || rsi < 52 || rsi > 72) return null;

  // ---- Condition 6: Price > VWAP ----
  const vwap = getLastValid(indicators15m.vwap, lastIdx);
  if (vwap != null && price <= vwap) return null;

  // ---- Condition 7: ADX > 28 and rising ----
  const adx = getLastValid(indicators15m.adx, lastIdx);
  const adxPrev = indicators15m.adx ? indicators15m.adx[lastIdx - 1] : null;
  if (adx == null || adx < 28) return null;
  if (adxPrev != null && adx <= adxPrev) return null;

  // ---- All conditions met — build entry signal ----
  const atr = getLastValid(indicators15m.atr, lastIdx);
  if (!atr || atr <= 0) return null;

  const tp1 = price + atr * 2.0;       // TP1: 2.0x ATR
  const tp2 = price + atr * 3.5;       // TP2: 3.5x ATR
  const stop = price - atr * 1.8;      // Stop: 1.8x ATR
  const trailDistance = atr * 1.2;      // Trail: 1.2x ATR after TP1

  // Position sizing: risk 1.5% of allocated capital, cap at 10%
  const riskPerShare = price - stop;
  const riskAmount = allocatedCapital * 0.015;
  let positionSize = (riskAmount / riskPerShare) * price;
  positionSize = Math.min(positionSize, allocatedCapital * 0.10); // Cap at 10%

  return {
    entry: true,
    strategy: 'viper',
    mode: 'LUNGE',
    pair,
    direction: 'long',
    entryPrice: price,
    tp1,
    tp2,
    tp1ClosePct: 0.35,
    tp2ClosePct: 0.35,
    trailClosePct: 0.30,
    stopLoss: stop,
    trailDistance,
    positionSizeUSD: positionSize,
    baseSize: positionSize / price,
    confidence: Math.round(75 + (adx > 35 ? 10 : 0) + (rsi >= 55 && rsi <= 65 ? 10 : 0)),
    reason: `LUNGE: EMA aligned, volume ${(candles15m[lastIdx].volume / volumeSMA).toFixed(1)}x, MACD rising, ADX=${adx.toFixed(0)}, RSI=${rsi.toFixed(0)}`,
    signalTimestamp: Date.now(),
  };
}

/**
 * Check for LUNGE exit conditions.
 *
 * @param {Object} position
 * @param {Object[]} candles15m
 * @param {Object} indicators15m
 * @param {number} currentPrice
 * @returns {Object|null} exit signal or null
 */
export function checkLungeExit(position, candles15m, indicators15m, currentPrice) {
  if (!position || !currentPrice) return null;

  const entryPrice = position.entryPrice;
  const pnlPct = ((currentPrice - entryPrice) / entryPrice) * 100;

  // ---- Emergency exit: EMA9 < EMA21 ----
  if (indicators15m && candles15m && candles15m.length > 0) {
    const lastIdx = candles15m.length - 1;
    const ema9 = getLastValid(indicators15m.ema9, lastIdx);
    const ema21 = getLastValid(indicators15m.ema21, lastIdx);
    if (ema9 != null && ema21 != null && ema9 < ema21) {
      return {
        exit: true,
        exitType: 'emergency',
        closePct: 1.0,
        reason: `LUNGE emergency: EMA9 (${ema9.toFixed(2)}) < EMA21 (${ema21.toFixed(2)})`,
        pnlPct,
      };
    }
  }

  // ---- Stop loss: 1.8x ATR ----
  if (position.stopLoss && currentPrice <= position.stopLoss) {
    return {
      exit: true,
      exitType: 'stop',
      closePct: 1.0,
      reason: `LUNGE stop hit: $${currentPrice.toFixed(2)} below $${position.stopLoss.toFixed(2)}`,
      pnlPct,
    };
  }

  // ---- TP1: 2.0x ATR (close 35%) ----
  if (position.tp1 && currentPrice >= position.tp1 && !position.tp1Hit) {
    return {
      exit: true,
      exitType: 'tp1',
      closePct: 0.35,
      reason: `LUNGE TP1 hit: $${currentPrice.toFixed(2)} (2.0x ATR), closing 35%`,
      pnlPct,
      activateTrail: true,
    };
  }

  // ---- TP2: 3.5x ATR (close 35%) ----
  if (position.tp2 && currentPrice >= position.tp2 && !position.tp2Hit) {
    return {
      exit: true,
      exitType: 'tp2',
      closePct: 0.35,
      reason: `LUNGE TP2 hit: $${currentPrice.toFixed(2)} (3.5x ATR), closing 35%`,
      pnlPct,
    };
  }

  // ---- Trailing stop after TP1 ----
  if (position.tp1Hit && position.trailDistance) {
    const trailHigh = position.trailHigh || position.tp1;
    const trailStop = trailHigh - position.trailDistance;
    if (currentPrice <= trailStop) {
      return {
        exit: true,
        exitType: 'trail',
        closePct: 1.0,
        reason: `LUNGE trail stop: $${currentPrice.toFixed(2)} (trail from $${trailHigh.toFixed(2)} - $${position.trailDistance.toFixed(2)})`,
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
