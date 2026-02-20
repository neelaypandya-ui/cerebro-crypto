/* ============================================================
   Strategy F — Micro VWAP Scalp
   ============================================================
   1m VWAP pullback + StochRSI + HMA confirmation.
   Tight targets, 5-min max duration, 2-min cooldown.
   ============================================================ */

export const microVwapScalp = {
  meta: {
    name: 'Micro VWAP Scalp',
    description: '1m VWAP pullback with StochRSI oversold and HMA trend confirmation. Ultra-tight targets.',
    regimes: ['bullish', 'choppy'],
    category: 'scalp',
    timeframes: ['ONE_MINUTE'],
    bestFor: ['BTC-USD', 'ETH-USD'],
    entryConditions: [
      'Price pulls back to VWAP (within 0.1%)',
      'StochRSI K < 20 (oversold)',
      'HMA slope positive (trend up)',
      'Volume on pullback candle < average (selling exhaustion)',
    ],
    exitConditions: [
      'TP: 0.15% above entry',
      'Stop-loss: 0.1% below VWAP',
      'Time stop: 5 minutes max',
      'Cooldown: 2 minutes between trades',
    ],
  },

  requiredIndicators: ['vwap', 'stochRsi', 'hma', 'volumeSMA20'],

  checkEntry(candles, indicators, _orderBook, i) {
    if (i < 2) return null;
    const c = candles[i];
    const close = c.close;
    const vwap = indicators.vwap?.[i];
    const stochK = indicators.stochRsi?.k?.[i];
    const hma = indicators.hma?.[i];
    const prevHma = indicators.hma?.[i - 1];
    const volAvg = indicators.volumeSMA20?.[i];

    if (vwap == null || stochK == null || hma == null || prevHma == null || volAvg == null) return null;

    // Price near VWAP (within 0.1%)
    const distFromVwap = Math.abs(close - vwap) / vwap;
    if (distFromVwap > 0.001) return null;

    // StochRSI oversold
    if (stochK >= 20) return null;

    // HMA trending up
    if (hma <= prevHma) return null;

    // Volume exhaustion on pullback
    if (c.volume > volAvg) return null;

    return {
      entry: true,
      direction: 'long',
      reason: `Micro VWAP Scalp: Pullback to VWAP, StochRSI=${stochK.toFixed(0)}, HMA rising`,
      confidence: 'medium',
    };
  },

  checkExit(position, candles, indicators, i) {
    // Time stop: 5 minutes (5 bars on 1m)
    const barsHeld = i - (position.entryBar || 0);
    if (barsHeld >= 5) {
      return { exit: true, reason: 'Time stop: 5 min max duration', price: candles[i].close, closeQty: position.remainingQty };
    }
    return null;
  },

  riskOverrides: {
    stopLossPct: 0.1,
    tp1R: 1.5,
    tp2R: 0, // single target
    maxDurationBars: 5,
    cooldownBars: 2,
    positionSizePct: 3,
  },
};
