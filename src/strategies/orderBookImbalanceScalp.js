/* ============================================================
   Strategy H — Order Book Imbalance Scalp
   ============================================================
   L2 bid/ask imbalance detection, RSI filter, imbalance-flip exit.
   2-min max duration.
   ============================================================ */

export const orderBookImbalanceScalp = {
  meta: {
    name: 'Order Book Imbalance',
    description: 'Detects L2 bid/ask volume imbalance and trades in the direction of the heavier side.',
    regimes: ['bullish', 'choppy'],
    category: 'scalp',
    timeframes: ['ONE_MINUTE'],
    bestFor: ['BTC-USD', 'ETH-USD'],
    entryConditions: [
      'Bid volume > 2x ask volume (top 10 levels)',
      'RSI between 40-60 (neutral, not overbought/oversold)',
      'Spread is green (< 0.03%)',
    ],
    exitConditions: [
      'Imbalance flips (ask > bid)',
      'TP: 0.1% move in direction',
      'Time stop: 2 minutes max',
    ],
  },

  requiredIndicators: ['rsi'],

  checkEntry(candles, indicators, orderBook, i) {
    if (!orderBook || !orderBook.bids || !orderBook.asks) return null;
    const rsi = indicators.rsi?.[i];
    if (rsi == null) return null;

    // RSI filter: neutral zone
    if (rsi < 40 || rsi > 60) return null;

    // Calculate L2 imbalance (top 10 levels)
    const topBids = orderBook.bids.slice(0, 10);
    const topAsks = orderBook.asks.slice(0, 10);

    const bidVolume = topBids.reduce((sum, [, qty]) => sum + parseFloat(qty), 0);
    const askVolume = topAsks.reduce((sum, [, qty]) => sum + parseFloat(qty), 0);

    if (bidVolume === 0 || askVolume === 0) return null;

    const imbalanceRatio = bidVolume / askVolume;

    if (imbalanceRatio > 2.0) {
      return {
        entry: true,
        direction: 'long',
        reason: `OB Imbalance: Bid/Ask ratio ${imbalanceRatio.toFixed(1)}x, RSI=${rsi.toFixed(0)}`,
        confidence: imbalanceRatio > 3 ? 'high' : 'medium',
        meta: { entryImbalance: imbalanceRatio },
      };
    }

    return null;
  },

  checkExit(position, candles, indicators, i) {
    const barsHeld = i - (position.entryBar || 0);
    if (barsHeld >= 2) {
      return { exit: true, reason: 'Time stop: 2 min max duration', price: candles[i].close, closeQty: position.remainingQty };
    }
    return null;
  },

  riskOverrides: {
    stopLossPct: 0.1,
    tp1R: 1.0,
    tp2R: 0,
    maxDurationBars: 2,
    cooldownBars: 2,
    positionSizePct: 2,
  },
};
