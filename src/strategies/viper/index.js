/* ============================================================
   VIPER — Adaptive Meta-Strategy
   ============================================================
   An aggressive, adaptive meta-strategy with 3 internal modes
   (STRIKE / COIL / LUNGE) that compete for activation every
   15 minutes via the Edge Detector.

   Exports the same interface as HYDRA:
     { meta, checkEntry(), checkExit(), riskOverrides }

   The engine calls checkEntry/checkExit with an enriched context
   that includes viperState, multi-timeframe candles/indicators,
   tradeFlow, and tickerTuning.
   ============================================================ */

import { checkStrikeEntry, checkStrikeExit } from './modes/strike.js';
import { checkCoilEntry, checkCoilExit } from './modes/coil.js';
import { checkLungeEntry, checkLungeExit } from './modes/lunge.js';
import { getTuning } from './tickerTuning.js';

export const viper = {
  meta: {
    name: 'VIPER',
    description: 'Adaptive meta-strategy: STRIKE (scalp), COIL (range), LUNGE (momentum)',
    regimes: ['bullish', 'choppy'],
    requiredIndicators: [
      'ema9', 'ema21', 'ema50', 'rsi', 'macd', 'bbands',
      'atr', 'adx', 'vwap', 'stochRSI', 'hma', 'volumeSMA20',
      'high20', 'low20',
    ],
    modes: ['STRIKE', 'COIL', 'LUNGE'],
    modeColors: {
      STRIKE: '#ff8c00',  // orange
      COIL:   '#00bcd4',  // cyan
      LUNGE:  '#9c27b0',  // purple
    },
  },

  /**
   * Check for entry signal based on the currently active VIPER mode.
   *
   * @param {Object[]} candles - primary timeframe candles (unused, we use multi-TF from context)
   * @param {Object} indicators - primary timeframe indicators (unused)
   * @param {Object} orderBook
   * @param {number} lastIdx - unused
   * @param {Object} context - enriched context from engine
   * @returns {Object|null} entry signal
   */
  checkEntry(candles, indicators, orderBook, lastIdx, context) {
    const {
      viperState = {},
      candles1m, candles5m, candles15m,
      indicators1m, indicators5m, indicators15m,
      tradeFlow,
      pair,
      allocatedCapital = 0,
    } = context;

    const activeMode = viperState.activeMode;
    if (!activeMode) return null;

    const entryContext = {
      pair,
      viperState,
      allocatedCapital,
    };

    switch (activeMode) {
      case 'STRIKE':
        return checkStrikeEntry(candles1m, indicators1m, orderBook, tradeFlow, entryContext);

      case 'COIL':
        return checkCoilEntry(candles5m, indicators5m, candles15m, orderBook, entryContext);

      case 'LUNGE':
        return checkLungeEntry(candles15m, indicators15m, orderBook, entryContext);

      default:
        return null;
    }
  },

  /**
   * Check for exit signal on an open VIPER position.
   * Delegates to the appropriate mode's exit logic based on position metadata.
   *
   * @param {Object} position
   * @param {Object[]} candles - unused
   * @param {Object} indicators - unused
   * @param {number} lastIdx - unused
   * @param {Object} context - enriched context from engine
   * @returns {Object|null} exit signal
   */
  checkExit(position, candles, indicators, lastIdx, context) {
    const {
      candles1m, candles5m, candles15m,
      indicators1m, indicators5m, indicators15m,
    } = context;

    const currentPrice = context.currentPrice
      || (candles1m && candles1m.length > 0 ? candles1m[candles1m.length - 1].close : null);

    if (!currentPrice) return null;

    const mode = position.mode || position.viperMode;

    switch (mode) {
      case 'STRIKE':
        return checkStrikeExit(position, candles1m, indicators1m, currentPrice);

      case 'COIL':
        return checkCoilExit(position, candles5m, indicators5m, currentPrice);

      case 'LUNGE':
        return checkLungeExit(position, candles15m, indicators15m, currentPrice);

      default:
        return null;
    }
  },

  /**
   * Risk overrides for VIPER positions (used by the risk pipeline).
   */
  riskOverrides: {
    // VIPER manages its own position sizing per-mode
    useCustomSizing: true,
    // Cross-strategy: HYDRA + VIPER cannot hold the same pair
    exclusivePairLock: true,
  },
};
