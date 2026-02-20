/* ============================================================
   Strategy C — VWAP Reclaim
   ============================================================ */

export const vwapReclaim = {
  meta: {
    name: 'VWAP Reclaim',
    description: 'Enters long when price reclaims VWAP from below with increasing RSI.',
    regimes: ['bullish'],
    category: 'trend',
    timeframes: ['FIVE_MINUTE', 'FIFTEEN_MINUTE'],
    bestFor: ['BTC-USD', 'ETH-USD', 'XRP-USD'],
    entryConditions: [
      'Previous close below VWAP',
      'Current close above VWAP',
      'RSI recovering (increasing) and > 40',
    ],
    exitConditions: [
      'TP1: 1.5R', 'TP2: 3R',
      'Stop-loss: VWAP - 1x ATR',
    ],
  },

  requiredIndicators: ['vwap', 'rsi', 'atr'],

  checkEntry(candles, indicators, _orderBook, i) {
    if (i < 1) return null;
    const close = candles[i].close;
    const prevClose = candles[i - 1].close;
    const vwap = indicators.vwap?.[i];
    const prevVwap = indicators.vwap?.[i - 1];
    const rsi = indicators.rsi?.[i];
    const prevRsi = indicators.rsi?.[i - 1];

    if (vwap == null || prevVwap == null || rsi == null || prevRsi == null) return null;

    if (prevClose < prevVwap && close > vwap && rsi > prevRsi && rsi > 40) {
      return { entry: true, direction: 'long', reason: 'VWAP Reclaim: Price reclaimed VWAP with RSI recovery', confidence: 'medium' };
    }
    return null;
  },

  checkExit(position, candles, indicators, i) {
    return null;
  },

  riskOverrides: {},
};
