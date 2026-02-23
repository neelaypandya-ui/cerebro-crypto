/* ============================================================
   HYDRA — Unified Strategy Engine (Main Entry Point)
   ============================================================
   Single strategy that replaces all 8 prior strategies.
   5-dimensional confluence scoring with self-calibrating threshold,
   ATR-based sizing, dynamic targets, and exit score monitoring.
   ============================================================ */

import { calculateHydraScore, calculateExitScore } from './scoring.js';
import { calculateHydraSize } from './sizing.js';
import { checkHydraExit, updatePositionAfterTP1, updatePositionAfterTP2, updateHighWaterMark } from './exitMonitor.js';
import { recalibrateThreshold } from './selfCalibration.js';

/**
 * HYDRA strategy definition — conforms to the strategy interface
 * expected by the strategy engine (checkEntry, checkExit, meta).
 */
export const hydra = {
  meta: {
    name: 'HYDRA',
    description: '5-dimensional confluence scoring engine with self-calibrating threshold',
    regimes: ['bullish', 'choppy'], // Does NOT enter during bearish (regime override)
    timeframe: 'ONE_MINUTE', // Evaluates on 1m bar close
    category: 'unified',
    requiredIndicators: [
      'ema9', 'ema21', 'ema50', 'sma200',
      'rsi', 'macd', 'bbands', 'atr', 'adx', 'vwap',
      'stochRSI', 'obv', 'volumeSMA20', 'high20', 'low20',
    ],
  },

  /**
   * Check for HYDRA entry signal.
   *
   * @param {Object[]} candles - candle array
   * @param {Object} indicators - computed indicator data
   * @param {Object} orderBook - { bids, asks }
   * @param {number} lastIdx - index of last candle
   * @param {Object} context - additional context (tradeFlow, pair, settings, regime, hydraState)
   *
   * @returns {Object|null} Entry signal or null
   */
  checkEntry(candles, indicators, orderBook, lastIdx, context = {}) {
    const {
      tradeFlow = {},
      pair = 'BTC-USD',
      settings = {},
      regime = 'choppy',
      entryThreshold = 65,
      recentTrades = [],
    } = context;

    // ---- Regime Override: No longs during bearish ----
    if (regime === 'bearish') {
      return {
        entry: false,
        hydraScore: null,
        reason: 'Regime override: bearish — no new longs',
      };
    }

    // ---- Calculate HYDRA Score ----
    const scoreResult = calculateHydraScore({
      indicators,
      orderBook,
      tradeFlow,
      pair,
      candles,
      settings,
    });

    const { totalScore, d1, d2, d3, d4, d5, spreadBlocked, atr14, price } = scoreResult;

    // ---- Spread Block ----
    if (spreadBlocked) {
      return {
        entry: false,
        hydraScore: scoreResult,
        reason: `Spread blocked — score was ${totalScore}/100`,
      };
    }

    // ---- Threshold Gate ----
    if (totalScore < entryThreshold) {
      return {
        entry: false,
        hydraScore: scoreResult,
        reason: `Score ${totalScore}/100 below threshold ${entryThreshold}`,
      };
    }

    // ---- Calculate Position Size ----
    const portfolioValue = context.portfolioValue || 25000;
    const sizing = calculateHydraSize({
      portfolioValue,
      entryPrice: price,
      atr14,
      totalScore,
      settings: {
        riskPerTrade: settings.riskPerTrade || 0.01,
        maxPositionPct: settings.maxPositionPct || 0.08,
      },
    });

    if (sizing.blocked) {
      return {
        entry: false,
        hydraScore: scoreResult,
        reason: sizing.reason,
      };
    }

    // ---- Signal Expiry: generate timestamp ----
    const signalTimestamp = Date.now();

    return {
      entry: true,
      direction: 'long',
      confidence: totalScore >= 90 ? 'high' : totalScore >= 85 ? 'medium' : 'low',
      reason: `HYDRA score ${totalScore}/100 ≥ ${entryThreshold} — ${buildReasonSummary(d1, d2, d3, d4, d5)}`,
      hydraScore: scoreResult,
      sizing,
      signalTimestamp,
      // Pass through for trade record
      d1Score: d1.score,
      d2Score: d2.score,
      d3Score: d3.score,
      d4Score: d4.score,
      d5Score: d5.score,
      entryPrice: price,
      stopLoss: sizing.stopLoss,
      tp1: sizing.tp1,
      tp2: sizing.tp2,
      trailDistance: sizing.trailDistance,
      tp1ClosePct: sizing.tp1ClosePct,
      tp2ClosePct: sizing.tp2ClosePct,
      sessionHour: new Date().getUTCHours(),
    };
  },

  /**
   * Check for HYDRA exit signal on an open position.
   *
   * @param {Object} position - open position data
   * @param {Object[]} candles - candle array
   * @param {Object} indicators - computed indicator data
   * @param {number} lastIdx - index of last candle
   * @param {Object} context - additional context (tradeFlow, exitThreshold)
   *
   * @returns {Object|null} Exit signal or null
   */
  checkExit(position, candles, indicators, lastIdx, context = {}) {
    const { tradeFlow = {}, exitThreshold = 40 } = context;
    const currentPrice = candles[lastIdx]?.close;

    if (!currentPrice) return null;

    // Update high-water mark for trailing stop
    const updatedPosition = updateHighWaterMark(position, currentPrice);

    const exitResult = checkHydraExit({
      position: updatedPosition,
      indicators,
      tradeFlow,
      candles,
      currentPrice,
      exitThreshold,
    });

    if (exitResult.shouldExit) {
      return {
        exit: true,
        reason: exitResult.reason,
        exitType: exitResult.exitType,
        partialClose: exitResult.partialClose,
        updatedPosition: exitResult.exitType === 'TP1'
          ? updatePositionAfterTP1(updatedPosition, currentPrice)
          : exitResult.exitType === 'TP2'
            ? updatePositionAfterTP2(updatedPosition)
            : updatedPosition,
      };
    }

    return null;
  },

  // No fixed risk overrides — HYDRA uses ATR-based dynamic sizing
  riskOverrides: {},
};

/**
 * Build a human-readable summary of which dimensions contributed most.
 */
function buildReasonSummary(d1, d2, d3, d4, d5) {
  const parts = [];
  if (d1.score >= 16) parts.push('strong trend');
  if (d2.score >= 15) parts.push('quality momentum');
  if (d3.score >= 14) parts.push('volume conviction');
  if (d4.score >= 14) parts.push('microstructure support');
  if (d5.score >= 14) parts.push('favorable session');

  return parts.length > 0 ? parts.join(', ') : 'balanced confluence';
}

export default hydra;
