/* ============================================================
   Cerebro Crypto — Backtesting Engine Web Worker
   ============================================================
   Runs entire backtest simulation off the main thread.
   Supports multiple strategies with proper risk management.
   ============================================================ */

// =========================================================================
//  Indicator Functions (duplicated from indicators worker for isolation)
// =========================================================================

function SMA(data, period) {
  const result = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(null);
    } else {
      let sum = 0;
      for (let j = i - period + 1; j <= i; j++) {
        sum += data[j];
      }
      result.push(sum / period);
    }
  }
  return result;
}

function EMA(data, period) {
  const result = [];
  const multiplier = 2 / (period + 1);
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      sum += data[i];
      result.push(null);
    } else if (i === period - 1) {
      sum += data[i];
      result.push(sum / period);
    } else {
      const prev = result[i - 1];
      result.push((data[i] - prev) * multiplier + prev);
    }
  }
  return result;
}

function RSI(data, period = 14) {
  const result = [];
  if (data.length < period + 1) return data.map(() => null);
  let gainSum = 0;
  let lossSum = 0;
  for (let i = 1; i <= period; i++) {
    const change = data[i] - data[i - 1];
    if (change >= 0) gainSum += change;
    else lossSum += Math.abs(change);
  }
  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;
  for (let i = 0; i < period; i++) result.push(null);
  result.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
  for (let i = period + 1; i < data.length; i++) {
    const change = data[i] - data[i - 1];
    avgGain = (avgGain * (period - 1) + (change >= 0 ? change : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (change < 0 ? Math.abs(change) : 0)) / period;
    result.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
  }
  return result;
}

function MACD(data, fast = 12, slow = 26, signalPeriod = 9) {
  const emaFast = EMA(data, fast);
  const emaSlow = EMA(data, slow);
  const macdLine = [];
  for (let i = 0; i < data.length; i++) {
    if (emaFast[i] === null || emaSlow[i] === null) macdLine.push(null);
    else macdLine.push(emaFast[i] - emaSlow[i]);
  }
  const firstValid = macdLine.findIndex((v) => v !== null);
  const macdValues = macdLine.slice(firstValid).map((v) => v ?? 0);
  const signalValues = EMA(macdValues, signalPeriod);
  const signal = [];
  const histogram = [];
  for (let i = 0; i < data.length; i++) {
    if (i < firstValid) { signal.push(null); histogram.push(null); }
    else {
      const s = signalValues[i - firstValid];
      signal.push(s);
      histogram.push(macdLine[i] !== null && s !== null ? macdLine[i] - s : null);
    }
  }
  return { macd: macdLine, signal, histogram };
}

function BollingerBands(data, period = 20, stdDevMult = 2) {
  const middle = SMA(data, period);
  const upper = [];
  const lower = [];
  for (let i = 0; i < data.length; i++) {
    if (middle[i] === null) { upper.push(null); lower.push(null); }
    else {
      let sumSqDiff = 0;
      for (let j = i - period + 1; j <= i; j++) {
        const diff = data[j] - middle[i];
        sumSqDiff += diff * diff;
      }
      const stdDev = Math.sqrt(sumSqDiff / period);
      upper.push(middle[i] + stdDevMult * stdDev);
      lower.push(middle[i] - stdDevMult * stdDev);
    }
  }
  return { upper, middle, lower };
}

function ATR(candles, period = 14) {
  if (candles.length === 0) return [];
  const trueRanges = [candles[0].high - candles[0].low];
  for (let i = 1; i < candles.length; i++) {
    const h = candles[i].high;
    const l = candles[i].low;
    const pc = candles[i - 1].close;
    trueRanges.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  const result = [];
  for (let i = 0; i < period - 1; i++) result.push(null);
  let sum = 0;
  for (let i = 0; i < period; i++) sum += trueRanges[i];
  let atr = sum / period;
  result.push(atr);
  for (let i = period; i < trueRanges.length; i++) {
    atr = (atr * (period - 1) + trueRanges[i]) / period;
    result.push(atr);
  }
  return result;
}

function VWAP(candles) {
  const result = [];
  let cumTPV = 0;
  let cumVol = 0;
  for (const c of candles) {
    const tp = (c.high + c.low + c.close) / 3;
    cumTPV += tp * c.volume;
    cumVol += c.volume;
    result.push(cumVol === 0 ? null : cumTPV / cumVol);
  }
  return result;
}

// =========================================================================
//  Additional Indicators for New Strategies
// =========================================================================

function HMA_BT(data, period = 9) {
  const len = data.length;
  if (len < period) return data.map(() => null);
  const halfP = Math.floor(period / 2);
  const sqrtP = Math.floor(Math.sqrt(period));
  function WMA(arr, p) {
    const out = new Array(arr.length).fill(null);
    if (arr.length < p) return out;
    for (let i = p - 1; i < arr.length; i++) {
      let s = 0, w = 0;
      for (let j = 0; j < p; j++) { const wt = p - j; s += arr[i - j] * wt; w += wt; }
      out[i] = s / w;
    }
    return out;
  }
  const wH = WMA(data, halfP), wF = WMA(data, period);
  const diff = data.map((_, i) => wH[i] != null && wF[i] != null ? 2 * wH[i] - wF[i] : null);
  const fv = diff.findIndex((v) => v !== null);
  if (fv < 0) return data.map(() => null);
  const dv = diff.slice(fv).map((v) => v ?? 0);
  const hr = WMA(dv, sqrtP);
  const result = new Array(len).fill(null);
  for (let i = 0; i < hr.length; i++) { if (hr[i] != null) result[fv + i] = hr[i]; }
  return result;
}

function StochRSI_BT(data, rsiPeriod = 14, stochPeriod = 14, kSmooth = 3, dSmooth = 3) {
  const rsi = RSI(data, rsiPeriod);
  const len = data.length;
  const stochRaw = new Array(len).fill(null);
  for (let i = stochPeriod - 1; i < len; i++) {
    let mn = Infinity, mx = -Infinity, ok = true;
    for (let j = i - stochPeriod + 1; j <= i; j++) {
      if (rsi[j] == null) { ok = false; break; }
      if (rsi[j] < mn) mn = rsi[j]; if (rsi[j] > mx) mx = rsi[j];
    }
    if (!ok) continue;
    stochRaw[i] = mx === mn ? 50 : ((rsi[i] - mn) / (mx - mn)) * 100;
  }
  const k = new Array(len).fill(null);
  for (let i = kSmooth - 1; i < len; i++) {
    let s = 0, c = 0;
    for (let j = i - kSmooth + 1; j <= i; j++) { if (stochRaw[j] != null) { s += stochRaw[j]; c++; } }
    if (c === kSmooth) k[i] = s / c;
  }
  const d = new Array(len).fill(null);
  for (let i = dSmooth - 1; i < len; i++) {
    let s = 0, c = 0;
    for (let j = i - dSmooth + 1; j <= i; j++) { if (k[j] != null) { s += k[j]; c++; } }
    if (c === dSmooth) d[i] = s / c;
  }
  return { k, d };
}

// =========================================================================
//  Pre-compute All Indicators for Backtest
// =========================================================================

function precomputeIndicators(candles) {
  const closes = candles.map((c) => c.close);
  const volumes = candles.map((c) => c.volume);

  return {
    ema9: EMA(closes, 9),
    ema21: EMA(closes, 21),
    ema50: EMA(closes, 50),
    sma200: SMA(closes, 200),
    rsi: RSI(closes, 14),
    macd: MACD(closes, 12, 26, 9),
    bbands: BollingerBands(closes, 20, 2),
    atr: ATR(candles, 14),
    vwap: VWAP(candles),
    volumeSMA20: SMA(volumes, 20),
    high20: computeRollingHigh(closes, 20),
    low20: computeRollingLow(closes, 20),
    hma: HMA_BT(closes, 9),
    stochRsi: StochRSI_BT(closes, 14, 14, 3, 3),
  };
}

function computeRollingHigh(data, period) {
  const result = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) { result.push(null); continue; }
    let max = -Infinity;
    for (let j = i - period + 1; j <= i; j++) {
      if (data[j] > max) max = data[j];
    }
    result.push(max);
  }
  return result;
}

function computeRollingLow(data, period) {
  const result = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) { result.push(null); continue; }
    let min = Infinity;
    for (let j = i - period + 1; j <= i; j++) {
      if (data[j] < min) min = data[j];
    }
    result.push(min);
  }
  return result;
}

// =========================================================================
//  Strategy Signal Detection
// =========================================================================

/**
 * Check if a strategy generates an entry signal at bar index `i`.
 * Returns { entry: true, direction: 'long', reason: '...' } or null.
 */
function checkEntrySignal(strategy, candles, indicators, i) {
  const close = candles[i].close;
  const prevClose = i > 0 ? candles[i - 1].close : close;
  const volume = candles[i].volume;
  const volAvg = indicators.volumeSMA20[i];

  switch (strategy) {
    case 'momentum': {
      const ema9 = indicators.ema9[i];
      const ema21 = indicators.ema21[i];
      const prevEma9 = i > 0 ? indicators.ema9[i - 1] : null;
      const prevEma21 = i > 0 ? indicators.ema21[i - 1] : null;
      const rsi = indicators.rsi[i];

      if (
        ema9 != null && ema21 != null &&
        prevEma9 != null && prevEma21 != null &&
        rsi != null && volAvg != null
      ) {
        // EMA9 crosses above EMA21, RSI > 50, volume > 1.5x avg
        if (prevEma9 <= prevEma21 && ema9 > ema21 && rsi > 50 && volume > volAvg * 1.5) {
          return { entry: true, direction: 'long', reason: 'Momentum: EMA9 crossed above EMA21, RSI > 50, volume surge' };
        }
      }
      return null;
    }

    case 'breakout': {
      const high20 = indicators.high20[i];
      if (high20 != null && volAvg != null) {
        // Close above 20-period high with volume > 2x avg
        // Use previous bar's high20 to detect breakout
        const prevHigh20 = i > 0 ? indicators.high20[i - 1] : null;
        if (prevHigh20 != null && prevClose <= prevHigh20 && close > prevHigh20 && volume > volAvg * 2) {
          return { entry: true, direction: 'long', reason: 'Breakout: Close above 20-bar high with volume confirmation' };
        }
      }
      return null;
    }

    case 'vwap_reclaim': {
      const vwap = indicators.vwap[i];
      const prevVwap = i > 0 ? indicators.vwap[i - 1] : null;
      const rsi = indicators.rsi[i];
      const prevRsi = i > 0 ? indicators.rsi[i - 1] : null;

      if (vwap != null && prevVwap != null && rsi != null && prevRsi != null) {
        // Price was below VWAP, now closes above; RSI recovering (increasing)
        if (prevClose < prevVwap && close > vwap && rsi > prevRsi && rsi > 40) {
          return { entry: true, direction: 'long', reason: 'VWAP Reclaim: Price reclaimed VWAP with RSI recovery' };
        }
      }
      return null;
    }

    case 'mean_reversion': {
      const lowerBB = indicators.bbands.lower[i];
      const rsi = indicators.rsi[i];

      if (lowerBB != null && rsi != null) {
        // Price touches lower BB, RSI < 35, bullish candle (close > open)
        const isBullish = candles[i].close > candles[i].open;
        if (close <= lowerBB * 1.002 && rsi < 35 && isBullish) {
          return { entry: true, direction: 'long', reason: 'Mean Reversion: Price at lower BB, oversold RSI, bullish candle' };
        }
      }
      return null;
    }

    case 'range_scalp': {
      const low20 = indicators.low20[i];
      const high20 = indicators.high20[i];
      const atr = indicators.atr[i];
      const rsi = indicators.rsi[i];

      if (low20 != null && high20 != null && atr != null && rsi != null && volAvg != null) {
        const rangeWidth = high20 - low20;
        if (rangeWidth < atr * 2) return null; // Range too narrow

        const nearSupport = close <= low20 * 1.003;
        if (!nearSupport || rsi >= 40 || rsi < 15) return null;
        if (volume < volAvg * 1.2) return null;

        const c = candles[i];
        const prev = i > 0 ? candles[i - 1] : c;
        const isBullishEngulfing = c.close > c.open && prev.close < prev.open && c.close > prev.open && c.open < prev.close;
        const bodySize = Math.abs(c.close - c.open);
        const lowerWick = Math.min(c.open, c.close) - c.low;
        const isHammer = lowerWick > bodySize * 2 && c.close > c.open;

        if (isBullishEngulfing || isHammer) {
          return { entry: true, direction: 'long', reason: 'Range Scalp: Pattern near support with RSI + volume confirmation' };
        }
      }
      return null;
    }

    case 'micro_vwap_scalp': {
      if (i < 2) return null;
      const vwap = indicators.vwap[i];
      const stochK = indicators.stochRsi?.k?.[i];
      const hma = indicators.hma?.[i];
      const prevHma = indicators.hma?.[i - 1];

      if (vwap == null || stochK == null || hma == null || prevHma == null || volAvg == null) return null;

      const distFromVwap = Math.abs(close - vwap) / vwap;
      if (distFromVwap > 0.001) return null; // Within 0.1% of VWAP
      if (stochK >= 20) return null; // StochRSI oversold
      if (hma <= prevHma) return null; // HMA trending up
      if (volume > volAvg) return null; // Volume exhaustion

      return { entry: true, direction: 'long', reason: 'Micro VWAP Scalp: Pullback to VWAP, StochRSI oversold, HMA rising' };
    }

    case 'momentum_spike_scalp': {
      if (i < 3) return null;
      const spike = candles[i - 1];
      const prevVolAvg = indicators.volumeSMA20[i - 1];
      const rsi = indicators.rsi[i];

      if (prevVolAvg == null || rsi == null) return null;

      const isSpike = spike.volume > prevVolAvg * 3 && spike.close > spike.open;
      if (!isSpike) return null;

      const spikeRange = spike.high - spike.low;
      if (spikeRange === 0) return null;
      const retracement = spike.high - close;
      const retracePct = retracement / spikeRange;
      if (retracePct < 0.3 || retracePct > 0.6) return null;
      if (rsi <= 50) return null;

      return { entry: true, direction: 'long', reason: 'Momentum Spike: Volume spike with pullback entry' };
    }

    case 'order_book_imbalance': {
      // Order book data not available in backtest — skip
      return null;
    }

    default:
      return null;
  }
}

// =========================================================================
//  Position Management During Backtest
// =========================================================================

/**
 * Check if an open position should be exited at bar index `i`.
 * Returns { exit: true, reason: '...', price: number } or null.
 */
function checkExitConditions(position, candles, indicators, i, strategy) {
  const high = candles[i].high;
  const low = candles[i].low;
  const close = candles[i].close;

  // Time-based exit for scalp strategies
  const barsHeld = i - position.entryBar;
  const maxBars = {
    micro_vwap_scalp: 5,
    momentum_spike_scalp: 3,
    order_book_imbalance: 2,
  };
  if (maxBars[strategy] && barsHeld >= maxBars[strategy]) {
    return {
      exit: true,
      reason: `Time stop: ${barsHeld} bars (max ${maxBars[strategy]})`,
      price: close,
      closeQty: position.remainingQty,
    };
  }

  // Stop-loss hit (checked against low of bar for longs)
  if (position.direction === 'long' && low <= position.stopLoss) {
    return {
      exit: true,
      reason: 'Stop-loss hit',
      price: position.stopLoss,
      closeQty: position.remainingQty,
    };
  }

  // TP1: close 50% at 1.5R
  if (!position.tp1Hit && position.direction === 'long' && high >= position.tp1Price) {
    const closeQty = position.remainingQty * 0.5;
    return {
      exit: true,
      reason: 'TP1 hit (1.5R)',
      price: position.tp1Price,
      closeQty,
      partial: true,
      tp1: true,
    };
  }

  // TP2: close remainder at 3R
  if (position.tp1Hit && position.direction === 'long' && high >= position.tp2Price) {
    return {
      exit: true,
      reason: 'TP2 hit (3R)',
      price: position.tp2Price,
      closeQty: position.remainingQty,
    };
  }

  // Trailing stop (active after TP1)
  if (position.tp1Hit && position.trailingStop != null) {
    // Update trailing stop
    const newTrailing = close - position.trailingStopDistance;
    if (newTrailing > position.trailingStop) {
      position.trailingStop = newTrailing;
    }
    if (low <= position.trailingStop) {
      return {
        exit: true,
        reason: 'Trailing stop hit',
        price: position.trailingStop,
        closeQty: position.remainingQty,
      };
    }
  }

  return null;
}

// =========================================================================
//  Backtest Engine
// =========================================================================

function runBacktest(candles, strategy, startingCapital, riskSettings) {
  const {
    stopLossMethod = 'percentage',
    stopLossPct = 2,
    positionSizePct = 5,
    tp1R = 1.5,
    tp2R = 3,
    trailingStopATR = 1,
    maxPositions = 3,
  } = riskSettings || {};

  // Pre-compute indicators
  const indicators = precomputeIndicators(candles);

  let capital = startingCapital;
  let peakCapital = startingCapital;
  let maxDrawdown = 0;
  const trades = [];
  const equityCurve = [];
  let openPositions = [];
  let totalWins = 0;
  let totalLosses = 0;
  let totalWinAmount = 0;
  let totalLossAmount = 0;
  let totalDurations = 0;

  // Start processing from bar 200 (need enough data for SMA200)
  const startBar = Math.min(200, candles.length - 1);

  for (let i = startBar; i < candles.length; i++) {
    // Send progress every 100 bars
    if ((i - startBar) % 100 === 0) {
      self.postMessage({
        type: 'PROGRESS',
        payload: {
          percent: Math.round(((i - startBar) / (candles.length - startBar)) * 100),
          currentDate: candles[i].timestamp,
        },
      });
    }

    // Check exits on open positions
    const closedIndices = [];
    for (let p = 0; p < openPositions.length; p++) {
      const pos = openPositions[p];
      const exitCheck = checkExitConditions(pos, candles, indicators, i, strategy);

      if (exitCheck && exitCheck.exit) {
        const pnl = (exitCheck.price - pos.entryPrice) * exitCheck.closeQty;
        capital += exitCheck.closeQty * exitCheck.price;

        if (exitCheck.partial && exitCheck.tp1) {
          // Partial close: TP1 hit
          pos.tp1Hit = true;
          pos.remainingQty -= exitCheck.closeQty;

          // Activate trailing stop
          const atrVal = indicators.atr[i];
          pos.trailingStopDistance = atrVal != null ? atrVal * trailingStopATR : pos.entryPrice * (stopLossPct / 100);
          pos.trailingStop = candles[i].close - pos.trailingStopDistance;

          // Move stop-loss to break-even
          pos.stopLoss = pos.entryPrice;

          trades.push({
            entryBar: pos.entryBar,
            exitBar: i,
            entryPrice: pos.entryPrice,
            exitPrice: exitCheck.price,
            qty: exitCheck.closeQty,
            pnl,
            reason: exitCheck.reason,
            strategy,
            entryTime: candles[pos.entryBar].timestamp,
            exitTime: candles[i].timestamp,
            duration: i - pos.entryBar,
          });

          if (pnl >= 0) { totalWins++; totalWinAmount += pnl; }
          else { totalLosses++; totalLossAmount += Math.abs(pnl); }
          totalDurations += i - pos.entryBar;
        } else {
          // Full close
          trades.push({
            entryBar: pos.entryBar,
            exitBar: i,
            entryPrice: pos.entryPrice,
            exitPrice: exitCheck.price,
            qty: exitCheck.closeQty,
            pnl,
            reason: exitCheck.reason,
            strategy,
            entryTime: candles[pos.entryBar].timestamp,
            exitTime: candles[i].timestamp,
            duration: i - pos.entryBar,
          });

          if (pnl >= 0) { totalWins++; totalWinAmount += pnl; }
          else { totalLosses++; totalLossAmount += Math.abs(pnl); }
          totalDurations += i - pos.entryBar;

          closedIndices.push(p);
        }
      }
    }

    // Remove fully closed positions (iterate in reverse to preserve indices)
    for (let ci = closedIndices.length - 1; ci >= 0; ci--) {
      openPositions.splice(closedIndices[ci], 1);
    }

    // Check entry signals
    if (openPositions.length < maxPositions) {
      const signal = checkEntrySignal(strategy, candles, indicators, i);

      if (signal && signal.entry) {
        const close = candles[i].close;
        const atrVal = indicators.atr[i];

        // Calculate stop-loss
        let stopLossPrice;
        if (stopLossMethod === 'atr' && atrVal != null) {
          stopLossPrice = close - atrVal * 2;
        } else {
          stopLossPrice = close * (1 - stopLossPct / 100);
        }

        const riskPerShare = close - stopLossPrice;
        if (riskPerShare <= 0) continue;

        // Position sizing
        const positionValue = capital * (positionSizePct / 100);
        const qty = positionValue / close;
        if (qty <= 0 || positionValue > capital) continue;

        // Deduct capital
        capital -= positionValue;

        // Calculate TP levels
        const tp1Price = close + riskPerShare * tp1R;
        const tp2Price = close + riskPerShare * tp2R;

        openPositions.push({
          entryBar: i,
          entryPrice: close,
          qty,
          remainingQty: qty,
          direction: signal.direction,
          stopLoss: stopLossPrice,
          tp1Price,
          tp2Price,
          tp1Hit: false,
          trailingStop: null,
          trailingStopDistance: null,
          reason: signal.reason,
        });
      }
    }

    // Calculate current equity
    let openPnL = 0;
    for (const pos of openPositions) {
      openPnL += (candles[i].close - pos.entryPrice) * pos.remainingQty;
    }
    const openPositionValue = openPositions.reduce((sum, pos) => sum + pos.remainingQty * candles[i].close, 0);
    const equity = capital + openPositionValue;

    equityCurve.push({
      timestamp: candles[i].timestamp,
      equity,
      drawdown: peakCapital > 0 ? ((peakCapital - equity) / peakCapital) * 100 : 0,
    });

    if (equity > peakCapital) peakCapital = equity;
    const currentDrawdown = ((peakCapital - equity) / peakCapital) * 100;
    if (currentDrawdown > maxDrawdown) maxDrawdown = currentDrawdown;
  }

  // Force close any remaining open positions at last bar price
  const lastClose = candles[candles.length - 1].close;
  for (const pos of openPositions) {
    const pnl = (lastClose - pos.entryPrice) * pos.remainingQty;
    capital += pos.remainingQty * lastClose;
    trades.push({
      entryBar: pos.entryBar,
      exitBar: candles.length - 1,
      entryPrice: pos.entryPrice,
      exitPrice: lastClose,
      qty: pos.remainingQty,
      pnl,
      reason: 'End of backtest - forced close',
      strategy,
      entryTime: candles[pos.entryBar].timestamp,
      exitTime: candles[candles.length - 1].timestamp,
      duration: candles.length - 1 - pos.entryBar,
    });
    if (pnl >= 0) { totalWins++; totalWinAmount += pnl; }
    else { totalLosses++; totalLossAmount += Math.abs(pnl); }
    totalDurations += candles.length - 1 - pos.entryBar;
  }

  // Calculate stats
  const totalTrades = totalWins + totalLosses;
  const totalReturn = ((capital - startingCapital) / startingCapital) * 100;
  const winRate = totalTrades > 0 ? (totalWins / totalTrades) * 100 : 0;
  const profitFactor = totalLossAmount > 0 ? totalWinAmount / totalLossAmount : totalWinAmount > 0 ? Infinity : 0;
  const avgWinner = totalWins > 0 ? totalWinAmount / totalWins : 0;
  const avgLoser = totalLosses > 0 ? totalLossAmount / totalLosses : 0;
  const avgDuration = totalTrades > 0 ? totalDurations / totalTrades : 0;

  // Sharpe ratio (annualized, assuming ~252 trading days)
  let sharpeRatio = 0;
  if (equityCurve.length > 1) {
    const returns = [];
    for (let i = 1; i < equityCurve.length; i++) {
      const r = (equityCurve[i].equity - equityCurve[i - 1].equity) / equityCurve[i - 1].equity;
      returns.push(r);
    }
    const avgReturn = returns.reduce((s, r) => s + r, 0) / returns.length;
    const variance = returns.reduce((s, r) => s + (r - avgReturn) ** 2, 0) / returns.length;
    const stdDev = Math.sqrt(variance);
    if (stdDev > 0) {
      sharpeRatio = (avgReturn / stdDev) * Math.sqrt(252);
    }
  }

  return {
    equityCurve,
    stats: {
      totalReturn: parseFloat(totalReturn.toFixed(2)),
      maxDrawdown: parseFloat(maxDrawdown.toFixed(2)),
      winRate: parseFloat(winRate.toFixed(1)),
      profitFactor: profitFactor === Infinity ? 999 : parseFloat(profitFactor.toFixed(2)),
      sharpeRatio: parseFloat(sharpeRatio.toFixed(2)),
      avgWinner: parseFloat(avgWinner.toFixed(2)),
      avgLoser: parseFloat(avgLoser.toFixed(2)),
      totalTrades,
      avgDuration: Math.round(avgDuration),
      startingCapital,
      endingCapital: parseFloat(capital.toFixed(2)),
    },
    trades,
  };
}

// =========================================================================
//  Message Handler
// =========================================================================

self.onmessage = function (event) {
  const { type, payload } = event.data;

  try {
    switch (type) {
      case 'RUN_BACKTEST': {
        const { candles, strategy, startingCapital, riskSettings } = payload;

        if (!candles || candles.length === 0) {
          self.postMessage({
            type: 'ERROR',
            payload: { message: 'No candle data provided for backtest' },
          });
          return;
        }

        const result = runBacktest(candles, strategy, startingCapital || 25000, riskSettings || {});

        // Final progress
        self.postMessage({
          type: 'PROGRESS',
          payload: { percent: 100, currentDate: candles[candles.length - 1].timestamp },
        });

        self.postMessage({
          type: 'BACKTEST_RESULT',
          payload: result,
        });
        break;
      }

      default:
        self.postMessage({
          type: 'ERROR',
          payload: { message: `Unknown message type: ${type}` },
        });
    }
  } catch (error) {
    self.postMessage({
      type: 'ERROR',
      payload: { message: error.message || 'Unknown backtest worker error' },
    });
  }
};
