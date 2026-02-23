/* ============================================================
   VIPER — Edge Detector
   ============================================================
   Scores all three VIPER modes (STRIKE / COIL / LUNGE) every
   15 minutes and selects the winner for the next evaluation
   window.

   Each mode scores 0-100 based on current market conditions.
   Tiebreak: if top two are within 8 points, STRIKE wins.
   ============================================================ */

/**
 * Detect the optimal VIPER mode for current market conditions.
 *
 * @param {Object} params
 * @param {Object[]} params.candles5m - 5-minute candles
 * @param {Object} params.indicators5m - indicators computed on 5m candles
 * @param {Object[]} params.candles15m - 15-minute candles (for LUNGE alignment check)
 * @param {Object} params.indicators15m - indicators computed on 15m candles
 * @param {{ buyVolume: number, sellVolume: number, ratio: number }} params.tradeFlow
 * @param {number} params.spread - current spread percentage
 * @returns {{ winner: string, scores: { STRIKE: number, COIL: number, LUNGE: number }, reasons: string[] }}
 */
export function detectEdge({ candles5m, indicators5m, candles15m, indicators15m, tradeFlow, spread }) {
  const reasons = [];

  const strikeScore = scoreStrike({ candles5m, indicators5m, tradeFlow, spread, reasons });
  const coilScore = scoreCoil({ candles5m, indicators5m, reasons });
  const lungeScore = scoreLunge({ candles5m, indicators5m, candles15m, indicators15m, reasons });

  const scores = { STRIKE: strikeScore, COIL: coilScore, LUNGE: lungeScore };

  // Find winner
  let winner = 'STRIKE';
  let highScore = strikeScore;

  if (coilScore > highScore) { winner = 'COIL'; highScore = coilScore; }
  if (lungeScore > highScore) { winner = 'LUNGE'; highScore = lungeScore; }

  // Tiebreak: if top two within 8 pts, STRIKE wins (most conservative)
  const sortedModes = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  if (sortedModes[0][1] - sortedModes[1][1] <= 8 && sortedModes[1][0] === 'STRIKE') {
    winner = 'STRIKE';
    reasons.push('Tiebreak: STRIKE wins (within 8pts)');
  } else if (sortedModes[0][1] - sortedModes[1][1] <= 8 && sortedModes[0][0] !== 'STRIKE') {
    // Check if STRIKE is in the top two
    if (sortedModes[0][0] !== 'STRIKE' && sortedModes[1][0] !== 'STRIKE') {
      // STRIKE not in top two, keep the actual winner
    } else {
      winner = 'STRIKE';
      reasons.push('Tiebreak: STRIKE wins (within 8pts of leader)');
    }
  }

  reasons.push(`Edge scores: STRIKE=${strikeScore} COIL=${coilScore} LUNGE=${lungeScore} → ${winner}`);

  return { winner, scores, reasons };
}

// =========================================================================
//  STRIKE scoring (micro scalps, fast precision)
// =========================================================================
function scoreStrike({ candles5m, indicators5m, tradeFlow, spread, reasons }) {
  let score = 0;
  if (!candles5m || candles5m.length < 20 || !indicators5m) return 0;

  const lastIdx = candles5m.length - 1;
  const adx = getLastValid(indicators5m.adx, lastIdx);
  const atr = getLastValid(indicators5m.atr, lastIdx);
  const volumeSMA = getLastValid(indicators5m.volumeSMA20, lastIdx);
  const currentVol = candles5m[lastIdx].volume;

  // ADX 15-30: moderate trend = good for scalps (+25)
  if (adx != null) {
    if (adx >= 15 && adx <= 30) {
      score += 25;
      reasons.push(`STRIKE: ADX ${adx.toFixed(1)} in sweet spot (15-30)`);
    } else if (adx > 30) {
      score += 10; // Too trendy, less ideal for scalps
    } else {
      score += 5; // Too flat
    }
  }

  // Volume 1.0-1.8x average (+20)
  if (volumeSMA != null && volumeSMA > 0) {
    const volRatio = currentVol / volumeSMA;
    if (volRatio >= 1.0 && volRatio <= 1.8) {
      score += 20;
      reasons.push(`STRIKE: Volume ${volRatio.toFixed(1)}x avg (ideal)`);
    } else if (volRatio > 1.8) {
      score += 10; // Might be too volatile
    } else {
      score += 5; // Low volume
    }
  }

  // ATR normal range (+20)
  if (atr != null) {
    const price = candles5m[lastIdx].close;
    const atrPct = (atr / price) * 100;
    if (atrPct >= 0.05 && atrPct <= 0.3) {
      score += 20;
      reasons.push(`STRIKE: ATR ${atrPct.toFixed(3)}% (normal range)`);
    } else if (atrPct < 0.05) {
      score += 5; // Too quiet
    } else {
      score += 10; // High volatility
    }
  }

  // Spread <0.04% (+20)
  if (spread != null) {
    if (spread < 0.04) {
      score += 20;
      reasons.push(`STRIKE: Tight spread ${(spread * 100).toFixed(3)}%`);
    } else if (spread < 0.08) {
      score += 10;
    }
  }

  // Session hours bonus (+15) - US market hours (13:30-20:00 UTC)
  const hour = new Date().getUTCHours();
  if (hour >= 13 && hour <= 20) {
    score += 15;
    reasons.push('STRIKE: Active session hours');
  } else if (hour >= 8 && hour <= 13) {
    score += 8; // European hours
  }

  return Math.min(100, score);
}

// =========================================================================
//  COIL scoring (range exploitation)
// =========================================================================
function scoreCoil({ candles5m, indicators5m, reasons }) {
  let score = 0;
  if (!candles5m || candles5m.length < 20 || !indicators5m) return 0;

  const lastIdx = candles5m.length - 1;
  const adx = getLastValid(indicators5m.adx, lastIdx);
  const atr = getLastValid(indicators5m.atr, lastIdx);
  const bbands = indicators5m.bbands;

  // ADX <20: weak trend = range conditions (+30)
  if (adx != null) {
    if (adx < 20) {
      score += 30;
      reasons.push(`COIL: Low ADX ${adx.toFixed(1)} (range-bound)`);
    } else if (adx < 25) {
      score += 15;
    } else {
      score += 0; // Trending, bad for range plays
    }
  }

  // Range < 1.5x ATR over last 20 candles (+25)
  if (atr != null && candles5m.length >= 20) {
    const recentHighs = candles5m.slice(-20).map(c => c.high);
    const recentLows = candles5m.slice(-20).map(c => c.low);
    const rangeHigh = Math.max(...recentHighs);
    const rangeLow = Math.min(...recentLows);
    const range = rangeHigh - rangeLow;
    const rangeATRRatio = range / atr;

    if (rangeATRRatio <= 1.5) {
      score += 25;
      reasons.push(`COIL: Tight range ${rangeATRRatio.toFixed(1)}x ATR`);
    } else if (rangeATRRatio <= 2.5) {
      score += 12;
    }
  }

  // BB width contracting (+25)
  if (bbands && bbands.upper && bbands.lower) {
    const currentWidth = getLastValid(bbands.upper, lastIdx) - getLastValid(bbands.lower, lastIdx);
    // Compare to width 10 candles ago
    const prevIdx = Math.max(0, lastIdx - 10);
    const prevWidth = (bbands.upper[prevIdx] || 0) - (bbands.lower[prevIdx] || 0);

    if (prevWidth > 0 && currentWidth < prevWidth * 0.9) {
      score += 25;
      reasons.push('COIL: BB width contracting (squeeze forming)');
    } else if (currentWidth < prevWidth) {
      score += 12;
    }
  }

  // Support/resistance touches: check if price has bounced near extremes (+20)
  if (candles5m.length >= 20) {
    const recent = candles5m.slice(-20);
    const highs = recent.map(c => c.high);
    const lows = recent.map(c => c.low);
    const resistance = Math.max(...highs);
    const support = Math.min(...lows);
    const range = resistance - support;

    if (range > 0) {
      let topTouches = 0;
      let bottomTouches = 0;
      const threshold = range * 0.1;

      for (const c of recent) {
        if (c.high >= resistance - threshold) topTouches++;
        if (c.low <= support + threshold) bottomTouches++;
      }

      if (topTouches >= 2 && bottomTouches >= 2) {
        score += 20;
        reasons.push(`COIL: ${topTouches} resistance + ${bottomTouches} support touches`);
      } else if (topTouches >= 1 && bottomTouches >= 1) {
        score += 10;
      }
    }
  }

  return Math.min(100, score);
}

// =========================================================================
//  LUNGE scoring (momentum riding)
// =========================================================================
function scoreLunge({ candles5m, indicators5m, candles15m, indicators15m, reasons }) {
  let score = 0;
  if (!candles5m || candles5m.length < 20 || !indicators5m) return 0;

  const lastIdx5m = candles5m.length - 1;
  const adx5m = getLastValid(indicators5m.adx, lastIdx5m);

  // ADX >30 and rising (+30)
  if (adx5m != null) {
    if (adx5m > 30) {
      score += 20;
      // Check if rising
      const prevAdx = indicators5m.adx ? indicators5m.adx[lastIdx5m - 2] : null;
      if (prevAdx != null && adx5m > prevAdx) {
        score += 10;
        reasons.push(`LUNGE: ADX ${adx5m.toFixed(1)} rising (strong trend)`);
      } else {
        reasons.push(`LUNGE: ADX ${adx5m.toFixed(1)} (strong but not rising)`);
      }
    } else if (adx5m > 25) {
      score += 10;
    }
  }

  // EMA alignment on 5m + 15m (+25)
  if (indicators5m.ema9 && indicators5m.ema21 && indicators5m.ema50) {
    const ema9 = getLastValid(indicators5m.ema9, lastIdx5m);
    const ema21 = getLastValid(indicators5m.ema21, lastIdx5m);
    const ema50 = getLastValid(indicators5m.ema50, lastIdx5m);

    if (ema9 != null && ema21 != null && ema50 != null && ema9 > ema21 && ema21 > ema50) {
      score += 12;
      reasons.push('LUNGE: Bullish EMA alignment on 5m');

      // Check 15m alignment too
      if (indicators15m && indicators15m.ema9 && indicators15m.ema21) {
        const lastIdx15m = (candles15m?.length || 1) - 1;
        const ema9_15 = getLastValid(indicators15m.ema9, lastIdx15m);
        const ema21_15 = getLastValid(indicators15m.ema21, lastIdx15m);
        if (ema9_15 != null && ema21_15 != null && ema9_15 > ema21_15) {
          score += 13;
          reasons.push('LUNGE: Bullish EMA alignment on 15m too');
        }
      }
    }
  }

  // Sustained volume (+25)
  if (indicators5m.volumeSMA20) {
    const volumeSMA = getLastValid(indicators5m.volumeSMA20, lastIdx5m);
    if (volumeSMA != null && volumeSMA > 0) {
      // Check last 3 candles all above average
      let aboveAvgCount = 0;
      for (let i = lastIdx5m; i >= Math.max(0, lastIdx5m - 2); i--) {
        if (candles5m[i].volume > volumeSMA) aboveAvgCount++;
      }
      if (aboveAvgCount >= 3) {
        score += 25;
        reasons.push('LUNGE: Sustained above-average volume (3/3 candles)');
      } else if (aboveAvgCount >= 2) {
        score += 15;
      }
    }
  }

  // RSI 50-70 (+20)
  if (indicators5m.rsi) {
    const rsi = getLastValid(indicators5m.rsi, lastIdx5m);
    if (rsi != null) {
      if (rsi >= 50 && rsi <= 70) {
        score += 20;
        reasons.push(`LUNGE: RSI ${rsi.toFixed(1)} in momentum zone`);
      } else if (rsi > 70) {
        score += 5; // Overextended
      } else {
        score += 0; // Not bullish enough
      }
    }
  }

  return Math.min(100, score);
}

// =========================================================================
//  Helpers
// =========================================================================

/**
 * Get the last non-null value at or before the given index.
 */
function getLastValid(arr, idx) {
  if (!arr) return null;
  for (let i = Math.min(idx, arr.length - 1); i >= 0; i--) {
    if (arr[i] != null) return arr[i];
  }
  return null;
}
