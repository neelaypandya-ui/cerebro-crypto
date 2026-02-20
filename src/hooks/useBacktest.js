/* ============================================================
   Cerebro Crypto — useBacktest Hook
   ============================================================
   Manages backtesting via the backtest Web Worker.
   Sends data to the worker, tracks progress, and stores
   the results for display.
   ============================================================ */

import { useState, useRef, useCallback, useEffect } from 'react';
import useStore from '../store';

/**
 * Hook for running backtests.
 *
 * @returns {{
 *   running: boolean,
 *   progress: number,
 *   progressDate: number|null,
 *   results: Object|null,
 *   error: string|null,
 *   runBacktest: Function,
 *   cancelBacktest: Function,
 *   clearResults: Function
 * }}
 */
export default function useBacktest() {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressDate, setProgressDate] = useState(null);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);

  const workerRef = useRef(null);

  // =========================================================================
  //  Initialize worker (lazy — only when a backtest is run)
  // =========================================================================
  const getWorker = useCallback(() => {
    if (!workerRef.current) {
      workerRef.current = new Worker(
        new URL('../workers/backtest.worker.js', import.meta.url),
        { type: 'module' }
      );

      workerRef.current.onmessage = (event) => {
        const { type, payload } = event.data;

        switch (type) {
          case 'PROGRESS':
            setProgress(payload.percent);
            setProgressDate(payload.currentDate);
            break;

          case 'BACKTEST_RESULT':
            setResults(payload);
            setRunning(false);
            setProgress(100);

            // Store results in Zustand for other components
            const store = useStore.getState();
            if (typeof store.setBacktestResults === 'function') {
              store.setBacktestResults(payload);
            }
            break;

          case 'ERROR':
            setError(payload.message);
            setRunning(false);
            break;

          default:
            break;
        }
      };

      workerRef.current.onerror = (err) => {
        setError(err.message || 'Backtest worker error');
        setRunning(false);
      };
    }

    return workerRef.current;
  }, []);

  // =========================================================================
  //  Clean up worker on unmount
  // =========================================================================
  useEffect(() => {
    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
    };
  }, []);

  // =========================================================================
  //  Run a backtest
  // =========================================================================
  /**
   * @param {Object} params
   * @param {Object[]} params.candles - OHLCV candle data
   * @param {string} params.strategy - strategy identifier (e.g. 'momentum', 'breakout')
   * @param {number} [params.startingCapital=25000] - starting capital
   * @param {Object} [params.riskSettings] - risk/position sizing overrides
   */
  const runBacktest = useCallback((params) => {
    const {
      candles,
      strategy,
      startingCapital = 25000,
      riskSettings = {},
    } = params;

    // Validation
    if (!candles || candles.length === 0) {
      setError('No candle data provided. Fetch candles first.');
      return;
    }

    if (!strategy) {
      setError('No strategy specified.');
      return;
    }

    // Reset state
    setRunning(true);
    setProgress(0);
    setProgressDate(null);
    setResults(null);
    setError(null);

    // If candles are not provided, try to use store candles
    const candleData = candles || useStore.getState().candles || [];
    if (candleData.length === 0) {
      setError('No candle data available in store. Fetch data first.');
      setRunning(false);
      return;
    }

    const worker = getWorker();
    worker.postMessage({
      type: 'RUN_BACKTEST',
      payload: {
        candles: candleData,
        strategy,
        startingCapital,
        riskSettings: {
          ...useStore.getState().riskSettings,
          ...riskSettings,
        },
      },
    });
  }, [getWorker]);

  // =========================================================================
  //  Cancel a running backtest
  // =========================================================================
  const cancelBacktest = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }
    setRunning(false);
    setProgress(0);
    setError('Backtest cancelled');
  }, []);

  // =========================================================================
  //  Clear results
  // =========================================================================
  const clearResults = useCallback(() => {
    setResults(null);
    setError(null);
    setProgress(0);
    setProgressDate(null);
  }, []);

  return {
    running,
    progress,
    progressDate,
    results,
    error,
    runBacktest,
    cancelBacktest,
    clearResults,
  };
}
