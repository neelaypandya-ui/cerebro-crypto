/* ============================================================
   HYDRA Dimension 1 — Multi-Timeframe Trend Alignment (0–20 pts)
   ============================================================
   Scores trend alignment across 1m, 5m, 15m timeframes.
   Higher timeframes carry more weight.
   ============================================================ */

/**
 * Determine if a single timeframe is bullish, bearish, or neutral.
 * Bullish = EMA9 > EMA21 > EMA50 AND price > SMA200
 * Bearish = EMA9 < EMA21
 * Neutral = everything else
 */
function getTrendState(tf) {
  const { ema9, ema21, ema50, sma200, price } = tf;
  if (ema9 == null || ema21 == null) return 'neutral';

  if (ema9 < ema21) return 'bearish';

  const emaAligned = ema9 > ema21 && (ema50 == null || ema21 > ema50);
  const aboveSma200 = sma200 == null || price > sma200;

  if (emaAligned && aboveSma200) return 'bullish';
  return 'neutral';
}

/**
 * Score multi-timeframe trend alignment.
 *
 * @param {Object} indicators
 *   indicators.m1  = { ema9, ema21, ema50, sma200, price }
 *   indicators.m5  = { ema9, ema21, ema50, sma200, price }
 *   indicators.m15 = { ema9, ema21, ema50, sma200, price }
 *
 * If multi-timeframe data is unavailable, falls back to single-timeframe
 * scoring using the primary indicators object.
 *
 * @returns {{ score: number, detail: string[] }}
 */
export function scoreTrendAlignment(indicators) {
  const detail = [];

  // Build timeframe data — support both multi-TF and single-TF modes
  const m1  = indicators.m1  || null;
  const m5  = indicators.m5  || buildTFFromPrimary(indicators);
  const m15 = indicators.m15 || null;

  const state1m  = m1  ? getTrendState(m1)  : 'neutral';
  const state5m  = m5  ? getTrendState(m5)  : 'neutral';
  const state15m = m15 ? getTrendState(m15) : 'neutral';

  detail.push(`1m: ${state1m}, 5m: ${state5m}, 15m: ${state15m}`);

  // Check if any timeframe is bearish — cap at 5
  const anyBearish = [state1m, state5m, state15m].includes('bearish');
  if (anyBearish) {
    detail.push('Bearish TF detected — capped at 5');
    return { score: 5, detail };
  }

  // Weight: 1m=4, 5m=7, 15m=9
  let score = 0;
  if (state1m  === 'bullish') score += 4;
  if (state5m  === 'bullish') score += 7;
  if (state15m === 'bullish') score += 9;

  // Add partial credit for neutral (not penalized, just not rewarded)
  if (score === 0) {
    // All neutral — give a base score
    score = 3;
    detail.push('All timeframes neutral');
  } else {
    detail.push(`Trend score: ${score}/20`);
  }

  return { score: Math.min(20, score), detail };
}

/**
 * Build a timeframe object from primary (single-timeframe) indicators.
 * Used when we only have one timeframe of data.
 */
function buildTFFromPrimary(ind) {
  const lastIdx = (ind.ema9 || []).length - 1;
  if (lastIdx < 0) return null;

  const getVal = (arr) => {
    if (!arr || !arr.length) return null;
    // Walk backwards to find last non-null value
    for (let i = arr.length - 1; i >= 0; i--) {
      if (arr[i] != null) return arr[i];
    }
    return null;
  };

  return {
    ema9:   getVal(ind.ema9),
    ema21:  getVal(ind.ema21),
    ema50:  getVal(ind.ema50),
    sma200: getVal(ind.sma200),
    price:  ind.price || getVal(ind.ema9), // fallback
  };
}
