/* ============================================================
   Cerebro Crypto — useRegimeDetection Hook
   ============================================================
   Runs regime detection on every completed 1m bar using
   the indicator worker. Updates store with current regime
   and maintains a regime history log.
   ============================================================ */

import { useEffect, useRef, useState, useCallback } from 'react';
import useStore from '../store';
import { REGIMES } from '../config/constants';

/**
 * Hook that detects the current market regime (bullish, choppy, bearish)
 * by analyzing indicator values via the Web Worker.
 *
 * @returns {{
 *   regime: string,
 *   reasons: string[],
 *   lastUpdate: number|null
 * }}
 */
export default function useRegimeDetection() {
  const [regime, setRegime] = useState(REGIMES.CHOPPY);
  const [reasons, setReasons] = useState([]);
  const [lastUpdate, setLastUpdate] = useState(null);

  const workerRef = useRef(null);
  const prevCandleCountRef = useRef(0);
  const prevRegimeRef = useRef(null);

  // =========================================================================
  //  Initialize worker
  // =========================================================================
  useEffect(() => {
    workerRef.current = new Worker(
      new URL('../workers/indicators.worker.js', import.meta.url),
      { type: 'module' }
    );

    workerRef.current.onmessage = (event) => {
      const { type, payload } = event.data;

      if (type === 'REGIME_RESULT') {
        const { regime: newRegime, reasons: newReasons } = payload;
        const now = Date.now();

        setRegime(newRegime);
        setReasons(newReasons);
        setLastUpdate(now);

        // Update store
        const store = useStore.getState();
        if (typeof store.setCurrentRegime === 'function') {
          store.setCurrentRegime(newRegime);
        }

        // Log regime change if different from previous
        if (prevRegimeRef.current != null && prevRegimeRef.current !== newRegime) {
          if (typeof store.addRegimeHistoryEntry === 'function') {
            store.addRegimeHistoryEntry({
              from: prevRegimeRef.current,
              to: newRegime,
              reasons: newReasons,
              timestamp: now,
            });
          }

          // Also add to alert log
          if (typeof store.addAlertLogEntry === 'function') {
            store.addAlertLogEntry({
              id: `regime-${now}`,
              type: 'regime_change',
              message: `Regime changed: ${prevRegimeRef.current} -> ${newRegime}`,
              reasons: newReasons,
              timestamp: now,
              pair: store.activePair,
            });
          }

          console.log(
            `[Regime] Changed: ${prevRegimeRef.current} -> ${newRegime}`,
            newReasons
          );
        }

        prevRegimeRef.current = newRegime;
      } else if (type === 'ERROR') {
        console.error('[useRegimeDetection] Worker error:', payload.message);
      }
    };

    workerRef.current.onerror = (err) => {
      console.error('[useRegimeDetection] Worker error:', err);
    };

    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
    };
  }, []);

  // =========================================================================
  //  Run regime detection when a new 1m bar completes
  // =========================================================================
  const runDetection = useCallback(() => {
    const store = useStore.getState();
    const candles = store.candles || [];
    const indicators = store.indicators || {};

    // Only run when we have a new candle (compare count)
    if (candles.length === 0 || candles.length === prevCandleCountRef.current) {
      return;
    }
    prevCandleCountRef.current = candles.length;

    // Get the latest indicator values
    const lastIdx = candles.length - 1;
    const price = candles[lastIdx].close;

    // Extract individual indicator values at the last index
    const sma200 = indicators.sma200 ? indicators.sma200[lastIdx] : null;
    const ema9 = indicators.ema9 ? indicators.ema9[lastIdx] : null;
    const ema21 = indicators.ema21 ? indicators.ema21[lastIdx] : null;
    const ema50 = indicators.ema50 ? indicators.ema50[lastIdx] : null;
    const adx = indicators.adx ? indicators.adx[lastIdx] : null;
    const rsi = indicators.rsi ? indicators.rsi[lastIdx] : null;

    // Bollinger Band width
    let bbWidth = null;
    let bbWidthAvg = null;
    if (indicators.bbands && indicators.bbands.upper && indicators.bbands.lower && indicators.bbands.middle) {
      const upper = indicators.bbands.upper[lastIdx];
      const lower = indicators.bbands.lower[lastIdx];
      const middle = indicators.bbands.middle[lastIdx];

      if (upper != null && lower != null && middle != null && middle !== 0) {
        bbWidth = (upper - lower) / middle;

        // Average BB width over last 50 bars
        let widthSum = 0;
        let widthCount = 0;
        const lookback = Math.min(50, lastIdx);
        for (let i = lastIdx - lookback; i <= lastIdx; i++) {
          const u = indicators.bbands.upper[i];
          const l = indicators.bbands.lower[i];
          const m = indicators.bbands.middle[i];
          if (u != null && l != null && m != null && m !== 0) {
            widthSum += (u - l) / m;
            widthCount++;
          }
        }
        bbWidthAvg = widthCount > 0 ? widthSum / widthCount : bbWidth;
      }
    }

    // Send to worker
    if (workerRef.current) {
      workerRef.current.postMessage({
        type: 'REGIME',
        payload: {
          price,
          sma200,
          ema9,
          ema21,
          ema50,
          adx,
          rsi,
          bbWidth,
          bbWidthAvg,
        },
      });
    }
  }, []);

  // =========================================================================
  //  Poll for new candles and run detection
  // =========================================================================
  useEffect(() => {
    // Run on interval to check for new candles
    const interval = setInterval(runDetection, 5000);

    // Also run immediately
    runDetection();

    return () => clearInterval(interval);
  }, [runDetection]);

  // =========================================================================
  //  Also run when indicators update in the store
  // =========================================================================
  useEffect(() => {
    const unsubscribe = useStore.subscribe(
      (state) => state.indicators,
      () => {
        // Indicators updated — force re-check
        prevCandleCountRef.current = 0; // Reset so detection runs
        runDetection();
      }
    );

    if (typeof unsubscribe === 'function') {
      return unsubscribe;
    }
  }, [runDetection]);

  return {
    regime,
    reasons,
    lastUpdate,
  };
}
