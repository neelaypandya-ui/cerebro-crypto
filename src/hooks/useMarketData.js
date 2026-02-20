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

// All indicator names to compute
const ALL_INDICATORS = [
  'ema9', 'ema21', 'ema50', 'sma200',
  'rsi', 'macd', 'bbands', 'atr', 'adx', 'vwap',
  'volumeSMA20', 'high20', 'low20',
];

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
    } catch (err) {
      if (isMountedRef.current) {
        setError(err.message || 'Failed to fetch market data');
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [activePair, activeTimeframe, fetchCandles, calculateIndicators]);

  // =========================================================================
  //  Run on mount and when pair/timeframe changes
  // =========================================================================
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // =========================================================================
  //  Recalculate indicators when candles update from WebSocket
  // =========================================================================
  useEffect(() => {
    let prevCandles = useStore.getState().candles;
    const unsubscribe = useStore.subscribe((state) => {
      if (state.candles !== prevCandles) {
        prevCandles = state.candles;
        const tf = state.activeTimeframe;
        const candleData = state.candles[tf];
        if (candleData && candleData.length > 0) {
          calculateIndicators(candleData);
        }
      }
    });
    return unsubscribe;
  }, [calculateIndicators]);

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
