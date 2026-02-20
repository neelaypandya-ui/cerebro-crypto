/* ============================================================
   Strategy G — Momentum Spike Scalp
   ============================================================
   Volume spike detection, pullback entry, spike-high retest target.
   3-min max duration.
   ============================================================ */

export const momentumSpikeScalp = {
  meta: {
    name: 'Momentum Spike Scalp',
    description: 'Detects volume spikes, enters on pullback, targets spike high retest.',
    regimes: ['bullish'],
    category: 'scalp',
    timeframes: ['ONE_MINUTE', 'FIVE_MINUTE'],
    bestFor: ['BTC-USD', 'ETH-USD', 'SOL-USD'],
    entryConditions: [
      'Volume spike: > 3x 20-bar average',
      'Spike candle is bullish (close > open)',
      'Pullback candle: retraces 30-60% of spike',
      'RSI still > 50 on pullback',
    ],
    exitConditions: [
      'TP: Spike candle high retest',
      'Stop-loss: Below pullback low',
      'Time stop: 3 minutes max',
    ],
  },

  requiredIndicators: ['rsi', 'volumeSMA20', 'atr'],

  checkEntry(candles, indicators, _orderBook, i) {
    if (i < 3) return null;
    const c = candles[i]; // current (pullback candle)
    const spike = candles[i - 1]; // previous (spike candle)
    const volAvg = indicators.volumeSMA20?.[i - 1];
    const rsi = indicators.rsi?.[i];

    if (volAvg == null || rsi == null) return null;

    // Spike detection on previous bar
    const isSpike = spike.volume > volAvg * 3 && spike.close > spike.open;
    if (!isSpike) return null;

    // Pullback: current bar retraces 30-60% of spike range
    const spikeRange = spike.high - spike.low;
    const retracement = spike.high - c.close;
    const retracePct = retracement / spikeRange;
    if (retracePct < 0.3 || retracePct > 0.6) return null;

    // RSI still bullish
    if (rsi <= 50) return null;

    return {
      entry: true,
      direction: 'long',
      reason: `Momentum Spike: Volume ${(spike.volume / volAvg).toFixed(1)}x avg, ${(retracePct * 100).toFixed(0)}% pullback`,
      confidence: 'high',
      meta: { spikeHigh: spike.high, pullbackLow: c.low },
    };
  },

  checkExit(position, candles, indicators, i) {
    const barsHeld = i - (position.entryBar || 0);
    if (barsHeld >= 3) {
      return { exit: true, reason: 'Time stop: 3 min max duration', price: candles[i].close, closeQty: position.remainingQty };
    }
    // TP at spike high
    if (position.meta?.spikeHigh != null && candles[i].high >= position.meta.spikeHigh) {
      return { exit: true, reason: 'TP: Spike high retest', price: position.meta.spikeHigh, closeQty: position.remainingQty };
    }
    return null;
  },

  riskOverrides: {
    stopLossPct: 0.15,
    tp1R: 2.0,
    tp2R: 0,
    maxDurationBars: 3,
    cooldownBars: 3,
    positionSizePct: 3,
  },
};
