/* ============================================================
   HYDRA — Scoring Aggregator
   ============================================================
   Aggregates all 5 dimension scores into a single total.
   This is the central evaluation function called every bar close.
   ============================================================ */

import { scoreTrendAlignment } from './dimensions/trendAlignment.js';
import { scoreMomentumQuality } from './dimensions/momentumQuality.js';
import { scoreVolumeConviction } from './dimensions/volumeConviction.js';
import { scoreMicrostructure } from './dimensions/microstructure.js';
import { scoreSessionIntelligence } from './dimensions/sessionIntelligence.js';

/**
 * Calculate the full HYDRA score across all 5 dimensions.
 *
 * @param {Object} params
 * @param {Object} params.indicators - computed indicator arrays (ema9, rsi, macd, etc.)
 * @param {Object} params.orderBook - { bids, asks }
 * @param {Object} params.tradeFlow - { buyVolume, sellVolume }
 * @param {string} params.pair - active trading pair
 * @param {number[]} params.candles - candle array (for close prices)
 * @param {Object} params.settings - HYDRA settings (sessionWeight, etc.)
 *
 * @returns {Object} Full scoring result
 */
export function calculateHydraScore({
  indicators,
  orderBook,
  tradeFlow,
  pair,
  candles,
  settings = {},
}) {
  const utcHour = new Date().getUTCHours();
  const closes = candles ? candles.map((c) => c.close) : (indicators.close || []);
  const volumes = candles ? candles.map((c) => c.volume) : (indicators.volume || []);

  // Inject close/volume arrays into indicators for dimension functions
  const enrichedIndicators = {
    ...indicators,
    close: closes,
    volume: volumes,
    price: closes.length > 0 ? closes[closes.length - 1] : null,
  };

  // Get ATR for session intelligence
  const atrArr = indicators.atr || [];
  const atr14 = getLastValid(atrArr);

  // Compute 50-bar ATR average for volatility normalization
  const atr50Avg = computeATRAverage(atrArr, 50);

  // Get VWAP for microstructure
  const vwapArr = indicators.vwap || [];
  const vwap = getLastValid(vwapArr);
  const price = enrichedIndicators.price;

  // Calculate spread from order book
  let spreadPct = null;
  if (orderBook?.bids?.length > 0 && orderBook?.asks?.length > 0) {
    const bestBid = parseFloat(orderBook.bids[0][0]);
    const bestAsk = parseFloat(orderBook.asks[0][0]);
    if (bestBid > 0 && bestAsk > 0) {
      const mid = (bestBid + bestAsk) / 2;
      spreadPct = ((bestAsk - bestBid) / mid) * 100;
    }
  }

  // ---- Dimension Scores ----
  const d1 = scoreTrendAlignment(enrichedIndicators);
  const d2 = scoreMomentumQuality(enrichedIndicators);
  const d3 = scoreVolumeConviction(enrichedIndicators, tradeFlow);
  const d4 = scoreMicrostructure(orderBook, spreadPct, price, vwap, closes);
  const d5 = scoreSessionIntelligence(pair, utcHour, atr14, atr50Avg, settings.sessionWeight);

  const totalScore = d1.score + d2.score + d3.score + d4.score + d5.score;

  return {
    totalScore,
    d1, d2, d3, d4, d5,
    spreadBlocked: d4.spreadBlocked || false,
    timestamp: Date.now(),
    pair,
    utcHour,
    atr14,
    price,
  };
}

/**
 * Calculate exit score (D1 + D2 + D3 only).
 * Used for post-entry monitoring.
 */
export function calculateExitScore({ indicators, tradeFlow, candles }) {
  const closes = candles ? candles.map((c) => c.close) : (indicators.close || []);
  const volumes = candles ? candles.map((c) => c.volume) : (indicators.volume || []);

  const enrichedIndicators = {
    ...indicators,
    close: closes,
    volume: volumes,
    price: closes.length > 0 ? closes[closes.length - 1] : null,
  };

  const d1 = scoreTrendAlignment(enrichedIndicators);
  const d2 = scoreMomentumQuality(enrichedIndicators);
  const d3 = scoreVolumeConviction(enrichedIndicators, tradeFlow);

  return {
    exitScore: d1.score + d2.score + d3.score,
    maxExitScore: 60, // 20+20+20
    d1, d2, d3,
    timestamp: Date.now(),
  };
}

function computeATRAverage(atrArr, period) {
  if (!atrArr || atrArr.length < period) {
    // Use whatever we have
    const valid = atrArr ? atrArr.filter((v) => v != null) : [];
    if (valid.length === 0) return null;
    return valid.reduce((sum, v) => sum + v, 0) / valid.length;
  }

  let sum = 0;
  let count = 0;
  for (let i = atrArr.length - period; i < atrArr.length; i++) {
    if (atrArr[i] != null) {
      sum += atrArr[i];
      count++;
    }
  }
  return count > 0 ? sum / count : null;
}

function getLastValid(arr) {
  if (!arr || !arr.length) return null;
  for (let i = arr.length - 1; i >= 0; i--) {
    if (arr[i] != null) return arr[i];
  }
  return null;
}
