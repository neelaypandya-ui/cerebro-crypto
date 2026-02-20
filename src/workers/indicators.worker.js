/* ============================================================
   Cerebro Crypto — Technical Indicators Web Worker
   ============================================================
   Runs all indicator calculations off the main thread.
   Receives candle data, returns computed indicator arrays.
   ============================================================ */

// =========================================================================
//  Indicator Calculation Functions
// =========================================================================

/**
 * Simple Moving Average
 * @param {number[]} data - array of values (typically close prices)
 * @param {number} period
 * @returns {(number|null)[]}
 */
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

/**
 * Exponential Moving Average
 * @param {number[]} data
 * @param {number} period
 * @returns {(number|null)[]}
 */
function EMA(data, period) {
  const result = [];
  const multiplier = 2 / (period + 1);

  // Seed with SMA of first `period` values
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
      const ema = (data[i] - prev) * multiplier + prev;
      result.push(ema);
    }
  }
  return result;
}

/**
 * Relative Strength Index
 * @param {number[]} data - close prices
 * @param {number} period - default 14
 * @returns {(number|null)[]}
 */
function RSI(data, period = 14) {
  const result = [];
  if (data.length < period + 1) {
    return data.map(() => null);
  }

  let gainSum = 0;
  let lossSum = 0;

  // First pass: compute initial average gain/loss
  for (let i = 1; i <= period; i++) {
    const change = data[i] - data[i - 1];
    if (change >= 0) {
      gainSum += change;
    } else {
      lossSum += Math.abs(change);
    }
  }

  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;

  // Fill nulls for the initial period
  for (let i = 0; i < period; i++) {
    result.push(null);
  }

  // First RSI value
  if (avgLoss === 0) {
    result.push(100);
  } else {
    const rs = avgGain / avgLoss;
    result.push(100 - 100 / (1 + rs));
  }

  // Subsequent values using Wilder's smoothing
  for (let i = period + 1; i < data.length; i++) {
    const change = data[i] - data[i - 1];
    const currentGain = change >= 0 ? change : 0;
    const currentLoss = change < 0 ? Math.abs(change) : 0;

    avgGain = (avgGain * (period - 1) + currentGain) / period;
    avgLoss = (avgLoss * (period - 1) + currentLoss) / period;

    if (avgLoss === 0) {
      result.push(100);
    } else {
      const rs = avgGain / avgLoss;
      result.push(100 - 100 / (1 + rs));
    }
  }

  return result;
}

/**
 * MACD — Moving Average Convergence Divergence
 * @param {number[]} data - close prices
 * @param {number} fast - fast EMA period (default 12)
 * @param {number} slow - slow EMA period (default 26)
 * @param {number} signalPeriod - signal line EMA period (default 9)
 * @returns {{ macd: (number|null)[], signal: (number|null)[], histogram: (number|null)[] }}
 */
function MACD(data, fast = 12, slow = 26, signalPeriod = 9) {
  const emaFast = EMA(data, fast);
  const emaSlow = EMA(data, slow);

  // MACD line = fast EMA - slow EMA
  const macdLine = [];
  for (let i = 0; i < data.length; i++) {
    if (emaFast[i] === null || emaSlow[i] === null) {
      macdLine.push(null);
    } else {
      macdLine.push(emaFast[i] - emaSlow[i]);
    }
  }

  // Signal line = EMA of MACD line (only on non-null values)
  // We need to compute EMA on the non-null portion
  const firstValidIdx = macdLine.findIndex((v) => v !== null);
  const macdValues = macdLine.slice(firstValidIdx).map((v) => v ?? 0);
  const signalValues = EMA(macdValues, signalPeriod);

  const signal = [];
  const histogram = [];

  for (let i = 0; i < data.length; i++) {
    if (i < firstValidIdx) {
      signal.push(null);
      histogram.push(null);
    } else {
      const sigVal = signalValues[i - firstValidIdx];
      signal.push(sigVal);
      if (macdLine[i] !== null && sigVal !== null) {
        histogram.push(macdLine[i] - sigVal);
      } else {
        histogram.push(null);
      }
    }
  }

  return { macd: macdLine, signal, histogram };
}

/**
 * Bollinger Bands
 * @param {number[]} data - close prices
 * @param {number} period - default 20
 * @param {number} stdDevMult - default 2
 * @returns {{ upper: (number|null)[], middle: (number|null)[], lower: (number|null)[] }}
 */
function BollingerBands(data, period = 20, stdDevMult = 2) {
  const middle = SMA(data, period);
  const upper = [];
  const lower = [];

  for (let i = 0; i < data.length; i++) {
    if (middle[i] === null) {
      upper.push(null);
      lower.push(null);
    } else {
      // Calculate standard deviation
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

/**
 * Average True Range
 * @param {Object[]} candles - { high, low, close }
 * @param {number} period - default 14
 * @returns {(number|null)[]}
 */
function ATR(candles, period = 14) {
  if (candles.length === 0) return [];

  const trueRanges = [candles[0].high - candles[0].low]; // first TR = H - L

  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevClose = candles[i - 1].close;
    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );
    trueRanges.push(tr);
  }

  // ATR = Wilder's smoothed average of TR
  const result = [];

  for (let i = 0; i < period - 1; i++) {
    result.push(null);
  }

  // Seed: SMA of first `period` true ranges
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += trueRanges[i];
  }
  let atr = sum / period;
  result.push(atr);

  // Subsequent: Wilder's smoothing
  for (let i = period; i < trueRanges.length; i++) {
    atr = (atr * (period - 1) + trueRanges[i]) / period;
    result.push(atr);
  }

  return result;
}

/**
 * Average Directional Index
 * @param {Object[]} candles - { high, low, close }
 * @param {number} period - default 14
 * @returns {(number|null)[]}
 */
function ADX(candles, period = 14) {
  if (candles.length < period + 1) {
    return candles.map(() => null);
  }

  // Step 1: Calculate +DM, -DM, TR
  const plusDM = [];
  const minusDM = [];
  const trueRanges = [];

  for (let i = 1; i < candles.length; i++) {
    const highDiff = candles[i].high - candles[i - 1].high;
    const lowDiff = candles[i - 1].low - candles[i].low;

    plusDM.push(highDiff > lowDiff && highDiff > 0 ? highDiff : 0);
    minusDM.push(lowDiff > highDiff && lowDiff > 0 ? lowDiff : 0);

    const high = candles[i].high;
    const low = candles[i].low;
    const prevClose = candles[i - 1].close;
    trueRanges.push(
      Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose))
    );
  }

  // Step 2: Wilder smoothing for +DM, -DM, TR over `period`
  function wilderSmooth(values, p) {
    const smoothed = [];
    let sum = 0;
    for (let i = 0; i < p; i++) {
      sum += values[i];
    }
    smoothed.push(sum);
    for (let i = p; i < values.length; i++) {
      const val = smoothed[smoothed.length - 1] - smoothed[smoothed.length - 1] / p + values[i];
      smoothed.push(val);
    }
    return smoothed;
  }

  const smoothPlusDM = wilderSmooth(plusDM, period);
  const smoothMinusDM = wilderSmooth(minusDM, period);
  const smoothTR = wilderSmooth(trueRanges, period);

  // Step 3: +DI and -DI
  const plusDI = [];
  const minusDI = [];
  const dx = [];

  for (let i = 0; i < smoothTR.length; i++) {
    const pdi = smoothTR[i] !== 0 ? (smoothPlusDM[i] / smoothTR[i]) * 100 : 0;
    const mdi = smoothTR[i] !== 0 ? (smoothMinusDM[i] / smoothTR[i]) * 100 : 0;
    plusDI.push(pdi);
    minusDI.push(mdi);

    const diSum = pdi + mdi;
    dx.push(diSum !== 0 ? (Math.abs(pdi - mdi) / diSum) * 100 : 0);
  }

  // Step 4: ADX = Wilder smoothed DX over `period`
  const result = [];
  // Fill leading nulls: first candle + (period-1) for DM smoothing + (period-1) for ADX smoothing
  const leadingNulls = 1 + (period - 1) + (period - 1);

  for (let i = 0; i < Math.min(leadingNulls, candles.length); i++) {
    result.push(null);
  }

  if (dx.length >= period) {
    // Seed ADX: average of first `period` DX values starting after the initial smoothing
    let adxSum = 0;
    for (let i = period - 1; i < period - 1 + period && i < dx.length; i++) {
      adxSum += dx[i];
    }
    let adx = adxSum / period;
    result.push(adx);

    // Wilder smoothing for subsequent ADX
    for (let i = period - 1 + period; i < dx.length; i++) {
      adx = (adx * (period - 1) + dx[i]) / period;
      result.push(adx);
    }
  }

  // Pad remaining if needed
  while (result.length < candles.length) {
    result.push(result.length > 0 ? result[result.length - 1] : null);
  }

  // Trim if too long
  return result.slice(0, candles.length);
}

/**
 * Volume Weighted Average Price
 * @param {Object[]} candles - { high, low, close, volume }
 * @returns {(number|null)[]}
 */
function VWAP(candles) {
  const result = [];
  let cumulativeTPV = 0; // cumulative (typical price * volume)
  let cumulativeVolume = 0;

  for (let i = 0; i < candles.length; i++) {
    const tp = (candles[i].high + candles[i].low + candles[i].close) / 3;
    cumulativeTPV += tp * candles[i].volume;
    cumulativeVolume += candles[i].volume;

    if (cumulativeVolume === 0) {
      result.push(null);
    } else {
      result.push(cumulativeTPV / cumulativeVolume);
    }
  }
  return result;
}

// =========================================================================
//  New Indicator Functions (17 new indicators)
// =========================================================================

/**
 * Hull Moving Average
 */
function HMA(data, period = 9) {
  const len = data.length;
  if (len < period) return data.map(() => null);
  const halfPeriod = Math.floor(period / 2);
  const sqrtPeriod = Math.floor(Math.sqrt(period));

  function WMA(arr, p) {
    const out = new Array(arr.length).fill(null);
    if (arr.length < p) return out;
    for (let i = p - 1; i < arr.length; i++) {
      let sum = 0, wSum = 0;
      for (let j = 0; j < p; j++) { const w = p - j; sum += arr[i - j] * w; wSum += w; }
      out[i] = sum / wSum;
    }
    return out;
  }

  const wmaHalf = WMA(data, halfPeriod);
  const wmaFull = WMA(data, period);
  const diff = [];
  for (let i = 0; i < len; i++) {
    diff.push(wmaHalf[i] != null && wmaFull[i] != null ? 2 * wmaHalf[i] - wmaFull[i] : null);
  }
  const firstValid = diff.findIndex((v) => v !== null);
  if (firstValid < 0) return data.map(() => null);
  const diffValues = diff.slice(firstValid).map((v) => v ?? 0);
  const hmaRaw = WMA(diffValues, sqrtPeriod);
  const result = new Array(len).fill(null);
  for (let i = 0; i < hmaRaw.length; i++) {
    if (hmaRaw[i] != null) result[firstValid + i] = hmaRaw[i];
  }
  return result;
}

/**
 * Triple Exponential Moving Average
 */
function TEMA(data, period = 9) {
  const ema1 = EMA(data, period);
  const ema2 = EMA(ema1.map((v) => v ?? 0), period);
  const ema3 = EMA(ema2.map((v) => v ?? 0), period);
  return data.map((_, i) =>
    ema1[i] != null && ema2[i] != null && ema3[i] != null
      ? 3 * ema1[i] - 3 * ema2[i] + ema3[i] : null
  );
}

/**
 * Ichimoku Cloud
 */
function Ichimoku(candles, tenkan = 9, kijun = 26, senkouBPeriod = 52) {
  const len = candles.length;
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
    tenkanSen[i] = midpoint(candles, i, tenkan);
    kijunSen[i] = midpoint(candles, i, kijun);
    if (tenkanSen[i] != null && kijunSen[i] != null) {
      const fi = i + kijun;
      if (fi < len) senkouA[fi] = (tenkanSen[i] + kijunSen[i]) / 2;
    }
    const sb = midpoint(candles, i, senkouBPeriod);
    if (sb != null) { const fi = i + kijun; if (fi < len) senkouB[fi] = sb; }
    if (i >= kijun) chikou[i - kijun] = candles[i].close;
  }
  return { tenkanSen, kijunSen, senkouA, senkouB, chikou };
}

/**
 * Parabolic SAR
 */
function ParabolicSAR(candles, step = 0.02, max = 0.2) {
  const len = candles.length;
  if (len < 2) return new Array(len).fill(null);
  const result = new Array(len).fill(null);
  let isUp = candles[1].close > candles[0].close;
  let af = step, ep = isUp ? candles[0].high : candles[0].low;
  let sar = isUp ? candles[0].low : candles[0].high;
  result[0] = sar;

  for (let i = 1; i < len; i++) {
    const prev = sar;
    if (isUp) {
      sar = prev + af * (ep - prev);
      sar = Math.min(sar, candles[i - 1].low, i > 1 ? candles[i - 2].low : candles[i - 1].low);
      if (candles[i].low < sar) { isUp = false; sar = ep; ep = candles[i].low; af = step; }
      else if (candles[i].high > ep) { ep = candles[i].high; af = Math.min(af + step, max); }
    } else {
      sar = prev + af * (ep - prev);
      sar = Math.max(sar, candles[i - 1].high, i > 1 ? candles[i - 2].high : candles[i - 1].high);
      if (candles[i].high > sar) { isUp = true; sar = ep; ep = candles[i].high; af = step; }
      else if (candles[i].low < ep) { ep = candles[i].low; af = Math.min(af + step, max); }
    }
    result[i] = sar;
  }
  return result;
}

/**
 * Supertrend
 */
function Supertrend(candles, period = 10, multiplier = 3) {
  const len = candles.length;
  const atr = ATR(candles, period);
  const result = new Array(len).fill(null);
  if (len < period + 1) return result;

  let prevUpper = 0, prevLower = 0, prevTrend = 1;
  for (let i = period; i < len; i++) {
    const hl2 = (candles[i].high + candles[i].low) / 2;
    const a = atr[i] || 0;
    let upper = hl2 + multiplier * a;
    let lower = hl2 - multiplier * a;
    if (i > period) {
      upper = upper < prevUpper || candles[i - 1].close > prevUpper ? upper : prevUpper;
      lower = lower > prevLower || candles[i - 1].close < prevLower ? lower : prevLower;
    }
    let trend = i === period ? (candles[i].close > upper ? 1 : -1)
      : prevTrend === 1 ? (candles[i].close < lower ? -1 : 1) : (candles[i].close > upper ? 1 : -1);
    result[i] = trend === 1 ? lower : upper;
    prevUpper = upper; prevLower = lower; prevTrend = trend;
  }
  return result;
}

/**
 * Keltner Channels
 */
function KeltnerChannels(candles, period = 20, multiplier = 1.5) {
  const closes = candles.map((c) => c.close);
  const middle = EMA(closes, period);
  const atr = ATR(candles, period);
  const upper = [], lower = [];
  for (let i = 0; i < candles.length; i++) {
    if (middle[i] != null && atr[i] != null) {
      upper.push(middle[i] + multiplier * atr[i]);
      lower.push(middle[i] - multiplier * atr[i]);
    } else { upper.push(null); lower.push(null); }
  }
  return { upper, middle, lower };
}

/**
 * Pivot Points (Standard)
 */
function PivotPoints(candles) {
  const len = candles.length;
  const pp = new Array(len).fill(null);
  const r1 = new Array(len).fill(null), s1 = new Array(len).fill(null);
  const r2 = new Array(len).fill(null), s2 = new Array(len).fill(null);
  const r3 = new Array(len).fill(null), s3 = new Array(len).fill(null);
  for (let i = 1; i < len; i++) {
    const p = candles[i - 1];
    const pivot = (p.high + p.low + p.close) / 3;
    pp[i] = pivot;
    r1[i] = 2 * pivot - p.low; s1[i] = 2 * pivot - p.high;
    r2[i] = pivot + (p.high - p.low); s2[i] = pivot - (p.high - p.low);
    r3[i] = p.high + 2 * (pivot - p.low); s3[i] = p.low - 2 * (p.high - pivot);
  }
  return { pp, r1, r2, r3, s1, s2, s3 };
}

/**
 * Stochastic RSI
 */
function StochRSI(data, rsiPeriod = 14, stochPeriod = 14, kSmooth = 3, dSmooth = 3) {
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

/**
 * Williams %R
 */
function WilliamsR(candles, period = 14) {
  const result = new Array(candles.length).fill(null);
  for (let i = period - 1; i < candles.length; i++) {
    let hh = -Infinity, ll = Infinity;
    for (let j = i - period + 1; j <= i; j++) {
      if (candles[j].high > hh) hh = candles[j].high;
      if (candles[j].low < ll) ll = candles[j].low;
    }
    const r = hh - ll;
    result[i] = r === 0 ? -50 : ((hh - candles[i].close) / r) * -100;
  }
  return result;
}

/**
 * Commodity Channel Index
 */
function CCI(candles, period = 20) {
  const result = new Array(candles.length).fill(null);
  for (let i = period - 1; i < candles.length; i++) {
    let sum = 0; const tps = [];
    for (let j = i - period + 1; j <= i; j++) {
      const tp = (candles[j].high + candles[j].low + candles[j].close) / 3;
      tps.push(tp); sum += tp;
    }
    const mean = sum / period;
    let md = 0; for (const tp of tps) md += Math.abs(tp - mean); md /= period;
    result[i] = md === 0 ? 0 : (tps[tps.length - 1] - mean) / (0.015 * md);
  }
  return result;
}

/**
 * On Balance Volume
 */
function OBV(candles) {
  if (candles.length === 0) return [];
  const result = [0];
  for (let i = 1; i < candles.length; i++) {
    if (candles[i].close > candles[i - 1].close) result.push(result[i - 1] + candles[i].volume);
    else if (candles[i].close < candles[i - 1].close) result.push(result[i - 1] - candles[i].volume);
    else result.push(result[i - 1]);
  }
  return result;
}

/**
 * Money Flow Index
 */
function MFI(candles, period = 14) {
  const len = candles.length;
  const result = new Array(len).fill(null);
  if (len < period + 1) return result;
  const tp = candles.map((c) => (c.high + c.low + c.close) / 3);
  const rmf = tp.map((t, i) => t * candles[i].volume);
  for (let i = period; i < len; i++) {
    let pos = 0, neg = 0;
    for (let j = i - period + 1; j <= i; j++) {
      if (tp[j] > tp[j - 1]) pos += rmf[j]; else neg += rmf[j];
    }
    result[i] = neg === 0 ? 100 : 100 - 100 / (1 + pos / neg);
  }
  return result;
}

/**
 * Chaikin Money Flow
 */
function CMF(candles, period = 20) {
  const result = new Array(candles.length).fill(null);
  for (let i = period - 1; i < candles.length; i++) {
    let mfv = 0, vol = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const hl = candles[j].high - candles[j].low;
      const clv = hl === 0 ? 0 : ((candles[j].close - candles[j].low) - (candles[j].high - candles[j].close)) / hl;
      mfv += clv * candles[j].volume; vol += candles[j].volume;
    }
    result[i] = vol === 0 ? 0 : mfv / vol;
  }
  return result;
}

/**
 * Rate of Change
 */
function ROC(data, period = 12) {
  const result = new Array(data.length).fill(null);
  for (let i = period; i < data.length; i++) {
    if (data[i - period] !== 0) result[i] = ((data[i] - data[i - period]) / data[i - period]) * 100;
  }
  return result;
}

/**
 * TRIX
 */
function TRIX(data, period = 15) {
  const e1 = EMA(data, period);
  const e2 = EMA(e1.map((v) => v ?? 0), period);
  const e3 = EMA(e2.map((v) => v ?? 0), period);
  const result = new Array(data.length).fill(null);
  for (let i = 1; i < data.length; i++) {
    if (e3[i] != null && e3[i - 1] != null && e3[i - 1] !== 0) {
      result[i] = ((e3[i] - e3[i - 1]) / e3[i - 1]) * 100;
    }
  }
  return result;
}

/**
 * Rolling High — highest value over N periods
 * @param {number[]} data
 * @param {number} period
 * @returns {(number|null)[]}
 */
function computeRollingHigh(data, period) {
  const result = new Array(data.length).fill(null);
  for (let i = period - 1; i < data.length; i++) {
    let max = -Infinity;
    for (let j = i - period + 1; j <= i; j++) {
      if (data[j] > max) max = data[j];
    }
    result[i] = max;
  }
  return result;
}

/**
 * Rolling Low — lowest value over N periods
 * @param {number[]} data
 * @param {number} period
 * @returns {(number|null)[]}
 */
function computeRollingLow(data, period) {
  const result = new Array(data.length).fill(null);
  for (let i = period - 1; i < data.length; i++) {
    let min = Infinity;
    for (let j = i - period + 1; j <= i; j++) {
      if (data[j] < min) min = data[j];
    }
    result[i] = min;
  }
  return result;
}

/**
 * Volume Profile
 */
function VolumeProfile(candles, rowSize = 24) {
  if (!candles || candles.length === 0) return { levels: [], poc: 0, vaHigh: 0, vaLow: 0 };
  let highest = -Infinity, lowest = Infinity;
  for (const c of candles) { if (c.high > highest) highest = c.high; if (c.low < lowest) lowest = c.low; }
  const range = highest - lowest;
  if (range === 0) return { levels: [], poc: 0, vaHigh: 0, vaLow: 0 };
  const step = range / rowSize;
  const levels = [];
  for (let r = 0; r < rowSize; r++) levels.push({ price: lowest + step * (r + 0.5), volume: 0 });
  for (const c of candles) {
    const cr = c.high - c.low || step;
    for (let r = 0; r < rowSize; r++) {
      const lo = lowest + step * r, hi = lo + step;
      const oLo = Math.max(c.low, lo), oHi = Math.min(c.high, hi);
      if (oHi > oLo) levels[r].volume += c.volume * ((oHi - oLo) / cr);
    }
  }
  let pocIdx = 0, maxVol = 0;
  for (let r = 0; r < rowSize; r++) { if (levels[r].volume > maxVol) { maxVol = levels[r].volume; pocIdx = r; } }
  return { levels, poc: levels[pocIdx].price, vaHigh: highest, vaLow: lowest };
}

// =========================================================================
//  Regime Detection
// =========================================================================

/**
 * Determine market regime from indicator values.
 * @param {Object} params
 * @returns {{ regime: string, reasons: string[] }}
 */
function detectRegime({ price, sma200, ema9, ema21, ema50, adx, rsi, bbWidth, bbWidthAvg }) {
  const reasons = [];
  let bullishScore = 0;
  let bearishScore = 0;
  let choppyScore = 0;

  // Trend direction via SMA 200
  if (price != null && sma200 != null) {
    if (price > sma200) {
      bullishScore += 2;
      reasons.push('Price above SMA200');
    } else {
      bearishScore += 2;
      reasons.push('Price below SMA200');
    }
  }

  // EMA alignment
  if (ema9 != null && ema21 != null && ema50 != null) {
    if (ema9 > ema21 && ema21 > ema50) {
      bullishScore += 2;
      reasons.push('Bullish EMA alignment (9 > 21 > 50)');
    } else if (ema9 < ema21 && ema21 < ema50) {
      bearishScore += 2;
      reasons.push('Bearish EMA alignment (9 < 21 < 50)');
    } else {
      choppyScore += 2;
      reasons.push('Mixed EMA alignment');
    }
  }

  // ADX: trend strength
  if (adx != null) {
    if (adx > 25) {
      // Strong trend - add to whichever direction is leading
      if (bullishScore > bearishScore) {
        bullishScore += 1;
        reasons.push(`Strong trend (ADX=${adx.toFixed(1)})`);
      } else if (bearishScore > bullishScore) {
        bearishScore += 1;
        reasons.push(`Strong downtrend (ADX=${adx.toFixed(1)})`);
      }
    } else if (adx < 20) {
      choppyScore += 2;
      reasons.push(`Weak trend (ADX=${adx.toFixed(1)})`);
    }
  }

  // RSI
  if (rsi != null) {
    if (rsi > 60) {
      bullishScore += 1;
      reasons.push(`Bullish RSI (${rsi.toFixed(1)})`);
    } else if (rsi < 40) {
      bearishScore += 1;
      reasons.push(`Bearish RSI (${rsi.toFixed(1)})`);
    } else {
      choppyScore += 1;
      reasons.push(`Neutral RSI (${rsi.toFixed(1)})`);
    }
  }

  // Bollinger Band width: volatility squeeze detection
  if (bbWidth != null && bbWidthAvg != null) {
    if (bbWidth < bbWidthAvg * 0.75) {
      choppyScore += 1;
      reasons.push('Volatility squeeze (narrow Bollinger Bands)');
    } else if (bbWidth > bbWidthAvg * 1.5) {
      reasons.push('High volatility (wide Bollinger Bands)');
    }
  }

  // Determine regime
  if (choppyScore >= bullishScore && choppyScore >= bearishScore) {
    return { regime: 'choppy', reasons };
  } else if (bullishScore >= bearishScore) {
    return { regime: 'bullish', reasons };
  } else {
    return { regime: 'bearish', reasons };
  }
}

// =========================================================================
//  Candle Aggregation
// =========================================================================

/**
 * Aggregate 1-minute candles into a target timeframe.
 * @param {Object[]} candles1m - 1-minute candles sorted by timestamp ascending
 * @param {string} targetTimeframe - 'FIVE_MINUTE' | 'FIFTEEN_MINUTE'
 * @returns {Object[]} aggregated candles
 */
function aggregateCandles(candles1m, targetTimeframe) {
  const minutesMap = {
    FIVE_MINUTE: 5,
    FIFTEEN_MINUTE: 15,
    ONE_HOUR: 60,
    FOUR_HOUR: 240,
  };

  const minutes = minutesMap[targetTimeframe];
  if (!minutes || candles1m.length === 0) return [];

  const intervalMs = minutes * 60 * 1000;
  const aggregated = [];
  let currentBucket = null;

  for (const candle of candles1m) {
    const bucketStart = Math.floor(candle.timestamp / intervalMs) * intervalMs;

    if (!currentBucket || currentBucket.timestamp !== bucketStart) {
      // Start a new bucket
      if (currentBucket) {
        aggregated.push(currentBucket);
      }
      currentBucket = {
        timestamp: bucketStart,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume,
      };
    } else {
      // Merge into current bucket
      currentBucket.high = Math.max(currentBucket.high, candle.high);
      currentBucket.low = Math.min(currentBucket.low, candle.low);
      currentBucket.close = candle.close;
      currentBucket.volume += candle.volume;
    }
  }

  // Push the last bucket
  if (currentBucket) {
    aggregated.push(currentBucket);
  }

  return aggregated;
}

// =========================================================================
//  Calculate All Requested Indicators
// =========================================================================

/**
 * Run all requested indicator calculations on candle data.
 * @param {Object[]} candles - { open, high, low, close, volume, timestamp }
 * @param {string[]} indicators - list of indicator names to compute
 * @param {Object} params - optional override params for indicators
 * @returns {Object} computed indicator values
 */
function calculateIndicators(candles, indicators, params = {}) {
  const closes = candles.map((c) => c.close);
  const result = {};

  for (const name of indicators) {
    switch (name.toLowerCase()) {
      case 'ema':
      case 'ema9':
        result.ema9 = EMA(closes, params.ema9Period || 9);
        break;
      case 'ema21':
        result.ema21 = EMA(closes, params.ema21Period || 21);
        break;
      case 'ema50':
        result.ema50 = EMA(closes, params.ema50Period || 50);
        break;
      case 'sma':
      case 'sma200':
        result.sma200 = SMA(closes, params.sma200Period || 200);
        break;
      case 'rsi':
        result.rsi = RSI(closes, params.rsiPeriod || 14);
        break;
      case 'macd':
        result.macd = MACD(
          closes,
          params.macdFast || 12,
          params.macdSlow || 26,
          params.macdSignal || 9
        );
        break;
      case 'bbands':
      case 'bollingerbands':
        result.bbands = BollingerBands(
          closes,
          params.bbPeriod || 20,
          params.bbStdDev || 2
        );
        break;
      case 'atr':
        result.atr = ATR(candles, params.atrPeriod || 14);
        break;
      case 'adx':
        result.adx = ADX(candles, params.adxPeriod || 14);
        break;
      case 'vwap':
        result.vwap = VWAP(candles);
        break;
      case 'hma':
        result.hma = HMA(closes, params.hmaPeriod || 9);
        break;
      case 'tema':
        result.tema = TEMA(closes, params.temaPeriod || 9);
        break;
      case 'ichimoku':
        result.ichimoku = Ichimoku(candles, params.ichimokuTenkan || 9, params.ichimokuKijun || 26, params.ichimokuSenkouB || 52);
        break;
      case 'parabolicsar':
      case 'psar':
        result.parabolicSar = ParabolicSAR(candles, params.psarStep || 0.02, params.psarMax || 0.2);
        break;
      case 'supertrend':
        result.supertrend = Supertrend(candles, params.supertrendPeriod || 10, params.supertrendMultiplier || 3);
        break;
      case 'keltner':
      case 'keltnerchannel':
        result.keltner = KeltnerChannels(candles, params.keltnerPeriod || 20, params.keltnerMultiplier || 1.5);
        break;
      case 'pivots':
      case 'pivotpoints':
        result.pivots = PivotPoints(candles);
        break;
      case 'stochrsi':
        result.stochRsi = StochRSI(closes, params.stochRsiPeriod || 14, params.stochRsiStochPeriod || 14, params.stochRsiK || 3, params.stochRsiD || 3);
        break;
      case 'williamsr':
        result.williamsR = WilliamsR(candles, params.williamsRPeriod || 14);
        break;
      case 'cci':
        result.cci = CCI(candles, params.cciPeriod || 20);
        break;
      case 'obv':
        result.obv = OBV(candles);
        break;
      case 'mfi':
        result.mfi = MFI(candles, params.mfiPeriod || 14);
        break;
      case 'cmf':
        result.cmf = CMF(candles, params.cmfPeriod || 20);
        break;
      case 'roc':
        result.roc = ROC(closes, params.rocPeriod || 12);
        break;
      case 'trix':
        result.trix = TRIX(closes, params.trixPeriod || 15);
        break;
      case 'volumeprofile':
        result.volumeProfile = VolumeProfile(candles, params.vpRowSize || 24);
        break;
      case 'volumesma20': {
        const volumes = candles.map((c) => c.volume);
        result.volumeSMA20 = SMA(volumes, 20);
        break;
      }
      case 'high20':
        result.high20 = computeRollingHigh(closes, 20);
        break;
      case 'low20':
        result.low20 = computeRollingLow(closes, 20);
        break;
      default:
        // Unknown indicator — skip
        break;
    }
  }

  return result;
}

// =========================================================================
//  Message Handler
// =========================================================================

self.onmessage = function (event) {
  const { type, payload } = event.data;

  try {
    switch (type) {
      case 'CALCULATE': {
        const { candles, indicators, params } = payload;
        const result = calculateIndicators(candles, indicators, params || {});
        self.postMessage({ type: 'RESULT', payload: result });
        break;
      }

      case 'REGIME': {
        const regimeResult = detectRegime(payload);
        self.postMessage({ type: 'REGIME_RESULT', payload: regimeResult });
        break;
      }

      case 'AGGREGATE': {
        const { candles1m, targetTimeframe } = payload;
        const aggregated = aggregateCandles(candles1m, targetTimeframe);
        self.postMessage({
          type: 'AGGREGATE_RESULT',
          payload: { timeframe: targetTimeframe, candles: aggregated },
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
      payload: { message: error.message || 'Unknown worker error' },
    });
  }
};
