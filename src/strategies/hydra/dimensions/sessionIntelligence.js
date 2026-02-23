/* ============================================================
   HYDRA Dimension 5 — Session Intelligence Score (0–20 pts)
   ============================================================
   Time-of-day scoring + volatility state adjustment.
   Uses per-pair UTC hour profiles and ATR normalization.
   ============================================================ */

import { getSessionScore } from '../sessionProfiles.js';

/**
 * Score session intelligence.
 *
 * @param {string} pair - e.g. 'BTC-USD'
 * @param {number} utcHour - current UTC hour (0-23)
 * @param {number} atr14 - current ATR(14) value
 * @param {number} atr50Avg - 50-bar average of ATR(14)
 * @param {number} sessionWeight - multiplier from settings (default 1.0)
 *
 * @returns {{ score: number, detail: string[] }}
 */
export function scoreSessionIntelligence(pair, utcHour, atr14, atr50Avg, sessionWeight = 1.0) {
  const detail = [];
  let score = 0;

  // ---- Session Timing (0–12 pts) ----
  const rawSessionScore = getSessionScore(pair, utcHour);
  const sessionScore = Math.min(12, Math.round(rawSessionScore * sessionWeight));
  score += sessionScore;
  detail.push(`Session score for ${pair} @ ${utcHour}:00 UTC = ${sessionScore}/12`);

  // ---- Volatility State Adjustment (0–8 pts) ----
  if (atr14 != null && atr50Avg != null && atr50Avg > 0) {
    const atrRatio = atr14 / atr50Avg;

    if (atrRatio >= 0.8 && atrRatio <= 1.5) {
      score += 8;
      detail.push(`ATR ratio ${atrRatio.toFixed(2)} — healthy volatility (+8)`);
    } else if (atrRatio > 1.5 && atrRatio <= 2.5) {
      score += 5;
      detail.push(`ATR ratio ${atrRatio.toFixed(2)} — elevated volatility (+5)`);
    } else if (atrRatio > 2.5) {
      score += 1;
      detail.push(`ATR ratio ${atrRatio.toFixed(2)} — extreme volatility (+1)`);
    } else {
      // < 0.8
      score += 3;
      detail.push(`ATR ratio ${atrRatio.toFixed(2)} — too quiet (+3)`);
    }
  } else {
    score += 4; // Give moderate default if no ATR data
    detail.push('ATR data unavailable — default +4');
  }

  return { score: Math.min(20, score), detail };
}
