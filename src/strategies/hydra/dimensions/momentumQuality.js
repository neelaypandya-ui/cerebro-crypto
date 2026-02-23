/* ============================================================
   HYDRA Dimension 2 — Momentum Quality Score (0–20 pts)
   ============================================================
   Measures whether momentum is genuine and sustainable vs.
   exhausted or divergent. Checks RSI shape, MACD structure,
   Stochastic RSI confirmation, and hidden bullish divergence.
   ============================================================ */

/**
 * Score momentum quality.
 *
 * @param {Object} indicators - computed indicator data
 *   { rsi: number[], macd: { line[], signal[], histogram[] },
 *     stochRSI: { k[], d[] }, close: number[] }
 *
 * @returns {{ score: number, detail: string[], divergence: boolean }}
 */
export function scoreMomentumQuality(indicators) {
  const detail = [];
  let score = 0;
  let divergence = false;

  // ---- RSI Position (0–6 pts) ----
  const rsiArr = indicators.rsi || [];
  const rsi = getLastValid(rsiArr);
  const prevRsi = getLastValid(rsiArr, 1);

  if (rsi != null) {
    if (rsi >= 50 && rsi <= 65) {
      score += 6;
      detail.push(`RSI ${rsi.toFixed(1)} — healthy uptrend (+6)`);
    } else if (rsi >= 45 && rsi < 50 && prevRsi != null && prevRsi < 40) {
      score += 5;
      detail.push(`RSI ${rsi.toFixed(1)} recovering from <40 (+5)`);
    } else if (rsi > 65 && rsi <= 72) {
      score += 3;
      detail.push(`RSI ${rsi.toFixed(1)} — elevated, caution (+3)`);
    } else if (rsi >= 45 && rsi < 50) {
      score += 3;
      detail.push(`RSI ${rsi.toFixed(1)} — neutral (+3)`);
    } else {
      detail.push(`RSI ${rsi.toFixed(1)} — out of range (+0)`);
    }
  } else {
    detail.push('RSI unavailable');
  }

  // ---- MACD Structure (0–7 pts) ----
  const macd = indicators.macd || {};
  const hist = macd.histogram || [];
  const histCurrent = getLastValid(hist);
  const histPrev = getLastValid(hist, 1);
  const histPrev2 = getLastValid(hist, 2);

  if (histCurrent != null) {
    if (histCurrent > 0 && histPrev != null && histCurrent > histPrev) {
      score += 7;
      detail.push(`MACD histogram positive & accelerating (+7)`);
    } else if (histCurrent > 0 && histPrev != null && histPrev <= 0) {
      score += 6;
      detail.push(`MACD histogram just crossed above zero (+6)`);
    } else if (histCurrent > 0) {
      score += 3;
      detail.push(`MACD histogram positive but decelerating (+3)`);
    } else {
      detail.push(`MACD histogram negative (+0)`);
    }
  } else {
    detail.push('MACD unavailable');
  }

  // ---- Stochastic RSI Confirmation (0–7 pts) ----
  const stoch = indicators.stochRSI || {};
  const kArr = stoch.k || [];
  const dArr = stoch.d || [];
  const k = getLastValid(kArr);
  const d = getLastValid(dArr);
  const kPrev = getLastValid(kArr, 1);
  const dPrev = getLastValid(dArr, 1);

  if (k != null && d != null) {
    const kCrossedAboveD = kPrev != null && dPrev != null && kPrev <= dPrev && k > d;

    if (kCrossedAboveD && k < 80) {
      score += 7;
      detail.push(`StochRSI K crossed above D, K=${k.toFixed(1)} (+7)`);
    } else if (k > d && k > 50 && d > 50) {
      score += 5;
      detail.push(`StochRSI K>D, both >50 (+5)`);
    } else if (k > d) {
      score += 2;
      detail.push(`StochRSI K>D but weak (+2)`);
    } else {
      detail.push(`StochRSI K<D (+0)`);
    }
  } else {
    detail.push('StochRSI unavailable');
  }

  // ---- Hidden Bullish Divergence Bonus (+3) ----
  // Price makes higher low, RSI makes lower low over last 20 bars
  const closes = indicators.close || [];
  if (closes.length >= 20 && rsiArr.length >= 20) {
    divergence = detectHiddenBullishDivergence(closes, rsiArr, 20);
    if (divergence) {
      score += 3;
      detail.push('Hidden bullish divergence detected (+3 bonus)');
    }
  }

  return { score: Math.min(20, score), detail, divergence };
}

/**
 * Detect hidden bullish divergence:
 * Price makes a higher low while RSI makes a lower low.
 */
function detectHiddenBullishDivergence(closes, rsi, lookback) {
  const len = closes.length;
  if (len < lookback) return false;

  const start = len - lookback;

  // Find local lows in the lookback window (simple: check if lower than neighbors)
  const priceLows = [];
  const rsiLows = [];

  for (let i = start + 1; i < len - 1; i++) {
    if (closes[i] != null && closes[i - 1] != null && closes[i + 1] != null) {
      if (closes[i] < closes[i - 1] && closes[i] < closes[i + 1]) {
        priceLows.push({ idx: i, val: closes[i] });
      }
    }
    if (rsi[i] != null && rsi[i - 1] != null && rsi[i + 1] != null) {
      if (rsi[i] < rsi[i - 1] && rsi[i] < rsi[i + 1]) {
        rsiLows.push({ idx: i, val: rsi[i] });
      }
    }
  }

  if (priceLows.length < 2 || rsiLows.length < 2) return false;

  // Compare the last two lows
  const pL1 = priceLows[priceLows.length - 2];
  const pL2 = priceLows[priceLows.length - 1];
  const rL1 = rsiLows[rsiLows.length - 2];
  const rL2 = rsiLows[rsiLows.length - 1];

  // Price higher low AND RSI lower low = hidden bullish divergence
  return pL2.val > pL1.val && rL2.val < rL1.val;
}

/**
 * Get the last valid (non-null) value from an array.
 * @param {Array} arr
 * @param {number} offset - 0 = last, 1 = second-to-last, etc.
 */
function getLastValid(arr, offset = 0) {
  if (!arr || !arr.length) return null;
  let found = 0;
  for (let i = arr.length - 1; i >= 0; i--) {
    if (arr[i] != null) {
      if (found === offset) return arr[i];
      found++;
    }
  }
  return null;
}
