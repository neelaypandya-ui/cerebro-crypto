/* ============================================================
   Strategy A — Crypto Momentum
   ============================================================ */

export const cryptoMomentum = {
  meta: {
    name: 'Crypto Momentum',
    description: 'Enters positions when price shows strong directional movement with rising volume and EMA alignment.',
    regimes: ['bullish'],
    category: 'trend',
    timeframes: ['FIVE_MINUTE', 'FIFTEEN_MINUTE', 'ONE_HOUR'],
    bestFor: ['BTC-USD', 'ETH-USD', 'SOL-USD'],
    entryConditions: [
      'EMA 9 crosses above EMA 21',
      'RSI > 50',
      'Volume > 1.5x 20-bar average',
    ],
    exitConditions: [
      'TP1: 1.5R (close 50%)',
      'TP2: 3R (close remainder)',
      'Stop-loss: 2% or 2x ATR',
      'Trailing stop after TP1',
    ],
  },

  requiredIndicators: ['ema9', 'ema21', 'rsi', 'atr', 'volumeSMA20'],

  checkEntry(candles, indicators, _orderBook, i) {
    if (i < 1) return null;
    const close = candles[i].close;
    const volume = candles[i].volume;
    const ema9 = indicators.ema9?.[i];
    const ema21 = indicators.ema21?.[i];
    const prevEma9 = indicators.ema9?.[i - 1];
    const prevEma21 = indicators.ema21?.[i - 1];
    const rsi = indicators.rsi?.[i];
    const volAvg = indicators.volumeSMA20?.[i];

    if (ema9 == null || ema21 == null || prevEma9 == null || prevEma21 == null || rsi == null || volAvg == null) return null;

    if (prevEma9 <= prevEma21 && ema9 > ema21 && rsi > 50 && volume > volAvg * 1.5) {
      return { entry: true, direction: 'long', reason: 'Momentum: EMA9 crossed above EMA21, RSI > 50, volume surge', confidence: rsi > 60 ? 'high' : 'medium' };
    }
    return null;
  },

  checkExit(position, candles, indicators, i) {
    // Default TP/SL handled by position manager
    return null;
  },

  riskOverrides: {},
};
