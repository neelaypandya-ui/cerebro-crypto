/* ============================================================
   Strategy D — Mean Reversion
   ============================================================ */

export const meanReversion = {
  meta: {
    name: 'Mean Reversion',
    description: 'Buys at lower Bollinger Band with RSI oversold confirmation.',
    regimes: ['choppy'],
    category: 'mean_reversion',
    timeframes: ['FIFTEEN_MINUTE', 'ONE_HOUR'],
    bestFor: ['BTC-USD', 'ETH-USD', 'DOGE-USD'],
    entryConditions: [
      'Price touches lower Bollinger Band (within 0.2%)',
      'RSI < 35',
      'Bullish candle (close > open)',
    ],
    exitConditions: [
      'TP1: Middle BB',
      'TP2: Upper BB',
      'Stop-loss: 1.5% below lower BB',
    ],
  },

  requiredIndicators: ['bbands', 'rsi', 'atr'],

  checkEntry(candles, indicators, _orderBook, i) {
    const close = candles[i].close;
    const lowerBB = indicators.bbands?.lower?.[i];
    const rsi = indicators.rsi?.[i];
    const isBullish = candles[i].close > candles[i].open;

    if (lowerBB == null || rsi == null) return null;

    if (close <= lowerBB * 1.002 && rsi < 35 && isBullish) {
      return { entry: true, direction: 'long', reason: 'Mean Reversion: Price at lower BB, oversold RSI, bullish candle', confidence: 'medium' };
    }
    return null;
  },

  checkExit(position, candles, indicators, i) {
    // Exit at middle BB
    const middleBB = indicators.bbands?.middle?.[i];
    if (middleBB != null && candles[i].close >= middleBB && !position.tp1Hit) {
      return { exit: true, reason: 'Mean reversion target: middle BB', price: middleBB, partial: true };
    }
    return null;
  },

  riskOverrides: { tp1R: 1.0, tp2R: 2.0 },
};
