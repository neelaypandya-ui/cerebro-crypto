/* ============================================================
   Strategy B — Breakout
   ============================================================ */

export const breakout = {
  meta: {
    name: 'Breakout',
    description: 'Detects breakouts above resistance with volume confirmation.',
    regimes: ['bullish'],
    category: 'trend',
    timeframes: ['FIFTEEN_MINUTE', 'ONE_HOUR'],
    bestFor: ['BTC-USD', 'ETH-USD', 'SOL-USD'],
    entryConditions: [
      'Close above 20-bar high',
      'Volume > 2x 20-bar average',
      'Previous bar closed below resistance',
    ],
    exitConditions: [
      'TP1: 1.5R (close 50%)',
      'TP2: 3R (close remainder)',
      'Stop-loss below breakout level',
    ],
  },

  requiredIndicators: ['high20', 'volumeSMA20', 'atr'],

  checkEntry(candles, indicators, _orderBook, i) {
    if (i < 1) return null;
    const close = candles[i].close;
    const prevClose = candles[i - 1].close;
    const volume = candles[i].volume;
    const high20 = indicators.high20?.[i - 1]; // use previous bar's high
    const volAvg = indicators.volumeSMA20?.[i];

    if (high20 == null || volAvg == null) return null;

    if (prevClose <= high20 && close > high20 && volume > volAvg * 2) {
      return { entry: true, direction: 'long', reason: 'Breakout: Close above 20-bar high with volume confirmation', confidence: 'high' };
    }
    return null;
  },

  checkExit(position, candles, indicators, i) {
    return null;
  },

  riskOverrides: { stopLossMethod: 'atr', stopLossATRMult: 1.5 },
};
