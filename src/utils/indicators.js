/* ============================================================
   Cerebro Crypto — Technical Indicator Calculations
   ============================================================
   Pure functions — safe to run in the main thread or inside a
   Web Worker.  All expect an array of candle objects:
     { open, high, low, close, volume, timestamp }
   ============================================================ */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract the `close` values from candle objects. */
const closes = (data) => data.map((c) => c.close);

// ---------------------------------------------------------------------------
// Simple Moving Average
// ---------------------------------------------------------------------------

/**
 * @param {Array} data  - candle array
 * @param {number} period
 * @returns {Array<number|null>}
 */
export function calcSMA(data, period) {
  const src = closes(data);
  const result = new Array(src.length).fill(null);

  if (src.length < period) return result;

  let sum = 0;
  for (let i = 0; i < period; i++) sum += src[i];
  result[period - 1] = sum / period;

  for (let i = period; i < src.length; i++) {
    sum += src[i] - src[i - period];
    result[i] = sum / period;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Exponential Moving Average
// ---------------------------------------------------------------------------

/**
 * @param {Array} data  - candle array
 * @param {number} period
 * @returns {Array<number|null>}
 */
export function calcEMA(data, period) {
  const src = closes(data);
  const result = new Array(src.length).fill(null);

  if (src.length < period) return result;

  // Seed with SMA
  let sum = 0;
  for (let i = 0; i < period; i++) sum += src[i];
  const seed = sum / period;
  result[period - 1] = seed;

  const k = 2 / (period + 1);

  for (let i = period; i < src.length; i++) {
    result[i] = src[i] * k + result[i - 1] * (1 - k);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Relative Strength Index
// ---------------------------------------------------------------------------

/**
 * @param {Array} data
 * @param {number} period - default 14
 * @returns {Array<number|null>}
 */
export function calcRSI(data, period = 14) {
  const src = closes(data);
  const result = new Array(src.length).fill(null);

  if (src.length < period + 1) return result;

  let avgGain = 0;
  let avgLoss = 0;

  // Initial average gain/loss over first `period` changes
  for (let i = 1; i <= period; i++) {
    const change = src[i] - src[i - 1];
    if (change > 0) avgGain += change;
    else avgLoss += Math.abs(change);
  }

  avgGain /= period;
  avgLoss /= period;

  result[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  // Smoothed
  for (let i = period + 1; i < src.length; i++) {
    const change = src[i] - src[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    result[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }

  return result;
}

// ---------------------------------------------------------------------------
// MACD
// ---------------------------------------------------------------------------

/**
 * @param {Array} data
 * @param {number} fast   - default 12
 * @param {number} slow   - default 26
 * @param {number} sig    - default 9
 * @returns {{ macd: Array, signal: Array, histogram: Array }}
 */
export function calcMACD(data, fast = 12, slow = 26, sig = 9) {
  const emaFast = calcEMA(data, fast);
  const emaSlow = calcEMA(data, slow);
  const len = data.length;

  const macdLine = new Array(len).fill(null);
  for (let i = 0; i < len; i++) {
    if (emaFast[i] !== null && emaSlow[i] !== null) {
      macdLine[i] = emaFast[i] - emaSlow[i];
    }
  }

  // Signal line = EMA of MACD values
  // Build a pseudo-candle array for calcEMA
  const macdCandles = macdLine.map((v) => ({ close: v ?? 0 }));
  const firstValid = macdLine.findIndex((v) => v !== null);

  const signalLine = new Array(len).fill(null);
  if (firstValid >= 0) {
    const subset = macdCandles.slice(firstValid);
    const sigEMA = calcEMA(subset, sig);
    for (let i = 0; i < sigEMA.length; i++) {
      signalLine[firstValid + i] = sigEMA[i];
    }
  }

  const histogram = new Array(len).fill(null);
  for (let i = 0; i < len; i++) {
    if (macdLine[i] !== null && signalLine[i] !== null) {
      histogram[i] = macdLine[i] - signalLine[i];
    }
  }

  return { macd: macdLine, signal: signalLine, histogram };
}

// ---------------------------------------------------------------------------
// Bollinger Bands
// ---------------------------------------------------------------------------

/**
 * @param {Array} data
 * @param {number} period  - default 20
 * @param {number} stdDev  - default 2
 * @returns {{ upper: Array, middle: Array, lower: Array }}
 */
export function calcBollingerBands(data, period = 20, stdDev = 2) {
  const src = closes(data);
  const len = src.length;
  const upper = new Array(len).fill(null);
  const middle = new Array(len).fill(null);
  const lower = new Array(len).fill(null);

  if (len < period) return { upper, middle, lower };

  for (let i = period - 1; i < len; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += src[j];
    const mean = sum / period;

    let sqSum = 0;
    for (let j = i - period + 1; j <= i; j++) sqSum += (src[j] - mean) ** 2;
    const sd = Math.sqrt(sqSum / period);

    middle[i] = mean;
    upper[i] = mean + stdDev * sd;
    lower[i] = mean - stdDev * sd;
  }

  return { upper, middle, lower };
}

// ---------------------------------------------------------------------------
// Average True Range
// ---------------------------------------------------------------------------

/**
 * @param {Array} data
 * @param {number} period - default 14
 * @returns {Array<number|null>}
 */
export function calcATR(data, period = 14) {
  const len = data.length;
  const result = new Array(len).fill(null);

  if (len < period + 1) return result;

  // True Range for each bar (index 1 onward)
  const tr = new Array(len).fill(0);
  for (let i = 1; i < len; i++) {
    const high = data[i].high;
    const low = data[i].low;
    const prevClose = data[i - 1].close;
    tr[i] = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
  }

  // Initial ATR = average of first `period` TR values (starting from index 1)
  let sum = 0;
  for (let i = 1; i <= period; i++) sum += tr[i];
  result[period] = sum / period;

  // Smoothed (Wilder's method)
  for (let i = period + 1; i < len; i++) {
    result[i] = (result[i - 1] * (period - 1) + tr[i]) / period;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Average Directional Index (ADX)
// ---------------------------------------------------------------------------

/**
 * @param {Array} data
 * @param {number} period - default 14
 * @returns {Array<number|null>}
 */
export function calcADX(data, period = 14) {
  const len = data.length;
  const result = new Array(len).fill(null);

  if (len < period * 2 + 1) return result;

  // +DM, -DM, TR arrays
  const plusDM = new Array(len).fill(0);
  const minusDM = new Array(len).fill(0);
  const tr = new Array(len).fill(0);

  for (let i = 1; i < len; i++) {
    const upMove = data[i].high - data[i - 1].high;
    const downMove = data[i - 1].low - data[i].low;

    plusDM[i] = upMove > downMove && upMove > 0 ? upMove : 0;
    minusDM[i] = downMove > upMove && downMove > 0 ? downMove : 0;

    tr[i] = Math.max(
      data[i].high - data[i].low,
      Math.abs(data[i].high - data[i - 1].close),
      Math.abs(data[i].low - data[i - 1].close)
    );
  }

  // Smooth +DM, -DM, TR using Wilder's method
  let smoothPlusDM = 0;
  let smoothMinusDM = 0;
  let smoothTR = 0;

  for (let i = 1; i <= period; i++) {
    smoothPlusDM += plusDM[i];
    smoothMinusDM += minusDM[i];
    smoothTR += tr[i];
  }

  const dx = new Array(len).fill(null);

  // First DI values at index=period
  let plusDI = smoothTR > 0 ? (smoothPlusDM / smoothTR) * 100 : 0;
  let minusDI = smoothTR > 0 ? (smoothMinusDM / smoothTR) * 100 : 0;
  let diSum = plusDI + minusDI;
  dx[period] = diSum > 0 ? (Math.abs(plusDI - minusDI) / diSum) * 100 : 0;

  for (let i = period + 1; i < len; i++) {
    smoothPlusDM = smoothPlusDM - smoothPlusDM / period + plusDM[i];
    smoothMinusDM = smoothMinusDM - smoothMinusDM / period + minusDM[i];
    smoothTR = smoothTR - smoothTR / period + tr[i];

    plusDI = smoothTR > 0 ? (smoothPlusDM / smoothTR) * 100 : 0;
    minusDI = smoothTR > 0 ? (smoothMinusDM / smoothTR) * 100 : 0;
    diSum = plusDI + minusDI;
    dx[i] = diSum > 0 ? (Math.abs(plusDI - minusDI) / diSum) * 100 : 0;
  }

  // ADX = smoothed average of DX
  let adxSum = 0;
  const firstADX = period * 2;
  for (let i = period; i < firstADX; i++) {
    adxSum += dx[i] ?? 0;
  }
  if (firstADX < len) {
    result[firstADX] = adxSum / period;
  }

  for (let i = firstADX + 1; i < len; i++) {
    result[i] = (result[i - 1] * (period - 1) + (dx[i] ?? 0)) / period;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Volume Weighted Average Price (daily reset)
// ---------------------------------------------------------------------------

/**
 * @param {Array} data
 * @returns {Array<number|null>}
 */
export function calcVWAP(data) {
  const len = data.length;
  const result = new Array(len).fill(null);

  if (len === 0) return result;

  let cumVolume = 0;
  let cumTPV = 0; // cumulative (typical price * volume)
  let currentDay = null;

  for (let i = 0; i < len; i++) {
    const { high, low, close, volume, timestamp } = data[i];
    if (volume == null || volume === 0) {
      result[i] = i > 0 ? result[i - 1] : null;
      continue;
    }

    // Detect day boundary to reset accumulators
    const day = new Date(timestamp < 1e12 ? timestamp * 1000 : timestamp).toDateString();
    if (day !== currentDay) {
      cumVolume = 0;
      cumTPV = 0;
      currentDay = day;
    }

    const tp = (high + low + close) / 3;
    cumTPV += tp * volume;
    cumVolume += volume;

    result[i] = cumVolume > 0 ? cumTPV / cumVolume : null;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Support & Resistance detection (pivot-based)
// ---------------------------------------------------------------------------

/**
 * Identify support and resistance levels from recent price action.
 *
 * @param {Array} data
 * @param {number} lookback - how many bars to scan (default 50)
 * @returns {{ support: number[], resistance: number[] }}
 */
export function findSupportResistance(data, lookback = 50) {
  const support = [];
  const resistance = [];

  if (!data || data.length < 5) return { support, resistance };

  const slice = data.slice(-lookback);
  const len = slice.length;

  // Use a 2-bar pivot detection (local min/max)
  const pivotWindow = 2;

  for (let i = pivotWindow; i < len - pivotWindow; i++) {
    let isHigh = true;
    let isLow = true;

    for (let j = 1; j <= pivotWindow; j++) {
      if (slice[i].high <= slice[i - j].high || slice[i].high <= slice[i + j].high) {
        isHigh = false;
      }
      if (slice[i].low >= slice[i - j].low || slice[i].low >= slice[i + j].low) {
        isLow = false;
      }
    }

    if (isHigh) resistance.push(slice[i].high);
    if (isLow) support.push(slice[i].low);
  }

  // Cluster nearby levels (within 0.5% of each other) and average them
  const cluster = (levels) => {
    if (levels.length === 0) return [];
    const sorted = [...levels].sort((a, b) => a - b);
    const clusters = [[sorted[0]]];

    for (let i = 1; i < sorted.length; i++) {
      const lastCluster = clusters[clusters.length - 1];
      const clusterAvg = lastCluster.reduce((s, v) => s + v, 0) / lastCluster.length;
      if (Math.abs(sorted[i] - clusterAvg) / clusterAvg < 0.005) {
        lastCluster.push(sorted[i]);
      } else {
        clusters.push([sorted[i]]);
      }
    }

    return clusters.map((c) => c.reduce((s, v) => s + v, 0) / c.length);
  };

  return {
    support: cluster(support),
    resistance: cluster(resistance),
  };
}

// ---------------------------------------------------------------------------
// Hull Moving Average (HMA)
// ---------------------------------------------------------------------------

/**
 * @param {Array} data - candle array
 * @param {number} period - default 9
 * @returns {Array<number|null>}
 */
export function calcHMA(data, period = 9) {
  const src = closes(data);
  const len = src.length;
  const result = new Array(len).fill(null);

  if (len < period) return result;

  const halfPeriod = Math.floor(period / 2);
  const sqrtPeriod = Math.floor(Math.sqrt(period));

  // WMA helper
  const wma = (arr, p) => {
    const out = new Array(arr.length).fill(null);
    if (arr.length < p) return out;
    for (let i = p - 1; i < arr.length; i++) {
      let sum = 0, wSum = 0;
      for (let j = 0; j < p; j++) {
        const w = p - j;
        sum += arr[i - j] * w;
        wSum += w;
      }
      out[i] = sum / wSum;
    }
    return out;
  };

  const wmaHalf = wma(src, halfPeriod);
  const wmaFull = wma(src, period);

  // 2*WMA(half) - WMA(full)
  const diff = new Array(len).fill(null);
  for (let i = 0; i < len; i++) {
    if (wmaHalf[i] != null && wmaFull[i] != null) {
      diff[i] = 2 * wmaHalf[i] - wmaFull[i];
    }
  }

  // WMA of diff with sqrt(period)
  const firstValid = diff.findIndex((v) => v !== null);
  if (firstValid < 0) return result;

  const diffValues = diff.slice(firstValid).map((v) => v ?? 0);
  const hmaRaw = wma(diffValues, sqrtPeriod);
  for (let i = 0; i < hmaRaw.length; i++) {
    if (hmaRaw[i] != null) {
      result[firstValid + i] = hmaRaw[i];
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Triple Exponential Moving Average (TEMA)
// ---------------------------------------------------------------------------

/**
 * @param {Array} data - candle array
 * @param {number} period - default 9
 * @returns {Array<number|null>}
 */
export function calcTEMA(data, period = 9) {
  const ema1 = calcEMA(data, period);

  // Build pseudo candles from ema1 for second EMA pass
  const ema1Candles = ema1.map((v) => ({ close: v ?? 0 }));
  const ema2 = calcEMA(ema1Candles, period);
  const ema2Candles = ema2.map((v) => ({ close: v ?? 0 }));
  const ema3 = calcEMA(ema2Candles, period);

  const len = data.length;
  const result = new Array(len).fill(null);
  for (let i = 0; i < len; i++) {
    if (ema1[i] != null && ema2[i] != null && ema3[i] != null) {
      result[i] = 3 * ema1[i] - 3 * ema2[i] + ema3[i];
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Ichimoku Cloud
// ---------------------------------------------------------------------------

/**
 * @param {Array} data - candle array
 * @param {number} tenkan - default 9
 * @param {number} kijun - default 26
 * @param {number} senkouB - default 52
 * @returns {{ tenkanSen, kijunSen, senkouA, senkouB, chikou }}
 */
export function calcIchimoku(data, tenkan = 9, kijun = 26, senkouBPeriod = 52) {
  const len = data.length;
  const tenkanSen = new Array(len).fill(null);
  const kijunSen = new Array(len).fill(null);
  const senkouA = new Array(len).fill(null);
  const senkouB = new Array(len).fill(null);
  const chikou = new Array(len).fill(null);

  const midpoint = (arr, end, period) => {
    if (end < period - 1) return null;
    let high = -Infinity, low = Infinity;
    for (let j = end - period + 1; j <= end; j++) {
      if (arr[j].high > high) high = arr[j].high;
      if (arr[j].low < low) low = arr[j].low;
    }
    return (high + low) / 2;
  };

  for (let i = 0; i < len; i++) {
    tenkanSen[i] = midpoint(data, i, tenkan);
    kijunSen[i] = midpoint(data, i, kijun);

    // Senkou A = (Tenkan + Kijun) / 2, shifted forward 26 periods
    if (tenkanSen[i] != null && kijunSen[i] != null) {
      const futureIdx = i + kijun;
      if (futureIdx < len) {
        senkouA[futureIdx] = (tenkanSen[i] + kijunSen[i]) / 2;
      }
    }

    // Senkou B = midpoint of senkouBPeriod, shifted forward 26 periods
    const sbVal = midpoint(data, i, senkouBPeriod);
    if (sbVal != null) {
      const futureIdx = i + kijun;
      if (futureIdx < len) {
        senkouB[futureIdx] = sbVal;
      }
    }

    // Chikou = close shifted back 26 periods
    if (i >= kijun) {
      chikou[i - kijun] = data[i].close;
    }
  }

  return { tenkanSen, kijunSen, senkouA, senkouB, chikou };
}

// ---------------------------------------------------------------------------
// Parabolic SAR
// ---------------------------------------------------------------------------

/**
 * @param {Array} data - candle array
 * @param {number} step - AF increment, default 0.02
 * @param {number} max - max AF, default 0.2
 * @returns {Array<{ value: number, trend: 'up'|'down' }|null>}
 */
export function calcParabolicSAR(data, step = 0.02, max = 0.2) {
  const len = data.length;
  if (len < 2) return new Array(len).fill(null);

  const result = new Array(len).fill(null);
  let isUpTrend = data[1].close > data[0].close;
  let af = step;
  let ep = isUpTrend ? data[0].high : data[0].low;
  let sar = isUpTrend ? data[0].low : data[0].high;

  result[0] = { value: sar, trend: isUpTrend ? 'up' : 'down' };

  for (let i = 1; i < len; i++) {
    const prevSar = sar;

    if (isUpTrend) {
      sar = prevSar + af * (ep - prevSar);
      sar = Math.min(sar, data[i - 1].low, i > 1 ? data[i - 2].low : data[i - 1].low);

      if (data[i].low < sar) {
        isUpTrend = false;
        sar = ep;
        ep = data[i].low;
        af = step;
      } else {
        if (data[i].high > ep) {
          ep = data[i].high;
          af = Math.min(af + step, max);
        }
      }
    } else {
      sar = prevSar + af * (ep - prevSar);
      sar = Math.max(sar, data[i - 1].high, i > 1 ? data[i - 2].high : data[i - 1].high);

      if (data[i].high > sar) {
        isUpTrend = true;
        sar = ep;
        ep = data[i].high;
        af = step;
      } else {
        if (data[i].low < ep) {
          ep = data[i].low;
          af = Math.min(af + step, max);
        }
      }
    }

    result[i] = { value: sar, trend: isUpTrend ? 'up' : 'down' };
  }

  return result;
}

// ---------------------------------------------------------------------------
// Supertrend
// ---------------------------------------------------------------------------

/**
 * @param {Array} data - candle array
 * @param {number} period - ATR period, default 10
 * @param {number} multiplier - default 3
 * @returns {Array<{ value: number, trend: 'up'|'down' }|null>}
 */
export function calcSupertrend(data, period = 10, multiplier = 3) {
  const len = data.length;
  const atr = calcATR(data, period);
  const result = new Array(len).fill(null);

  if (len < period + 1) return result;

  let prevUpperBand = 0, prevLowerBand = 0, prevSupertrend = 0;
  let prevTrend = 1; // 1 = up, -1 = down

  for (let i = period; i < len; i++) {
    const hl2 = (data[i].high + data[i].low) / 2;
    const atrVal = atr[i] || 0;

    let upperBand = hl2 + multiplier * atrVal;
    let lowerBand = hl2 - multiplier * atrVal;

    // Adjust bands
    if (i > period) {
      upperBand = upperBand < prevUpperBand || data[i - 1].close > prevUpperBand ? upperBand : prevUpperBand;
      lowerBand = lowerBand > prevLowerBand || data[i - 1].close < prevLowerBand ? lowerBand : prevLowerBand;
    }

    let trend;
    if (i === period) {
      trend = data[i].close > upperBand ? 1 : -1;
    } else {
      if (prevTrend === 1) {
        trend = data[i].close < lowerBand ? -1 : 1;
      } else {
        trend = data[i].close > upperBand ? 1 : -1;
      }
    }

    const stValue = trend === 1 ? lowerBand : upperBand;
    result[i] = { value: stValue, trend: trend === 1 ? 'up' : 'down' };

    prevUpperBand = upperBand;
    prevLowerBand = lowerBand;
    prevSupertrend = stValue;
    prevTrend = trend;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Keltner Channels
// ---------------------------------------------------------------------------

/**
 * @param {Array} data - candle array
 * @param {number} period - EMA period, default 20
 * @param {number} multiplier - ATR multiplier, default 1.5
 * @returns {{ upper: Array, middle: Array, lower: Array }}
 */
export function calcKeltnerChannels(data, period = 20, multiplier = 1.5) {
  const middle = calcEMA(data, period);
  const atr = calcATR(data, period);
  const len = data.length;
  const upper = new Array(len).fill(null);
  const lower = new Array(len).fill(null);

  for (let i = 0; i < len; i++) {
    if (middle[i] != null && atr[i] != null) {
      upper[i] = middle[i] + multiplier * atr[i];
      lower[i] = middle[i] - multiplier * atr[i];
    }
  }

  return { upper, middle, lower };
}

// ---------------------------------------------------------------------------
// Pivot Points (Standard)
// ---------------------------------------------------------------------------

/**
 * @param {Array} data - candle array (expects daily or higher TF for proper pivots)
 * @returns {{ pp, r1, r2, r3, s1, s2, s3 }}
 */
export function calcPivotPoints(data) {
  const len = data.length;
  const pp = new Array(len).fill(null);
  const r1 = new Array(len).fill(null);
  const r2 = new Array(len).fill(null);
  const r3 = new Array(len).fill(null);
  const s1 = new Array(len).fill(null);
  const s2 = new Array(len).fill(null);
  const s3 = new Array(len).fill(null);

  for (let i = 1; i < len; i++) {
    const prev = data[i - 1];
    const pivot = (prev.high + prev.low + prev.close) / 3;
    pp[i] = pivot;
    r1[i] = 2 * pivot - prev.low;
    s1[i] = 2 * pivot - prev.high;
    r2[i] = pivot + (prev.high - prev.low);
    s2[i] = pivot - (prev.high - prev.low);
    r3[i] = prev.high + 2 * (pivot - prev.low);
    s3[i] = prev.low - 2 * (prev.high - pivot);
  }

  return { pp, r1, r2, r3, s1, s2, s3 };
}

// ---------------------------------------------------------------------------
// Anchored VWAP
// ---------------------------------------------------------------------------

/**
 * @param {Array} data - candle array
 * @param {number} anchorIndex - bar index to anchor from (0-based)
 * @returns {Array<number|null>}
 */
export function calcAnchoredVWAP(data, anchorIndex = 0) {
  const len = data.length;
  const result = new Array(len).fill(null);
  if (anchorIndex < 0 || anchorIndex >= len) return result;

  let cumVolume = 0;
  let cumTPV = 0;

  for (let i = anchorIndex; i < len; i++) {
    const { high, low, close, volume } = data[i];
    if (!volume || volume === 0) {
      result[i] = i > anchorIndex ? result[i - 1] : null;
      continue;
    }
    const tp = (high + low + close) / 3;
    cumTPV += tp * volume;
    cumVolume += volume;
    result[i] = cumVolume > 0 ? cumTPV / cumVolume : null;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Stochastic RSI
// ---------------------------------------------------------------------------

/**
 * @param {Array} data - candle array
 * @param {number} rsiPeriod - default 14
 * @param {number} stochPeriod - default 14
 * @param {number} kPeriod - smoothing for %K, default 3
 * @param {number} dPeriod - smoothing for %D, default 3
 * @returns {{ k: Array<number|null>, d: Array<number|null> }}
 */
export function calcStochRSI(data, rsiPeriod = 14, stochPeriod = 14, kPeriod = 3, dPeriod = 3) {
  const rsi = calcRSI(data, rsiPeriod);
  const len = data.length;
  const stochRaw = new Array(len).fill(null);

  for (let i = stochPeriod - 1; i < len; i++) {
    let minRsi = Infinity, maxRsi = -Infinity;
    let valid = true;
    for (let j = i - stochPeriod + 1; j <= i; j++) {
      if (rsi[j] == null) { valid = false; break; }
      if (rsi[j] < minRsi) minRsi = rsi[j];
      if (rsi[j] > maxRsi) maxRsi = rsi[j];
    }
    if (!valid) continue;
    const range = maxRsi - minRsi;
    stochRaw[i] = range === 0 ? 50 : ((rsi[i] - minRsi) / range) * 100;
  }

  // Smooth %K with SMA
  const k = new Array(len).fill(null);
  for (let i = 0; i < len; i++) {
    if (i < kPeriod - 1) continue;
    let sum = 0, count = 0;
    for (let j = i - kPeriod + 1; j <= i; j++) {
      if (stochRaw[j] != null) { sum += stochRaw[j]; count++; }
    }
    if (count === kPeriod) k[i] = sum / count;
  }

  // Smooth %D with SMA of %K
  const d = new Array(len).fill(null);
  for (let i = 0; i < len; i++) {
    if (i < dPeriod - 1) continue;
    let sum = 0, count = 0;
    for (let j = i - dPeriod + 1; j <= i; j++) {
      if (k[j] != null) { sum += k[j]; count++; }
    }
    if (count === dPeriod) d[i] = sum / count;
  }

  return { k, d };
}

// ---------------------------------------------------------------------------
// Williams %R
// ---------------------------------------------------------------------------

/**
 * @param {Array} data - candle array
 * @param {number} period - default 14
 * @returns {Array<number|null>}
 */
export function calcWilliamsR(data, period = 14) {
  const len = data.length;
  const result = new Array(len).fill(null);

  for (let i = period - 1; i < len; i++) {
    let highestHigh = -Infinity, lowestLow = Infinity;
    for (let j = i - period + 1; j <= i; j++) {
      if (data[j].high > highestHigh) highestHigh = data[j].high;
      if (data[j].low < lowestLow) lowestLow = data[j].low;
    }
    const range = highestHigh - lowestLow;
    result[i] = range === 0 ? -50 : ((highestHigh - data[i].close) / range) * -100;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Commodity Channel Index (CCI)
// ---------------------------------------------------------------------------

/**
 * @param {Array} data - candle array
 * @param {number} period - default 20
 * @returns {Array<number|null>}
 */
export function calcCCI(data, period = 20) {
  const len = data.length;
  const result = new Array(len).fill(null);

  for (let i = period - 1; i < len; i++) {
    let sum = 0;
    const tps = [];
    for (let j = i - period + 1; j <= i; j++) {
      const tp = (data[j].high + data[j].low + data[j].close) / 3;
      tps.push(tp);
      sum += tp;
    }
    const mean = sum / period;

    let meanDev = 0;
    for (const tp of tps) {
      meanDev += Math.abs(tp - mean);
    }
    meanDev /= period;

    result[i] = meanDev === 0 ? 0 : (tps[tps.length - 1] - mean) / (0.015 * meanDev);
  }

  return result;
}

// ---------------------------------------------------------------------------
// On Balance Volume (OBV)
// ---------------------------------------------------------------------------

/**
 * @param {Array} data - candle array
 * @returns {Array<number>}
 */
export function calcOBV(data) {
  const len = data.length;
  if (len === 0) return [];
  const result = [0];

  for (let i = 1; i < len; i++) {
    if (data[i].close > data[i - 1].close) {
      result.push(result[i - 1] + data[i].volume);
    } else if (data[i].close < data[i - 1].close) {
      result.push(result[i - 1] - data[i].volume);
    } else {
      result.push(result[i - 1]);
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Money Flow Index (MFI)
// ---------------------------------------------------------------------------

/**
 * @param {Array} data - candle array
 * @param {number} period - default 14
 * @returns {Array<number|null>}
 */
export function calcMFI(data, period = 14) {
  const len = data.length;
  const result = new Array(len).fill(null);

  if (len < period + 1) return result;

  const typicalPrices = data.map((c) => (c.high + c.low + c.close) / 3);
  const rawMoneyFlow = typicalPrices.map((tp, i) => tp * data[i].volume);

  for (let i = period; i < len; i++) {
    let posFlow = 0, negFlow = 0;
    for (let j = i - period + 1; j <= i; j++) {
      if (typicalPrices[j] > typicalPrices[j - 1]) {
        posFlow += rawMoneyFlow[j];
      } else {
        negFlow += rawMoneyFlow[j];
      }
    }
    const mfr = negFlow === 0 ? 100 : posFlow / negFlow;
    result[i] = 100 - 100 / (1 + mfr);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Chaikin Money Flow (CMF)
// ---------------------------------------------------------------------------

/**
 * @param {Array} data - candle array
 * @param {number} period - default 20
 * @returns {Array<number|null>}
 */
export function calcCMF(data, period = 20) {
  const len = data.length;
  const result = new Array(len).fill(null);

  for (let i = period - 1; i < len; i++) {
    let mfvSum = 0, volSum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const hl = data[j].high - data[j].low;
      const clv = hl === 0 ? 0 : ((data[j].close - data[j].low) - (data[j].high - data[j].close)) / hl;
      mfvSum += clv * data[j].volume;
      volSum += data[j].volume;
    }
    result[i] = volSum === 0 ? 0 : mfvSum / volSum;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Rate of Change (ROC)
// ---------------------------------------------------------------------------

/**
 * @param {Array} data - candle array
 * @param {number} period - default 12
 * @returns {Array<number|null>}
 */
export function calcROC(data, period = 12) {
  const src = closes(data);
  const len = src.length;
  const result = new Array(len).fill(null);

  for (let i = period; i < len; i++) {
    if (src[i - period] !== 0) {
      result[i] = ((src[i] - src[i - period]) / src[i - period]) * 100;
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// TRIX
// ---------------------------------------------------------------------------

/**
 * @param {Array} data - candle array
 * @param {number} period - default 15
 * @returns {Array<number|null>}
 */
export function calcTRIX(data, period = 15) {
  const ema1 = calcEMA(data, period);
  const ema1Candles = ema1.map((v) => ({ close: v ?? 0 }));
  const ema2 = calcEMA(ema1Candles, period);
  const ema2Candles = ema2.map((v) => ({ close: v ?? 0 }));
  const ema3 = calcEMA(ema2Candles, period);

  const len = data.length;
  const result = new Array(len).fill(null);

  for (let i = 1; i < len; i++) {
    if (ema3[i] != null && ema3[i - 1] != null && ema3[i - 1] !== 0) {
      result[i] = ((ema3[i] - ema3[i - 1]) / ema3[i - 1]) * 100;
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Volume Profile
// ---------------------------------------------------------------------------

/**
 * @param {Array} data - candle array
 * @param {number} rowSize - number of price rows, default 24
 * @returns {{ levels: Array<{ price: number, volume: number, buyVolume: number, sellVolume: number }>, poc: number, valueAreaHigh: number, valueAreaLow: number }}
 */
export function calcVolumeProfile(data, rowSize = 24) {
  if (!data || data.length === 0) return { levels: [], poc: 0, valueAreaHigh: 0, valueAreaLow: 0 };

  let highest = -Infinity, lowest = Infinity;
  for (const c of data) {
    if (c.high > highest) highest = c.high;
    if (c.low < lowest) lowest = c.low;
  }

  const range = highest - lowest;
  if (range === 0) return { levels: [], poc: 0, valueAreaHigh: 0, valueAreaLow: 0 };

  const step = range / rowSize;
  const levels = [];
  for (let r = 0; r < rowSize; r++) {
    levels.push({
      price: lowest + step * (r + 0.5),
      volume: 0,
      buyVolume: 0,
      sellVolume: 0,
    });
  }

  // Distribute volume across price levels
  for (const c of data) {
    const isBuy = c.close >= c.open;
    const candleRange = c.high - c.low || step;
    for (let r = 0; r < rowSize; r++) {
      const levelLow = lowest + step * r;
      const levelHigh = levelLow + step;
      // How much of this candle overlaps this level
      const overlapLow = Math.max(c.low, levelLow);
      const overlapHigh = Math.min(c.high, levelHigh);
      if (overlapHigh > overlapLow) {
        const fraction = (overlapHigh - overlapLow) / candleRange;
        const vol = c.volume * fraction;
        levels[r].volume += vol;
        if (isBuy) levels[r].buyVolume += vol;
        else levels[r].sellVolume += vol;
      }
    }
  }

  // Point of Control = highest volume level
  let pocIdx = 0, maxVol = 0;
  for (let r = 0; r < rowSize; r++) {
    if (levels[r].volume > maxVol) { maxVol = levels[r].volume; pocIdx = r; }
  }

  // Value Area: 70% of total volume around POC
  const totalVol = levels.reduce((s, l) => s + l.volume, 0);
  const targetVol = totalVol * 0.7;
  let vaVol = levels[pocIdx].volume;
  let vaLow = pocIdx, vaHigh = pocIdx;

  while (vaVol < targetVol && (vaLow > 0 || vaHigh < rowSize - 1)) {
    const addLow = vaLow > 0 ? levels[vaLow - 1].volume : 0;
    const addHigh = vaHigh < rowSize - 1 ? levels[vaHigh + 1].volume : 0;
    if (addLow >= addHigh && vaLow > 0) { vaLow--; vaVol += levels[vaLow].volume; }
    else if (vaHigh < rowSize - 1) { vaHigh++; vaVol += levels[vaHigh].volume; }
    else break;
  }

  return {
    levels,
    poc: levels[pocIdx].price,
    valueAreaHigh: lowest + step * (vaHigh + 1),
    valueAreaLow: lowest + step * vaLow,
  };
}
