/* ============================================================
   HYDRA Dimension 3 — Volume Conviction Score (0–20 pts)
   ============================================================
   Validates that real capital is participating in the direction
   of the trade. Scores raw volume, OBV trend, and buy/sell flow.
   ============================================================ */

/**
 * Score volume conviction.
 *
 * @param {Object} indicators - computed indicator data
 *   { volume: number[], volumeSMA20: number[], obv: number[], close: number[] }
 * @param {Object} tradeFlow - real-time buy/sell flow from WebSocket
 *   { buyVolume: number, sellVolume: number }
 *
 * @returns {{ score: number, detail: string[] }}
 */
export function scoreVolumeConviction(indicators, tradeFlow) {
  const detail = [];
  let score = 0;

  // ---- Raw Volume vs 20-bar average (0–6 pts) ----
  const volumes = indicators.volume || [];
  const volSMA = indicators.volumeSMA20 || [];
  const currentVol = getLastValid(volumes);
  const avgVol = getLastValid(volSMA);

  if (currentVol != null && avgVol != null && avgVol > 0) {
    const ratio = currentVol / avgVol;
    if (ratio > 2.0) {
      score += 6;
      detail.push(`Volume ${ratio.toFixed(1)}x avg — strong (+6)`);
    } else if (ratio >= 1.5) {
      score += 4;
      detail.push(`Volume ${ratio.toFixed(1)}x avg — solid (+4)`);
    } else if (ratio >= 1.2) {
      score += 2;
      detail.push(`Volume ${ratio.toFixed(1)}x avg — above avg (+2)`);
    } else {
      detail.push(`Volume ${ratio.toFixed(1)}x avg — weak (+0)`);
    }
  } else {
    detail.push('Volume data unavailable');
  }

  // ---- On-Balance Volume Trend (0–7 pts) ----
  // Check if OBV is making higher highs over last 5 bars
  const obv = indicators.obv || [];
  if (obv.length >= 5) {
    const obvTrend = getOBVTrend(obv, 5);
    if (obvTrend === 'rising') {
      score += 7;
      detail.push('OBV making higher highs (+7)');
    } else if (obvTrend === 'flat') {
      score += 3;
      detail.push('OBV flat (+3)');
    } else {
      detail.push('OBV declining (+0)');
    }
  } else {
    detail.push('OBV data insufficient');
  }

  // ---- Buy/Sell Flow Ratio — Real-Time (0–7 pts) ----
  const buyVol = tradeFlow?.buyVolume || 0;
  const sellVol = tradeFlow?.sellVolume || 0;
  const totalFlow = buyVol + sellVol;

  if (totalFlow > 0) {
    const buyPct = (buyVol / totalFlow) * 100;
    if (buyPct > 65) {
      score += 7;
      detail.push(`Buy flow ${buyPct.toFixed(0)}% — dominant (+7)`);
    } else if (buyPct >= 55) {
      score += 5;
      detail.push(`Buy flow ${buyPct.toFixed(0)}% — strong (+5)`);
    } else if (buyPct >= 50) {
      score += 3;
      detail.push(`Buy flow ${buyPct.toFixed(0)}% — neutral (+3)`);
    } else {
      detail.push(`Buy flow ${buyPct.toFixed(0)}% — sellers dominate (+0)`);
    }
  } else {
    // No trade flow data — give moderate credit (not penalized for missing WS data)
    score += 5;
    detail.push('Trade flow unavailable, moderate credit (+5)');
  }

  return { score: Math.min(20, score), detail };
}

/**
 * Determine OBV trend over last N bars.
 * @returns {'rising' | 'flat' | 'declining'}
 */
function getOBVTrend(obv, lookback) {
  const len = obv.length;
  const start = len - lookback;
  const values = [];

  for (let i = start; i < len; i++) {
    if (obv[i] != null) values.push(obv[i]);
  }

  if (values.length < 3) return 'flat';

  // Count higher-highs: each value > previous
  let rises = 0;
  let falls = 0;
  for (let i = 1; i < values.length; i++) {
    if (values[i] > values[i - 1]) rises++;
    else if (values[i] < values[i - 1]) falls++;
  }

  if (rises >= 3) return 'rising';
  if (falls >= 3) return 'declining';
  return 'flat';
}

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
