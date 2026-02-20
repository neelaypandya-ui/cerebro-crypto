/* ============================================================
   Cerebro Crypto — Market Regime Detection
   ============================================================
   Classifies the current market environment as bullish, bearish,
   or choppy based on a set of technical indicator values.
   ============================================================ */

import { REGIMES } from '../config/constants.js';

/**
 * Detect the current market regime.
 *
 * @param {Object} indicators
 * @param {number} indicators.price       - current price
 * @param {number} indicators.sma200      - 200-period SMA
 * @param {number} indicators.ema9        - 9-period EMA
 * @param {number} indicators.ema21       - 21-period EMA
 * @param {number} indicators.ema50       - 50-period EMA
 * @param {number} indicators.adx         - Average Directional Index
 * @param {number} indicators.rsi         - Relative Strength Index
 * @param {number} indicators.bbWidth     - Bollinger Band width (upper - lower)
 * @param {number} indicators.bbWidthAvg  - average BB width over recent period
 *
 * @returns {{ regime: 'bullish'|'choppy'|'bearish', reasons: string[] }}
 */
export function detectRegime(indicators = {}) {
  const {
    price,
    sma200,
    ema9,
    ema21,
    ema50,
    adx,
    rsi,
    bbWidth,
    bbWidthAvg,
  } = indicators;

  const reasons = [];

  // Guard: if critical values are missing, default to choppy
  if (
    price == null ||
    sma200 == null ||
    ema9 == null ||
    ema21 == null ||
    adx == null
  ) {
    return { regime: REGIMES.CHOPPY, reasons: ['Insufficient indicator data for regime detection.'] };
  }

  // ---------------------------------------------------------------------------
  // CHOPPY checks (evaluated first – if market is range-bound, override trend)
  // ---------------------------------------------------------------------------
  const isLowADX = adx < 20;
  const isNearSMA200 =
    sma200 > 0 && Math.abs(price - sma200) / sma200 < 0.015;
  const isNarrowBB =
    bbWidth != null && bbWidthAvg != null && bbWidthAvg > 0 && bbWidth < bbWidthAvg;

  if (isLowADX) {
    reasons.push(`ADX (${adx.toFixed(1)}) below 20 — weak trend.`);
  }
  if (isNearSMA200 && isNarrowBB) {
    reasons.push('Price within 1.5% of SMA200 with narrow Bollinger Bands — consolidating.');
  }

  if (isLowADX || (isNearSMA200 && isNarrowBB)) {
    return { regime: REGIMES.CHOPPY, reasons };
  }

  // ---------------------------------------------------------------------------
  // BULLISH
  // ---------------------------------------------------------------------------
  const aboveSMA200 = price > sma200;
  const emaAlignedBull = ema9 > ema21 && (ema50 == null || ema21 > ema50);
  const adxStrong = adx > 25;
  const rsiHealthy = rsi != null && rsi >= 45 && rsi <= 75;

  if (aboveSMA200 && emaAlignedBull && adxStrong && rsiHealthy) {
    if (aboveSMA200) reasons.push('Price above SMA200.');
    if (emaAlignedBull) reasons.push('EMA alignment bullish (9 > 21 > 50).');
    if (adxStrong) reasons.push(`ADX (${adx.toFixed(1)}) above 25 — strong trend.`);
    if (rsiHealthy) reasons.push(`RSI (${rsi.toFixed(1)}) in healthy range (45-75).`);
    return { regime: REGIMES.BULLISH, reasons };
  }

  // ---------------------------------------------------------------------------
  // BEARISH
  // ---------------------------------------------------------------------------
  const belowSMA200 = price < sma200;
  const emaAlignedBear = ema9 < ema21;

  if (belowSMA200 && emaAlignedBear && adxStrong) {
    reasons.push('Price below SMA200.');
    reasons.push('EMA alignment bearish (9 < 21).');
    reasons.push(`ADX (${adx.toFixed(1)}) above 25 — strong trend.`);
    return { regime: REGIMES.BEARISH, reasons };
  }

  // ---------------------------------------------------------------------------
  // Default — CHOPPY (ambiguous conditions)
  // ---------------------------------------------------------------------------
  reasons.push('Conditions are ambiguous — defaulting to choppy.');
  return { regime: REGIMES.CHOPPY, reasons };
}

export default detectRegime;
