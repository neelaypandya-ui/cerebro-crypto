/* ============================================================
   Cerebro Crypto — Strategy Execution Engine
   ============================================================
   Connects strategies to live market data and order execution.
   Candle-close driven evaluation with signal confluence,
   risk pipeline, and circuit breaker protection.
   ============================================================ */

import { useEffect, useRef, useCallback } from 'react';
import useStore from '../store';
import useOrders from './useOrders';
import { STRATEGY_REGISTRY } from '../strategies/index.js';
import { evaluateSpread } from '../utils/spreadMonitor.js';
import { checkCorrelation } from '../utils/correlationGuard.js';
import { calculatePositionSize } from '../utils/riskManager.js';
import { estimateSlippage } from '../utils/slippageEstimator.js';
import { calculateFeeImpact } from '../utils/feeCalculator.js';
import { createCircuitBreaker, canTrade, recordTrade } from '../utils/scalpCircuitBreaker.js';
import { saveSignal } from '../db/indexedDB.js';

// Minimum time between live orders (ms)
const LIVE_ORDER_COOLDOWN_MS = 5000;
// Fallback evaluation interval (ms)
const EVAL_INTERVAL_MS = 2000;
// Minimum confluence score to execute
const MIN_CONFLUENCE_SCORE = 2.0;

export default function useStrategyEngine() {
  const { submitOrder } = useOrders();

  // Keep submitOrder ref current for non-render callbacks
  const submitOrderRef = useRef(submitOrder);
  useEffect(() => {
    submitOrderRef.current = submitOrder;
  }, [submitOrder]);

  // Engine internal state (not React state — avoids re-renders)
  const engineRef = useRef({
    circuitBreaker: null,
    lastOrderTimestamp: 0,
    lastEvalCandleTimestamps: {},  // { strategyKey: lastCandleTimestamp }
    lastCandleLength: 0,
    unsubscribe: null,
    intervalId: null,
    running: false,
  });

  // =========================================================================
  //  Log helper
  // =========================================================================
  const log = useCallback((type, message, data = {}) => {
    useStore.getState().addEngineLog({ type, message, ...data });
  }, []);

  // =========================================================================
  //  Risk Pipeline — run all guards in sequence
  // =========================================================================
  const runRiskPipeline = useCallback((signal, state) => {
    const {
      orderBook, positions, riskSettings, tradingMode,
      paperPortfolio, portfolio,
    } = state;
    const pair = state.activePair;
    const isScalp = signal.strategyKey?.includes('scalp');

    // 1. Spread guard — block scalps when spread > 0.08%
    const bestBid = orderBook.bids?.[0]?.[0];
    const bestAsk = orderBook.asks?.[0]?.[0];
    if (bestBid && bestAsk) {
      const spreadResult = evaluateSpread(parseFloat(bestBid), parseFloat(bestAsk));
      if (isScalp && !spreadResult.scalpSafe) {
        return { blocked: true, reason: `Spread guard: ${spreadResult.message}` };
      }
    }

    // 2. Correlation guard — reduce size for correlated positions
    const correlationResult = checkCorrelation(pair, positions);
    let sizeFactor = 1;
    if (correlationResult.reducedSize) {
      sizeFactor = correlationResult.reducedSize;
    }

    // 3. Position sizing
    const portfolioValue = tradingMode === 'paper'
      ? paperPortfolio.balance
      : portfolio.totalValue || portfolio.availableCash || 0;
    let positionSize = calculatePositionSize(portfolioValue, riskSettings);
    positionSize *= sizeFactor;

    if (positionSize <= 0) {
      return { blocked: true, reason: 'Position size is zero' };
    }

    // Get current price for sizing
    const tickers = state.tickers || {};
    const currentPrice = tickers[pair]?.price;
    if (!currentPrice || currentPrice <= 0) {
      return { blocked: true, reason: 'No price data for position sizing' };
    }

    const baseSize = positionSize / currentPrice;

    // 4. Slippage guard
    const bookSide = signal.direction === 'long' ? orderBook.asks : orderBook.bids;
    if (bookSide && bookSide.length > 0) {
      const slippageResult = estimateSlippage(bookSide, baseSize, signal.direction === 'long' ? 'buy' : 'sell');
      if (slippageResult.blocked) {
        return { blocked: true, reason: `Slippage guard: ${slippageResult.reason}` };
      }
    }

    // 5. Fee impact guard
    const strategyDef = STRATEGY_REGISTRY[signal.strategyKey];
    const riskOverrides = strategyDef?.riskOverrides || {};
    const tpR = riskOverrides.tp1R || riskSettings.tp1R || 1.5;
    const slPct = riskOverrides.stopLossPct || riskSettings.stopLossPct || 2;
    const expectedTP = currentPrice * (1 + (slPct / 100) * tpR);

    const feeResult = calculateFeeImpact(currentPrice, expectedTP, baseSize);
    if (feeResult.netProfit < 0) {
      return { blocked: true, reason: `Fee guard: net profit after fees is negative ($${feeResult.netProfit.toFixed(2)})` };
    }

    // 6. Rate limiter — 5s minimum between live orders
    if (tradingMode === 'live') {
      const timeSinceLast = Date.now() - engineRef.current.lastOrderTimestamp;
      if (timeSinceLast < LIVE_ORDER_COOLDOWN_MS) {
        return { blocked: true, reason: `Rate limit: ${Math.ceil((LIVE_ORDER_COOLDOWN_MS - timeSinceLast) / 1000)}s cooldown` };
      }
    }

    return {
      blocked: false,
      positionSize,
      baseSize,
      currentPrice,
      sizeFactor,
      correlationWarning: correlationResult.reason,
    };
  }, []);

  // =========================================================================
  //  Execute an order through the bridge
  // =========================================================================
  const executeOrder = useCallback(async (signal, riskResult, state) => {
    const pair = state.activePair;

    const orderData = {
      pair,
      side: signal.direction === 'long' ? 'BUY' : 'SELL',
      orderType: 'market',
      baseSize: riskResult.baseSize,
      quoteSize: riskResult.positionSize,
      strategy: signal.strategyKey,
      notionalValue: riskResult.positionSize,
    };

    log('EXECUTE', `Submitting ${orderData.side} ${pair} — $${riskResult.positionSize.toFixed(2)} (${signal.strategyKey})`, {
      strategy: signal.strategyKey,
      pair,
      direction: signal.direction,
    });

    engineRef.current.lastOrderTimestamp = Date.now();

    try {
      const result = await submitOrderRef.current(orderData);
      if (result.success) {
        log('EXECUTE', `Order filled: ${result.orderId}`, { orderId: result.orderId });

        // Persist signal to IndexedDB
        saveSignal({
          strategy: signal.strategyKey,
          pair,
          direction: signal.direction,
          reason: signal.reason,
          confidence: signal.confidence,
          confluenceScore: signal.confluenceScore,
          executed: true,
        }).catch(() => {});

        // Add to signal history
        useStore.getState().addSignalHistory({
          id: result.orderId,
          strategy: signal.strategyKey,
          pair,
          direction: signal.direction,
          reason: signal.reason,
          confidence: signal.confidence,
          timestamp: Date.now(),
          executed: true,
        });
      } else {
        log('BLOCKED', `Order rejected: ${(result.errors || []).join('; ')}`, { strategy: signal.strategyKey });
      }
      return result;
    } catch (err) {
      log('ERROR', `Order error: ${err.message}`, { strategy: signal.strategyKey });
      return { success: false, errors: [err.message] };
    }
  }, [log]);

  // =========================================================================
  //  Core evaluation cycle
  // =========================================================================
  const evaluate = useCallback(() => {
    const state = useStore.getState();

    // Gate checks
    if (!state.botRunning) return;
    if (state.wsStatus !== 'connected') {
      if (engineRef.current.running) {
        useStore.getState().setEngineStatus('paused');
        log('SKIP', 'WebSocket disconnected — engine paused');
        engineRef.current.running = false;
      }
      return;
    }

    // Restore running status if we were paused
    if (!engineRef.current.running) {
      useStore.getState().setEngineStatus('running');
      log('SIGNAL', 'WebSocket reconnected — engine resumed');
      engineRef.current.running = true;
    }

    // Circuit breaker check
    if (engineRef.current.circuitBreaker) {
      const cbResult = canTrade(engineRef.current.circuitBreaker);
      if (!cbResult.allowed) {
        useStore.getState().setEngineStatus('paused');
        log('BLOCKED', `Circuit breaker: ${cbResult.reason}`);
        return;
      }
    }

    const activeTimeframe = state.activeTimeframe;
    const candles = state.candles[activeTimeframe];
    if (!candles || candles.length < 30) return; // need enough data

    const indicators = state.indicators;
    const orderBook = state.orderBook;
    const lastIdx = candles.length - 1;
    const lastCandle = candles[lastIdx];

    // Update last eval timestamp
    useStore.setState({ lastEngineEval: Date.now() });

    // Collect signals from all active strategies
    const signalBatch = [];

    for (const [key, isActive] of Object.entries(state.activeStrategies)) {
      if (!isActive) continue;
      const strategy = STRATEGY_REGISTRY[key];
      if (!strategy) continue;

      // Deduplication: skip if already evaluated this candle
      const candleTs = lastCandle.timestamp;
      if (engineRef.current.lastEvalCandleTimestamps[key] === candleTs) continue;
      engineRef.current.lastEvalCandleTimestamps[key] = candleTs;

      // Check exits first for open positions owned by this strategy
      const ownedPositions = (state.positions || []).filter(
        (p) => p.strategy === key && p.status === 'open'
      );

      for (const position of ownedPositions) {
        try {
          const exitSignal = strategy.checkExit(position, candles, indicators, lastIdx);
          if (exitSignal) {
            log('SIGNAL', `Exit signal: ${key} — ${exitSignal.reason || 'Strategy exit'}`, {
              strategy: key,
              pair: position.pair,
            });
            // TODO: Implement position close via order bridge
            // For now, log the exit signal
          }
        } catch (err) {
          log('ERROR', `checkExit error (${key}): ${err.message}`);
        }
      }

      // Check entry
      try {
        const entrySignal = strategy.checkEntry(candles, indicators, orderBook, lastIdx);
        if (entrySignal && entrySignal.entry) {
          // Populate strategy signals in store
          useStore.getState().setStrategySignal(key, {
            ...entrySignal,
            timestamp: Date.now(),
            pair: state.activePair,
          });

          // Add to store signals list
          useStore.getState().addSignal({
            id: `sig-${Date.now()}-${key}`,
            strategy: key,
            pair: state.activePair,
            type: entrySignal.direction === 'long' ? 'buy' : 'sell',
            reason: entrySignal.reason,
            confidence: entrySignal.confidence,
            timestamp: Date.now(),
          });

          signalBatch.push({
            strategyKey: key,
            ...entrySignal,
          });

          log('SIGNAL', `Entry signal: ${key} — ${entrySignal.reason}`, {
            strategy: key,
            confidence: entrySignal.confidence,
            direction: entrySignal.direction,
          });
        }
      } catch (err) {
        log('ERROR', `checkEntry error (${key}): ${err.message}`);
      }
    }

    // Signal confluence: weight and aggregate
    if (signalBatch.length === 0) return;

    const currentRegime = state.currentRegime;
    const weightedSignals = signalBatch.map((sig) => {
      const strategy = STRATEGY_REGISTRY[sig.strategyKey];
      // Base weight from confidence
      const confWeights = { high: 3, medium: 2, low: 1 };
      let weight = confWeights[sig.confidence] || 1;

      // Regime match bonus
      if (strategy?.meta?.regimes?.includes(currentRegime)) {
        weight *= 1.5;
      }

      return { ...sig, weight };
    });

    // Total weighted score
    const totalScore = weightedSignals.reduce((sum, s) => sum + s.weight, 0);

    if (totalScore < MIN_CONFLUENCE_SCORE) {
      log('SKIP', `Confluence score ${totalScore.toFixed(1)} below threshold ${MIN_CONFLUENCE_SCORE}`, {
        signalCount: signalBatch.length,
      });
      return;
    }

    // Pick highest-weighted signal as primary
    weightedSignals.sort((a, b) => b.weight - a.weight);
    const primary = weightedSignals[0];
    primary.confluenceScore = totalScore;

    log('SIGNAL', `Confluence met: score ${totalScore.toFixed(1)} — primary: ${primary.strategyKey} (weight ${primary.weight.toFixed(1)})`, {
      signalCount: signalBatch.length,
    });

    // Run risk pipeline
    const riskResult = runRiskPipeline(primary, state);

    if (riskResult.blocked) {
      log('BLOCKED', riskResult.reason, { strategy: primary.strategyKey });

      // Persist blocked signal
      saveSignal({
        strategy: primary.strategyKey,
        pair: state.activePair,
        direction: primary.direction,
        reason: primary.reason,
        confidence: primary.confidence,
        confluenceScore: totalScore,
        executed: false,
        blockedReason: riskResult.reason,
      }).catch(() => {});

      return;
    }

    // Execute order
    executeOrder(primary, riskResult, state);
  }, [log, runRiskPipeline, executeOrder]);

  // =========================================================================
  //  Record trade results for circuit breaker + analytics
  // =========================================================================
  const handlePositionClosed = useCallback((tradeResult) => {
    // Update circuit breaker
    if (engineRef.current.circuitBreaker) {
      engineRef.current.circuitBreaker = recordTrade(
        engineRef.current.circuitBreaker,
        tradeResult.netPnL || 0,
        tradeResult.fees || 0
      );

      // Sync circuit breaker stats to scalp session in store
      useStore.getState().updateScalpSession({
        streak: engineRef.current.circuitBreaker.consecutiveLosses,
        wins: engineRef.current.circuitBreaker.wins,
        losses: engineRef.current.circuitBreaker.losses,
        netPnL: engineRef.current.circuitBreaker.sessionPnL,
        fees: engineRef.current.circuitBreaker.sessionFees,
        trades: engineRef.current.circuitBreaker.totalTrades,
        pausedUntil: engineRef.current.circuitBreaker.pausedUntil,
        disabled: engineRef.current.circuitBreaker.disabled,
      });
    }

    // Update session analytics
    useStore.getState().updateSessionAnalytics(tradeResult);
  }, []);

  // =========================================================================
  //  Lifecycle — start/stop engine when botRunning changes
  // =========================================================================
  useEffect(() => {
    // Subscribe to botRunning changes
    const unsubscribe = useStore.subscribe(
      (state, prevState) => {
        const wasRunning = prevState?.botRunning;
        const isRunning = state.botRunning;

        // Bot just turned ON
        if (isRunning && !wasRunning) {
          startEngine();
        }

        // Bot just turned OFF
        if (!isRunning && wasRunning) {
          stopEngine();
        }
      }
    );

    // Check initial state
    if (useStore.getState().botRunning) {
      startEngine();
    }

    return () => {
      unsubscribe();
      stopEngine();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // =========================================================================
  //  Start engine
  // =========================================================================
  function startEngine() {
    const state = useStore.getState();
    const eng = engineRef.current;

    // Cleanup any existing subscriptions
    if (eng.unsubscribe) eng.unsubscribe();
    if (eng.intervalId) clearInterval(eng.intervalId);

    // Initialize circuit breaker
    const startingBalance = state.tradingMode === 'paper'
      ? state.paperPortfolio.balance
      : state.portfolio.totalValue || state.portfolio.availableCash || 0;
    eng.circuitBreaker = createCircuitBreaker(startingBalance);
    eng.lastEvalCandleTimestamps = {};
    eng.lastCandleLength = 0;
    eng.running = true;

    useStore.getState().setEngineStatus('running');
    log('SIGNAL', 'Engine started');

    // Subscribe to candle changes
    eng.unsubscribe = useStore.subscribe((newState, prevState) => {
      if (!newState.botRunning) return;

      const tf = newState.activeTimeframe;
      const newCandles = newState.candles[tf];
      const prevCandles = prevState?.candles?.[tf];

      // Trigger evaluation when candle array length changes (new candle)
      if (newCandles && prevCandles && newCandles.length !== prevCandles.length) {
        evaluate();
      }
    });

    // Fallback 2-second interval for edge cases
    eng.intervalId = setInterval(() => {
      if (!useStore.getState().botRunning) return;
      evaluate();
    }, EVAL_INTERVAL_MS);

    // Subscribe to position removals for circuit breaker tracking
    // (positions closed will be tracked via store subscription)
    const posUnsubscribe = useStore.subscribe((newState, prevState) => {
      if (!prevState) return;
      const prevPositions = prevState.positions || [];
      const newPositions = newState.positions || [];

      // Detect closed positions (removed from array)
      if (prevPositions.length > newPositions.length) {
        const closedIds = new Set(newPositions.map((p) => p.id));
        for (const pos of prevPositions) {
          if (!closedIds.has(pos.id) && pos.strategy && pos.strategy !== 'manual') {
            // Position was closed — compute PnL from position data
            const currentPrice = newState.tickers?.[pos.pair]?.price || pos.currentPrice || pos.entryPrice;
            const grossPnL = pos.direction === 'long'
              ? (currentPrice - pos.entryPrice) * (pos.qty || 0)
              : (pos.entryPrice - currentPrice) * (pos.qty || 0);
            const fees = (pos.fees || 0) * 2; // approximate round-trip

            handlePositionClosed({
              netPnL: grossPnL - fees,
              fees,
              strategy: pos.strategy,
              pair: pos.pair,
            });
          }
        }
      }
    });

    // Store the position unsubscribe in a combined cleanup
    const originalUnsub = eng.unsubscribe;
    eng.unsubscribe = () => {
      originalUnsub();
      posUnsubscribe();
    };
  }

  // =========================================================================
  //  Stop engine
  // =========================================================================
  function stopEngine() {
    const eng = engineRef.current;

    if (eng.unsubscribe) {
      eng.unsubscribe();
      eng.unsubscribe = null;
    }
    if (eng.intervalId) {
      clearInterval(eng.intervalId);
      eng.intervalId = null;
    }

    eng.running = false;
    eng.lastEvalCandleTimestamps = {};

    useStore.getState().setEngineStatus('idle');
    log('SIGNAL', 'Engine stopped');
  }
}
