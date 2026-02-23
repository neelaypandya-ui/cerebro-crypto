/* ============================================================
   Cerebro Crypto — useMarketData Hook
   ============================================================
   Coordinates market data initialization and updates.
   Fetches initial candle data, starts WebSocket, and manages
   indicator calculations via the indicator worker.
   ============================================================ */

import { useEffect, useRef, useState, useCallback } from 'react';
import useStore from '../store';
import useCoinbaseREST from './useCoinbaseREST';
import useCoinbaseWebSocket from './useCoinbaseWebSocket';
import { coinbaseREST } from '../services/coinbaseREST';

// All indicator names to compute
const ALL_INDICATORS = [
  'ema9', 'ema21', 'ema50', 'sma200',
  'rsi', 'macd', 'bbands', 'atr', 'adx', 'vwap',
  'stochRSI', 'obv', 'volumeSMA20', 'high20', 'low20',
  'hma',
];

// Scanner polling interval (30s)
const SCANNER_POLL_INTERVAL_MS = 30000;
// Stagger between per-pair REST calls (200ms)
const SCANNER_STAGGER_MS = 200;
// Stagger between worker messages (50ms)
const SCANNER_WORKER_STAGGER_MS = 50;

/**
 * Hook that coordinates market data initialization and ongoing updates.
 * On mount: fetch initial candles, start WebSocket, compute indicators.
 * When activePair or activeTimeframe changes: refetch and recompute.
 *
 * @returns {{ loading: boolean, error: string|null, refreshData: Function }}
 */
export default function useMarketData() {
  const activePair = useStore((s) => s.activePair);
  const activeTimeframe = useStore((s) => s.activeTimeframe);

  const { fetchCandles } = useCoinbaseREST();
  const { wsStatus, reconnect } = useCoinbaseWebSocket();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Worker instance ref
  const workerRef = useRef(null);
  const isMountedRef = useRef(true);

  // =========================================================================
  //  Initialize indicator worker
  // =========================================================================
  useEffect(() => {
    workerRef.current = new Worker(
      new URL('../workers/indicators.worker.js', import.meta.url),
      { type: 'module' }
    );

    workerRef.current.onmessage = (event) => {
      const { type, payload } = event.data;

      if (type === 'RESULT') {
        const store = useStore.getState();
        if (typeof store.setIndicators === 'function') {
          store.setIndicators(payload);
        }
      } else if (type === 'CALCULATE_MULTI_RESULT') {
        // Multi-timeframe indicator results for VIPER
        const store = useStore.getState();
        if (typeof store.setIndicators === 'function') {
          // Store multi-TF indicators under namespaced keys
          const merged = {};
          for (const [tf, indicators] of Object.entries(payload)) {
            for (const [key, value] of Object.entries(indicators)) {
              merged[`${tf}_${key}`] = value;
            }
            // Also store the aggregated candles
            if (payload[`${tf}_candles`]) {
              store.setCandles(tf, payload[`${tf}_candles`]);
            }
          }
          store.setIndicators(merged);
        }
      } else if (type === 'AGGREGATE_RESULT') {
        // Store aggregated candles and compute indicators for them
        const store = useStore.getState();
        store.setCandles(payload.timeframe, payload.candles);
        // Trigger indicator computation for this aggregated timeframe
        if (workerRef.current && payload.candles && payload.candles.length > 0) {
          workerRef.current.postMessage({
            type: 'CALCULATE_MULTI',
            payload: {
              candles: payload.candles,
              timeframeLabel: payload.timeframe,
              indicators: ALL_INDICATORS,
              params: {},
            },
          });
        }
      // ---- Scanner worker results ----
      } else if (type === 'SCANNER_RESULT') {
        const store = useStore.getState();
        const { pair, indicators: scanInd, timeframeLabel } = payload;
        if (timeframeLabel === 'ONE_MINUTE') {
          // Primary 1m indicators for this scanner pair
          store.setScannerIndicators(pair, {
            ...(store.scannerIndicators[pair] || {}),
            ...scanInd,
          });
          // Run regime detection for this pair after indicators computed
          triggerScannerRegime(pair, scanInd);
        } else {
          // Multi-TF scanner indicators — namespace under timeframe prefix
          const namespaced = {};
          for (const [key, value] of Object.entries(scanInd)) {
            namespaced[`${timeframeLabel}_${key}`] = value;
          }
          store.setScannerIndicators(pair, {
            ...(store.scannerIndicators[pair] || {}),
            ...namespaced,
          });
        }
      } else if (type === 'SCANNER_AGGREGATE_RESULT') {
        const store = useStore.getState();
        const { pair, timeframe, candles } = payload;
        store.setScannerCandles(pair, timeframe, candles);
        // Compute indicators for the aggregated timeframe
        if (workerRef.current && candles && candles.length > 0) {
          workerRef.current.postMessage({
            type: 'CALCULATE_SCANNER',
            payload: {
              pair,
              candles,
              timeframeLabel: timeframe,
              indicators: ALL_INDICATORS,
              params: {},
            },
          });
        }
      } else if (type === 'SCANNER_REGIME_RESULT') {
        const store = useStore.getState();
        store.setScannerRegime(payload.pair, payload.regime);
      } else if (type === 'ERROR') {
        console.error('[indicators.worker] Error:', payload.message);
      }
    };

    workerRef.current.onerror = (err) => {
      console.error('[indicators.worker] Worker error:', err);
    };

    return () => {
      isMountedRef.current = false;
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
    };
  }, []);

  // =========================================================================
  //  Trigger regime detection for a scanner pair
  // =========================================================================
  const triggerScannerRegime = useCallback((pair, indicators) => {
    if (!workerRef.current) return;
    const candles1m = useStore.getState().scannerCandles[pair]?.['ONE_MINUTE'] || [];
    const lastIdx = candles1m.length - 1;
    if (lastIdx < 0) return;

    const price = candles1m[lastIdx]?.close;
    const sma200 = indicators.sma200?.[lastIdx];
    const ema9 = indicators.ema9?.[lastIdx];
    const ema21 = indicators.ema21?.[lastIdx];
    const ema50 = indicators.ema50?.[lastIdx];
    const adx = indicators.adx?.[lastIdx];
    const rsi = indicators.rsi?.[lastIdx];

    // Bollinger band width for regime detection
    const bbUpper = indicators.bbands?.upper?.[lastIdx];
    const bbLower = indicators.bbands?.lower?.[lastIdx];
    const bbMiddle = indicators.bbands?.middle?.[lastIdx];
    let bbWidth = null;
    let bbWidthAvg = null;
    if (bbUpper != null && bbLower != null && bbMiddle != null && bbMiddle !== 0) {
      bbWidth = (bbUpper - bbLower) / bbMiddle;
      // Approximate average from last 20 bars
      let widthSum = 0;
      let widthCount = 0;
      for (let i = Math.max(0, lastIdx - 19); i <= lastIdx; i++) {
        const u = indicators.bbands?.upper?.[i];
        const l = indicators.bbands?.lower?.[i];
        const m = indicators.bbands?.middle?.[i];
        if (u != null && l != null && m != null && m !== 0) {
          widthSum += (u - l) / m;
          widthCount++;
        }
      }
      bbWidthAvg = widthCount > 0 ? widthSum / widthCount : bbWidth;
    }

    workerRef.current.postMessage({
      type: 'SCANNER_REGIME',
      payload: { pair, price, sma200, ema9, ema21, ema50, adx, rsi, bbWidth, bbWidthAvg },
    });
  }, []);

  // =========================================================================
  //  Fetch scanner data for all scanner pairs (1m candles via REST)
  // =========================================================================
  const fetchScannerData = useCallback(async () => {
    const state = useStore.getState();
    if (!state.scannerEnabled) return;

    const pairs = state.scannerPairs || [];
    const activePair = state.activePair;
    const now = Date.now();
    const oneMinMs = 60 * 1000;
    const startMs = now - oneMinMs * 300; // 300 bars = 5 hours

    for (let i = 0; i < pairs.length; i++) {
      const pair = pairs[i];

      // Skip activePair — its data already exists in global candles store
      // We'll mirror it instead
      if (pair === activePair) {
        // Mirror active pair data to scanner store
        const global1m = state.candles['ONE_MINUTE'];
        if (global1m && global1m.length > 0) {
          useStore.getState().setScannerCandles(pair, 'ONE_MINUTE', global1m);
          // Mirror global indicators to scanner store
          const globalInd = state.indicators;
          if (globalInd && Object.keys(globalInd).length > 0) {
            useStore.getState().setScannerIndicators(pair, globalInd);
          }
        }
        continue;
      }

      // Stagger requests to avoid rate limiting
      if (i > 0) {
        await new Promise((r) => setTimeout(r, SCANNER_STAGGER_MS));
      }

      try {
        const params = {
          granularity: 'ONE_MINUTE',
          start: Math.floor(startMs / 1000).toString(),
          end: Math.floor(now / 1000).toString(),
        };

        const response = await coinbaseREST.getProductCandles(pair, params);
        const rawCandles = response.candles || response || [];
        const candles = rawCandles.map((c) => ({
          timestamp: parseInt(c.start, 10) * 1000,
          open: parseFloat(c.open),
          high: parseFloat(c.high),
          low: parseFloat(c.low),
          close: parseFloat(c.close),
          volume: parseFloat(c.volume),
        })).sort((a, b) => a.timestamp - b.timestamp);

        if (candles.length === 0) continue;

        // Store scanner candles
        useStore.getState().setScannerCandles(pair, 'ONE_MINUTE', candles);

        // Stagger worker messages
        await new Promise((r) => setTimeout(r, SCANNER_WORKER_STAGGER_MS));

        // Compute 1m indicators
        if (workerRef.current) {
          workerRef.current.postMessage({
            type: 'CALCULATE_SCANNER',
            payload: {
              pair,
              candles,
              timeframeLabel: 'ONE_MINUTE',
              indicators: ALL_INDICATORS,
              params: {},
            },
          });

          // Aggregate to 5m and 15m for VIPER COIL/LUNGE
          workerRef.current.postMessage({
            type: 'AGGREGATE_SCANNER',
            payload: { pair, candles1m: candles, targetTimeframe: 'FIVE_MINUTE' },
          });

          await new Promise((r) => setTimeout(r, SCANNER_WORKER_STAGGER_MS));

          workerRef.current.postMessage({
            type: 'AGGREGATE_SCANNER',
            payload: { pair, candles1m: candles, targetTimeframe: 'FIFTEEN_MINUTE' },
          });
        }
      } catch (err) {
        // Isolate failure per pair — other pairs still fetch
        console.warn(`[Scanner] Failed to fetch candles for ${pair}:`, err.message);
      }
    }
  }, []);

  // =========================================================================
  //  Calculate indicators for given candle data
  // =========================================================================
  const calculateIndicators = useCallback((candles) => {
    if (!workerRef.current || !candles || candles.length === 0) return;

    workerRef.current.postMessage({
      type: 'CALCULATE',
      payload: {
        candles,
        indicators: ALL_INDICATORS,
        params: {},
      },
    });
  }, []);

  // =========================================================================
  //  Fetch initial data and recalculate on pair/timeframe change
  // =========================================================================
  // =========================================================================
  //  Aggregate 1m candles to 5m/15m for VIPER and compute multi-TF indicators
  // =========================================================================
  const computeViperMultiTF = useCallback((candles1m) => {
    if (!workerRef.current || !candles1m || candles1m.length < 30) return;

    // Request aggregation to 5m
    workerRef.current.postMessage({
      type: 'AGGREGATE',
      payload: { candles1m, targetTimeframe: 'FIVE_MINUTE' },
    });

    // Request aggregation to 15m
    workerRef.current.postMessage({
      type: 'AGGREGATE',
      payload: { candles1m, targetTimeframe: 'FIFTEEN_MINUTE' },
    });

    // Compute indicators on 1m candles for STRIKE mode
    workerRef.current.postMessage({
      type: 'CALCULATE_MULTI',
      payload: {
        candles: candles1m,
        timeframeLabel: 'ONE_MINUTE',
        indicators: ALL_INDICATORS,
        params: {},
      },
    });
  }, []);

  const fetchData = useCallback(async () => {
    if (!activePair || !activeTimeframe) return;

    setLoading(true);
    setError(null);

    try {
      // Calculate time range based on timeframe
      const now = Date.now();
      const timeframeMs = {
        ONE_MINUTE: 60 * 1000,
        FIVE_MINUTE: 5 * 60 * 1000,
        FIFTEEN_MINUTE: 15 * 60 * 1000,
        ONE_HOUR: 60 * 60 * 1000,
        FOUR_HOUR: 4 * 60 * 60 * 1000,
        ONE_DAY: 24 * 60 * 60 * 1000,
        ONE_WEEK: 7 * 24 * 60 * 60 * 1000,
      };

      // Fetch 300 candles worth of data
      const barMs = timeframeMs[activeTimeframe] || timeframeMs.FIVE_MINUTE;
      const start = now - barMs * 300;

      const candles = await fetchCandles(activePair, activeTimeframe, start, now);

      if (!isMountedRef.current) return;

      if (candles && candles.length > 0) {
        calculateIndicators(candles);
      } else {
        setError('No candle data available');
      }

      // VIPER multi-timeframe: always fetch 1m candles (240 bars = 4 hours) when enabled
      const viperEnabled = useStore.getState().viperEnabled;
      if (viperEnabled) {
        const oneMinMs = 60 * 1000;
        const viperStart = now - oneMinMs * 240;
        const candles1m = activeTimeframe === 'ONE_MINUTE'
          ? candles
          : await fetchCandles(activePair, 'ONE_MINUTE', viperStart, now);

        if (isMountedRef.current && candles1m && candles1m.length > 0) {
          useStore.getState().setCandles('ONE_MINUTE', candles1m);
          computeViperMultiTF(candles1m);
        }
      }
    } catch (err) {
      if (isMountedRef.current) {
        setError(err.message || 'Failed to fetch market data');
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [activePair, activeTimeframe, fetchCandles, calculateIndicators, computeViperMultiTF]);

  // =========================================================================
  //  Run on mount and when pair/timeframe changes
  // =========================================================================
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // =========================================================================
  //  Scanner data: initial fetch + 30s polling
  // =========================================================================
  useEffect(() => {
    if (!isMountedRef.current) return;

    // Initial fetch (delayed slightly so active pair data loads first)
    const initialTimer = setTimeout(() => {
      fetchScannerData();
    }, 2000);

    // 30-second polling
    const pollTimer = setInterval(() => {
      if (isMountedRef.current) {
        fetchScannerData();
      }
    }, SCANNER_POLL_INTERVAL_MS);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(pollTimer);
    };
  }, [fetchScannerData]);

  // =========================================================================
  //  Mirror activePair global data to scanner store when it changes
  // =========================================================================
  useEffect(() => {
    const state = useStore.getState();
    const pairs = state.scannerPairs || [];
    if (!pairs.includes(activePair)) return;

    const global1m = state.candles['ONE_MINUTE'];
    if (global1m && global1m.length > 0) {
      state.setScannerCandles(activePair, 'ONE_MINUTE', global1m);
    }
    const globalInd = state.indicators;
    if (globalInd && Object.keys(globalInd).length > 0) {
      state.setScannerIndicators(activePair, globalInd);
    }
  }, [activePair]);

  // =========================================================================
  //  Recalculate indicators when candles update from WebSocket
  // =========================================================================
  useEffect(() => {
    let prevCandles = useStore.getState().candles;
    let viperRecalcTimer = null;
    const unsubscribe = useStore.subscribe((state) => {
      if (state.candles !== prevCandles) {
        prevCandles = state.candles;
        const tf = state.activeTimeframe;
        const candleData = state.candles[tf];
        if (candleData && candleData.length > 0) {
          calculateIndicators(candleData);
        }
        // Recompute VIPER multi-TF when 1m candles update (throttled to every 30s)
        if (state.viperEnabled && !viperRecalcTimer) {
          viperRecalcTimer = setTimeout(() => {
            viperRecalcTimer = null;
            const s = useStore.getState();
            const candles1m = s.candles['ONE_MINUTE'];
            if (candles1m && candles1m.length > 30) {
              computeViperMultiTF(candles1m);
            }
          }, 30000);
        }
      }
    });
    return () => { unsubscribe(); if (viperRecalcTimer) clearTimeout(viperRecalcTimer); };
  }, [calculateIndicators, computeViperMultiTF]);

  // =========================================================================
  //  refreshData — manual refresh
  // =========================================================================
  const refreshData = useCallback(() => {
    fetchData();
  }, [fetchData]);

  return {
    loading,
    error,
    refreshData,
  };
}
