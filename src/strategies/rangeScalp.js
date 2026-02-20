/* ============================================================
   Strategy E — Range Scalp (Enhanced)
   ============================================================ */

export const rangeScalp = {
  meta: {
    name: 'Range Scalp',
    description: 'Auto-detects S/R, validates range via ATR, uses engulfing/hammer confirmation with RSI+volume entry.',
    regimes: ['choppy'],
    category: 'scalp',
    timeframes: ['FIVE_MINUTE', 'FIFTEEN_MINUTE'],
    bestFor: ['BTC-USD', 'ETH-USD', 'SOL-USD'],
    entryConditions: [
      'Price within 0.3% of detected support',
      'Range width > 2x ATR (valid range)',
      'Bullish engulfing or hammer candle pattern',
      'RSI < 40 (not deeply oversold)',
      'Volume > 1.2x average on entry candle',
    ],
    exitConditions: [
      'TP1: 50% of range (close 60%)',
      'TP2: 80% of range (close remainder)',
      'Stop-loss: 0.5% below support',
      'Invalidation: close below support by > 1 ATR',
    ],
  },

  requiredIndicators: ['atr', 'rsi', 'volumeSMA20', 'low20', 'high20'],

  checkEntry(candles, indicators, _orderBook, i) {
    if (i < 2) return null;
    const c = candles[i];
    const prev = candles[i - 1];
    const close = c.close;
    const low20 = indicators.low20?.[i];
    const high20 = indicators.high20?.[i];
    const atr = indicators.atr?.[i];
    const rsi = indicators.rsi?.[i];
    const volAvg = indicators.volumeSMA20?.[i];

    if (low20 == null || high20 == null || atr == null || rsi == null || volAvg == null) return null;

    // Range validation: width must be > 2x ATR
    const rangeWidth = high20 - low20;
    if (rangeWidth < atr * 2) return null;

    // Near support (within 0.3%)
    if (close > low20 * 1.003) return null;

    // RSI filter
    if (rsi >= 40 || rsi < 15) return null;

    // Volume confirmation
    if (c.volume < volAvg * 1.2) return null;

    // Candle pattern: bullish engulfing or hammer
    const isBullishEngulfing = c.close > c.open && prev.close < prev.open && c.close > prev.open && c.open < prev.close;
    const bodySize = Math.abs(c.close - c.open);
    const lowerWick = Math.min(c.open, c.close) - c.low;
    const isHammer = lowerWick > bodySize * 2 && c.close > c.open;

    if (!isBullishEngulfing && !isHammer) return null;

    return {
      entry: true,
      direction: 'long',
      reason: `Range Scalp: ${isBullishEngulfing ? 'Bullish engulfing' : 'Hammer'} near support, RSI=${rsi.toFixed(0)}, range valid`,
      confidence: 'medium',
      meta: { support: low20, resistance: high20, rangeWidth },
    };
  },

  checkExit(position, candles, indicators, i) {
    const atr = indicators.atr?.[i];
    const close = candles[i].close;

    // Invalidation: close below support by > 1 ATR
    if (atr != null && position.meta?.support != null) {
      if (close < position.meta.support - atr) {
        return { exit: true, reason: 'Range invalidation: price broke support by > 1 ATR', price: close, closeQty: position.remainingQty };
      }
    }
    return null;
  },

  riskOverrides: { stopLossPct: 0.5, tp1R: 1.0, tp2R: 1.8, maxDurationBars: 20 },
};
