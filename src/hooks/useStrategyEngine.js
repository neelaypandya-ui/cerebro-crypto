/* ============================================================
   Cerebro Crypto — Strategy Execution Engine
   ============================================================
   Connects HYDRA and VIPER strategies to live market data and
   order execution. HYDRA uses candle-close driven evaluation
   with 5-dimensional scoring. VIPER runs 3 competing modes
   (STRIKE/COIL/LUNGE) with edge detection every 15 minutes.
   ============================================================ */

import { useEffect, useRef, useCallback } from 'react';
import useStore from '../store';
import useOrders from './useOrders';
import { hydra } from '../strategies/hydra/index.js';
import { viper } from '../strategies/viper/index.js';
import { detectEdge } from '../strategies/viper/edgeDetector.js';
import { evaluateRatchet, getAllowedModes, getSizingMultiplier } from '../strategies/viper/ratchet.js';
import { evaluateStatus, recordDay, loadLedger, saveLedger } from '../strategies/viper/performanceLedger.js';
import { calculateAllocation } from '../utils/allocationManager.js';
import { recalibrateThreshold, loadThreshold, saveThreshold } from '../strategies/hydra/selfCalibration.js';
import { updateSessionProfile } from '../strategies/hydra/sessionProfiles.js';
import { evaluateSpread } from '../utils/spreadMonitor.js';
import { checkCorrelation } from '../utils/correlationGuard.js';
import { estimateSlippage } from '../utils/slippageEstimator.js';
import { calculateFeeImpact } from '../utils/feeCalculator.js';
import { createCircuitBreaker, canTrade, recordTrade } from '../utils/scalpCircuitBreaker.js';
import { saveSignal } from '../db/indexedDB.js';

// Minimum time between live orders (ms)
const LIVE_ORDER_COOLDOWN_MS = 5000;
// Fallback evaluation interval (ms)
const EVAL_INTERVAL_MS = 2000;
// Signal expiry (ms) - default 20s
const DEFAULT_SIGNAL_EXPIRY_MS = 20000;
// VIPER edge detector interval (ms) - default 15 min
const EDGE_DETECTOR_INTERVAL_MS = 15 * 60 * 1000;
// VIPER eval interval (faster than HYDRA for scalps)
const VIPER_EVAL_INTERVAL_MS = 1500;

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
    lastEvalCandleTs: null,
    unsubscribe: null,
    intervalId: null,
    running: false,
    completedTrades: [], // For self-calibration
    pairTrades: {},      // Per-pair trade history for session learning
    // Scanner: per-pair candle deduplication timestamps
    pairLastEvalTs: {},  // { 'BTC-USD': 1234567890 }
    // VIPER-specific refs
    viperModeTimerId: null,
    viperEvalIntervalId: null,
    viperLastEvalTs: 0,
    viperCompletedTrades: [],
    dailyResetTimerId: null,
    overnightCutoffTimerId: null,
    viperStrikeState: {
      consecutiveWins: 0,
      lastTradeTs: 0,
      skipNext: false,
    },
  });

  // =========================================================================
  //  Log helper
  // =========================================================================
  const log = useCallback((type, message, data = {}) => {
    useStore.getState().addEngineLog({ type, message, ...data });
  }, []);

  // =========================================================================
  //  HYDRA Activity log helper
  // =========================================================================
  const logActivity = useCallback((message, data = {}) => {
    useStore.getState().addHydraActivity({ message, ...data });
  }, []);

  // =========================================================================
  //  VIPER Activity log helper
  // =========================================================================
  const logViperActivity = useCallback((message, data = {}) => {
    useStore.getState().addViperActivity({ message, ...data });
  }, []);

  // =========================================================================
  //  Risk Pipeline — run guards before order submission
  //  Now allocation-aware: strategyKey determines capital pool
  // =========================================================================
  const runRiskPipeline = useCallback((signal, state, strategyKey = 'hydra') => {
    const { orderBook, positions, tradingMode } = state;
    const pair = signal.pair || state.activePair;

    // 1. Spread guard
    const bestBid = orderBook.bids?.[0]?.[0];
    const bestAsk = orderBook.asks?.[0]?.[0];
    if (bestBid && bestAsk) {
      const spreadResult = evaluateSpread(parseFloat(bestBid), parseFloat(bestAsk));
      if (!spreadResult.scalpSafe) {
        return { blocked: true, reason: `Spread guard: ${spreadResult.message}` };
      }
    }

    // 2. Correlation guard
    const correlationResult = checkCorrelation(pair, positions);
    let sizeFactor = 1;
    if (correlationResult.reducedSize) sizeFactor = correlationResult.reducedSize;

    // 3. Allocation-aware position sizing
    const portfolioValue = state.tradingMode === 'paper'
      ? state.paperPortfolio.balance
      : state.portfolio.totalValue || state.portfolio.availableCash || 0;

    let positionSize;
    if (strategyKey === 'viper') {
      // VIPER manages its own sizing per-mode
      positionSize = signal.positionSizeUSD || 0;

      // Apply ratchet sizing multiplier
      const ratchetMult = getSizingMultiplier(state.viperRatchetLevel || 'NORMAL');
      positionSize *= ratchetMult;

      // Apply allocation-based capital limit
      const allocation = calculateAllocation({
        totalPortfolio: portfolioValue,
        splitConfig: state.allocationConfig,
        viperThreatLevel: state.viperReplacementThreat,
        hydraActive: true,
        viperActive: state.viperEnabled,
      });
      if (positionSize > allocation.viperCapital * 0.15) {
        positionSize = allocation.viperCapital * 0.15; // Cap per trade
      }
    } else {
      // HYDRA sizing
      positionSize = signal.sizing?.positionUSD || 0;
    }

    positionSize *= sizeFactor;
    if (positionSize <= 0) {
      return { blocked: true, reason: 'Position size is zero' };
    }

    // Session-aware sizing: reduce position size during low-liquidity hours (04-12 UTC)
    const currentHourUTC = new Date().getUTCHours();
    const isLowLiquidityHours = currentHourUTC >= 4 && currentHourUTC < 12;
    if (isLowLiquidityHours) {
      positionSize *= 0.5;
    }

    // Dynamic minimum position floor based on fee tier
    const feeTierData = state.feeTier;
    const takerFeeRate = feeTierData?.taker_fee_rate
      ? parseFloat(feeTierData.taker_fee_rate)
      : 0.006;
    // In paper mode, use simulated lower fee rate so trades aren't blocked unrealistically
    const effectiveFeeRate = tradingMode === 'paper' ? Math.min(takerFeeRate, 0.001) : takerFeeRate;
    const MIN_POSITION_USD = tradingMode === 'paper' ? 10 : 50;
    if (positionSize < MIN_POSITION_USD) {
      positionSize = MIN_POSITION_USD;
    }

    const currentPrice = signal.entryPrice || state.tickers?.[pair]?.price;
    if (!currentPrice || currentPrice <= 0) {
      return { blocked: true, reason: 'No price data' };
    }

    const baseSize = signal.baseSize || (positionSize / currentPrice);

    // 4. Slippage guard — only when order book data available
    const bookSide = orderBook.asks;
    if (bookSide && bookSide.length > 2) {
      const slippageResult = estimateSlippage(bookSide, baseSize, 'buy');
      if (slippageResult.blocked) {
        return { blocked: true, reason: `Slippage guard: ${slippageResult.reason}` };
      }
    }

    // 5. Fee impact guard — use actual fee tier (relaxed for paper mode)
    const tp1 = signal.tp1 || currentPrice * 1.01;
    const feeResult = calculateFeeImpact(currentPrice, tp1, baseSize, {
      takerFee: effectiveFeeRate,
    });
    // In live mode: block if net profit is negative after fees
    if (tradingMode === 'live' && feeResult.netProfit < 0) {
      return { blocked: true, reason: `Fee guard: net profit after fees is negative ($${feeResult.netProfit.toFixed(2)})` };
    }
    // In live mode: require minimum $0.50 net profit
    if (tradingMode === 'live' && feeResult.netProfit < 0.50) {
      return { blocked: true, reason: `Fee guard: net profit too small ($${feeResult.netProfit.toFixed(2)} < $0.50)` };
    }

    // 6. Rate limiter
    if (tradingMode === 'live') {
      const timeSinceLast = Date.now() - engineRef.current.lastOrderTimestamp;
      if (timeSinceLast < LIVE_ORDER_COOLDOWN_MS) {
        return { blocked: true, reason: `Rate limit: ${Math.ceil((LIVE_ORDER_COOLDOWN_MS - timeSinceLast) / 1000)}s cooldown` };
      }
    }

    // 7. Cross-strategy pair exclusion: HYDRA + VIPER cannot hold same pair
    const existingOnPair = (state.positions || []).find(
      (p) => p.pair === pair && p.status !== 'closed'
    );
    if (existingOnPair) {
      return { blocked: true, reason: `Already have open ${existingOnPair.strategy?.toUpperCase()} position on ${pair}` };
    }

    return {
      blocked: false,
      positionSize,
      baseSize,
      currentPrice,
      sizeFactor,
    };
  }, []);

  // =========================================================================
  //  Execute an order
  // =========================================================================
  const executeOrder = useCallback(async (signal, riskResult, state) => {
    const pair = signal.pair || state.activePair;
    const hydraSettings = state.hydraSettings || {};

    const orderData = {
      pair,
      side: 'BUY',
      orderType: 'market',
      baseSize: riskResult.baseSize,
      quoteSize: riskResult.positionSize,
      strategy: 'hydra',
      notionalValue: riskResult.positionSize,
      // HYDRA-specific metadata on the position
      hydraScore: signal.hydraScore?.totalScore,
      d1Score: signal.d1Score,
      d2Score: signal.d2Score,
      d3Score: signal.d3Score,
      d4Score: signal.d4Score,
      d5Score: signal.d5Score,
      stopLoss: signal.stopLoss,
      tp1: signal.tp1,
      tp2: signal.tp2,
      trailDistance: signal.trailDistance,
      tp1ClosePct: signal.tp1ClosePct,
      tp2ClosePct: signal.tp2ClosePct,
      sessionHour: signal.sessionHour,
    };

    log('EXECUTE', `HYDRA BUY ${pair} — $${riskResult.positionSize.toFixed(2)} (score: ${signal.hydraScore?.totalScore})`, {
      strategy: 'hydra', pair,
    });

    logActivity(`${pair} scored ${signal.hydraScore?.totalScore}/100 → ENTRY FIRED (size: $${riskResult.positionSize.toFixed(2)})`);

    engineRef.current.lastOrderTimestamp = Date.now();

    try {
      const result = await submitOrderRef.current(orderData);
      if (result.success) {
        log('EXECUTE', `Order filled: ${result.orderId}`, { orderId: result.orderId });

        saveSignal({
          strategy: 'hydra',
          pair,
          direction: 'long',
          reason: signal.reason,
          confidence: signal.confidence,
          hydraScore: signal.hydraScore?.totalScore,
          executed: true,
        }).catch(() => {});

        useStore.getState().addSignalHistory({
          id: result.orderId,
          strategy: 'hydra',
          pair,
          direction: 'long',
          reason: signal.reason,
          confidence: signal.confidence,
          hydraScore: signal.hydraScore?.totalScore,
          timestamp: Date.now(),
          executed: true,
        });
      } else {
        log('BLOCKED', `Order rejected: ${(result.errors || []).join('; ')}`, { strategy: 'hydra' });
      }
      return result;
    } catch (err) {
      log('ERROR', `Order error: ${err.message}`, { strategy: 'hydra' });
      return { success: false, errors: [err.message] };
    }
  }, [log, logActivity]);

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

    // Restore running status
    if (!engineRef.current.running) {
      useStore.getState().setEngineStatus('running');
      log('SIGNAL', 'WebSocket reconnected — engine resumed');
      engineRef.current.running = true;
    }

    // Circuit breaker
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
    if (!candles || candles.length < 30) return;

    const indicators = state.indicators;
    const orderBook = state.orderBook;
    const lastIdx = candles.length - 1;
    const lastCandle = candles[lastIdx];

    // Deduplication: skip if same candle
    const candleTs = lastCandle.timestamp;
    if (engineRef.current.lastEvalCandleTs === candleTs) return;
    engineRef.current.lastEvalCandleTs = candleTs;

    // Update last eval timestamp
    useStore.setState({ lastEngineEval: Date.now() });

    // ---- Check exits on open HYDRA positions ----
    const hydraPositions = (state.positions || []).filter(
      (p) => p.strategy === 'hydra' && p.status !== 'closed'
    );

    const hydraSettings = state.hydraSettings || {};

    for (const position of hydraPositions) {
      try {
        const exitSignal = hydra.checkExit(position, candles, indicators, lastIdx, {
          tradeFlow: state.tradeFlow,
          exitThreshold: hydraSettings.exitScoreThreshold || 40,
        });

        if (exitSignal && exitSignal.exit) {
          log('SIGNAL', `HYDRA exit: ${exitSignal.reason}`, {
            strategy: 'hydra', pair: position.pair,
          });
          logActivity(`${position.pair} position closed (${exitSignal.exitType}) — ${exitSignal.reason}`);
          // TODO: Implement position close via order bridge
        }
      } catch (err) {
        log('ERROR', `HYDRA checkExit error: ${err.message}`);
      }
    }

    // ---- Check for new HYDRA entry ----
    const currentThreshold = state.hydraEntryThreshold;
    const portfolioValue = state.tradingMode === 'paper'
      ? state.paperPortfolio.balance
      : state.portfolio.totalValue || state.portfolio.availableCash || 0;

    try {
      const entrySignal = hydra.checkEntry(candles, indicators, orderBook, lastIdx, {
        tradeFlow: state.tradeFlow,
        pair: state.activePair,
        settings: hydraSettings,
        regime: state.currentRegime,
        entryThreshold: currentThreshold,
        portfolioValue,
      });

      // Always update the score display
      if (entrySignal?.hydraScore) {
        useStore.getState().setHydraScore(entrySignal.hydraScore);
        useStore.getState().setHydraDimensions({
          d1: entrySignal.hydraScore.d1,
          d2: entrySignal.hydraScore.d2,
          d3: entrySignal.hydraScore.d3,
          d4: entrySignal.hydraScore.d4,
          d5: entrySignal.hydraScore.d5,
        });
      }

      if (entrySignal && entrySignal.entry) {
        // Signal expiry check
        const expiryMs = (hydraSettings.signalExpirySec || 20) * 1000;
        if (Date.now() - entrySignal.signalTimestamp > expiryMs) {
          log('SKIP', 'Signal expired');
          return;
        }

        // Populate store signals
        useStore.getState().setStrategySignal('hydra', {
          ...entrySignal,
          timestamp: Date.now(),
          pair: state.activePair,
        });

        useStore.getState().addSignal({
          id: `sig-${Date.now()}-hydra`,
          strategy: 'hydra',
          pair: state.activePair,
          type: 'buy',
          reason: entrySignal.reason,
          confidence: entrySignal.confidence,
          hydraScore: entrySignal.hydraScore?.totalScore,
          timestamp: Date.now(),
        });

        log('SIGNAL', `HYDRA score ${entrySignal.hydraScore?.totalScore}/100 — entry signal`, {
          strategy: 'hydra', confidence: entrySignal.confidence,
        });

        // Run risk pipeline
        const riskResult = runRiskPipeline(entrySignal, state);

        if (riskResult.blocked) {
          log('BLOCKED', riskResult.reason, { strategy: 'hydra' });
          logActivity(`${state.activePair} scored ${entrySignal.hydraScore?.totalScore}/100 → BLOCKED: ${riskResult.reason}`);

          saveSignal({
            strategy: 'hydra',
            pair: state.activePair,
            direction: 'long',
            reason: entrySignal.reason,
            confidence: entrySignal.confidence,
            hydraScore: entrySignal.hydraScore?.totalScore,
            executed: false,
            blockedReason: riskResult.reason,
          }).catch(() => {});
          return;
        }

        // Execute
        executeOrder(entrySignal, riskResult, state);
      } else if (entrySignal?.hydraScore) {
        // Log below-threshold scores with dimension breakdown
        const hs = entrySignal.hydraScore;
        const score = hs.totalScore;
        if (score != null) {
          const breakdown = `D1=${hs.d1?.score||0} D2=${hs.d2?.score||0} D3=${hs.d3?.score||0} D4=${hs.d4?.score||0} D5=${hs.d5?.score||0}`;
          const blocked = hs.spreadBlocked ? ' [SPREAD BLOCKED]' : '';
          logActivity(`${state.activePair} scored ${score}/100 (${breakdown})${blocked} — ${entrySignal.reason || 'Below threshold'}`);
        }
      }
    } catch (err) {
      log('ERROR', `HYDRA checkEntry error: ${err.message}`);
    }
  }, [log, logActivity, runRiskPipeline, executeOrder]);

  // =========================================================================
  //  VIPER — Execute a VIPER order
  // =========================================================================
  const executeViperOrder = useCallback(async (signal, riskResult, state) => {
    const pair = signal.pair || state.activePair;

    const orderData = {
      pair,
      side: 'BUY',
      orderType: 'market',
      baseSize: riskResult.baseSize,
      quoteSize: riskResult.positionSize,
      strategy: 'viper',
      mode: signal.mode,
      viperMode: signal.mode,
      notionalValue: riskResult.positionSize,
      stopLoss: signal.stopLoss,
      tp1: signal.tp1,
      tp2: signal.tp2,
      trailDistance: signal.trailDistance,
      tp1ClosePct: signal.tp1ClosePct,
      tp2ClosePct: signal.tp2ClosePct,
      rangeSupport: signal.rangeSupport,
      rangeResistance: signal.rangeResistance,
      maxHoldMs: signal.maxHoldMs,
      entryTimestamp: Date.now(),
    };

    log('EXECUTE', `VIPER/${signal.mode} BUY ${pair} — $${riskResult.positionSize.toFixed(2)}`, {
      strategy: 'viper', mode: signal.mode, pair,
    });

    logViperActivity(`${signal.mode} entry on ${pair}: $${riskResult.positionSize.toFixed(2)} — ${signal.reason}`);

    engineRef.current.lastOrderTimestamp = Date.now();

    try {
      const result = await submitOrderRef.current(orderData);
      if (result.success) {
        log('EXECUTE', `VIPER order filled: ${result.orderId}`, { orderId: result.orderId });

        saveSignal({
          strategy: 'viper',
          mode: signal.mode,
          pair,
          direction: 'long',
          reason: signal.reason,
          confidence: signal.confidence,
          executed: true,
        }).catch(() => {});

        useStore.getState().addSignalHistory({
          id: result.orderId,
          strategy: 'viper',
          mode: signal.mode,
          pair,
          direction: 'long',
          reason: signal.reason,
          confidence: signal.confidence,
          timestamp: Date.now(),
          executed: true,
        });
      } else {
        log('BLOCKED', `VIPER order rejected: ${(result.errors || []).join('; ')}`, { strategy: 'viper' });
      }
      return result;
    } catch (err) {
      log('ERROR', `VIPER order error: ${err.message}`, { strategy: 'viper' });
      return { success: false, errors: [err.message] };
    }
  }, [log, logViperActivity]);

  // =========================================================================
  //  Scanner: Evaluate HYDRA on a single pair (parameterized)
  // =========================================================================
  const evaluatePairHydra = useCallback((pair, { candles, indicators, orderBook, tradeFlow, regime, skipEntry }, state) => {
    if (!candles || candles.length < 30) {
      if (pair === state.activePair) {
        logActivity(`${pair} — waiting for candle data (have ${candles?.length || 0}, need 30)`);
      }
      return;
    }

    const lastIdx = candles.length - 1;
    const lastCandle = candles[lastIdx];
    const candleTs = lastCandle.timestamp;
    const isActivePair = pair === state.activePair;

    // Per-pair candle deduplication — skip entries if same candle already evaluated,
    // but still compute score for active pair so UI always shows current values
    const alreadyEvaluated = engineRef.current.pairLastEvalTs[pair] === candleTs;
    if (alreadyEvaluated && !isActivePair) return;
    engineRef.current.pairLastEvalTs[pair] = candleTs;

    // Regime gating: HYDRA skips bearish pairs (but still shows score for active pair)
    if (regime === 'bearish' && !isActivePair) return;

    const hydraSettings = state.hydraSettings || {};

    // ---- Check exits on open HYDRA positions for this pair ----
    const hydraPositions = (state.positions || []).filter(
      (p) => p.strategy === 'hydra' && p.status !== 'closed' && p.pair === pair
    );

    for (const position of hydraPositions) {
      try {
        const exitSignal = hydra.checkExit(position, candles, indicators, lastIdx, {
          tradeFlow,
          exitThreshold: hydraSettings.exitScoreThreshold || 40,
        });

        if (exitSignal && exitSignal.exit) {
          log('SIGNAL', `HYDRA exit: ${exitSignal.reason}`, { strategy: 'hydra', pair });
          logActivity(`${pair} position closed (${exitSignal.exitType}) — ${exitSignal.reason}`);
        }
      } catch (err) {
        log('ERROR', `HYDRA checkExit error on ${pair}: ${err.message}`);
      }
    }

    // ---- HYDRA daily loss limit ----
    const portfolioValue = state.tradingMode === 'paper'
      ? state.paperPortfolio.balance
      : state.portfolio.totalValue || state.portfolio.availableCash || 0;
    const hydraDailyPnLPct = portfolioValue > 0 ? (state.hydraDailyPnL / portfolioValue) * 100 : 0;
    if (hydraDailyPnLPct <= (state.hydraDailyLossLimit || -1.5)) {
      if (isActivePair) {
        logActivity(`HYDRA daily loss limit reached (${hydraDailyPnLPct.toFixed(2)}%) — entries paused`);
      }
      return;
    }

    // ---- Check for new HYDRA entry ----
    // Scanner pairs use higher threshold (70) vs active pair (65 min)
    // Session-aware: increase threshold by +5 during low-liquidity hours (04-12 UTC)
    const baseThreshold = state.hydraEntryThreshold;
    const hourUTC = new Date().getUTCHours();
    const isLowLiqHours = hourUTC >= 4 && hourUTC < 12;
    const scannerBonus = isActivePair ? 0 : Math.max(0, 70 - baseThreshold);
    const sessionBonus = isLowLiqHours ? 5 : 0;
    const currentThreshold = baseThreshold + scannerBonus + sessionBonus;

    try {
      const entrySignal = hydra.checkEntry(candles, indicators, orderBook, lastIdx, {
        tradeFlow,
        pair,
        settings: hydraSettings,
        regime,
        entryThreshold: currentThreshold,
        portfolioValue,
      });

      // Update score display only for active pair
      if (isActivePair && entrySignal?.hydraScore) {
        useStore.getState().setHydraScore(entrySignal.hydraScore);
        useStore.getState().setHydraDimensions({
          d1: entrySignal.hydraScore.d1,
          d2: entrySignal.hydraScore.d2,
          d3: entrySignal.hydraScore.d3,
          d4: entrySignal.hydraScore.d4,
          d5: entrySignal.hydraScore.d5,
        });
      }

      // Block new entries if already evaluated this candle, in bearish regime, or at position cap
      // (score display above still runs for active pair)
      if (alreadyEvaluated || regime === 'bearish' || skipEntry) return;

      if (entrySignal && entrySignal.entry) {
        // Signal expiry check
        const expiryMs = (hydraSettings.signalExpirySec || 20) * 1000;
        if (Date.now() - entrySignal.signalTimestamp > expiryMs) {
          log('SKIP', `Signal expired on ${pair}`);
          return;
        }

        // Multi-TF confirmation: 5m trend agreement (soft filter — warns but only blocks scanner pairs)
        const ind5m = state.scannerIndicators?.[pair] || {};
        const ema9_5m = ind5m['FIVE_MINUTE_ema9'];
        const ema21_5m = ind5m['FIVE_MINUTE_ema21'];
        let trend5mBearish = false;
        if (ema9_5m && ema21_5m) {
          const last5m9 = ema9_5m[ema9_5m.length - 1];
          const last5m21 = ema21_5m[ema21_5m.length - 1];
          if (last5m9 != null && last5m21 != null && last5m9 < last5m21) {
            trend5mBearish = true;
            // Only hard-block scanner pairs; active pair gets a warning but still trades
            if (!isActivePair) {
              log('BLOCKED', `${pair}: 5m trend disagreement (EMA9 < EMA21)`, { strategy: 'hydra' });
              logActivity(`[SCAN] ${pair} scored ${entrySignal.hydraScore?.totalScore}/100 → BLOCKED: 5m trend disagreement`);
              return;
            }
            logActivity(`${pair} scored ${entrySignal.hydraScore?.totalScore}/100 — 5m trend bearish (proceeding with caution)`);
          }
        }

        useStore.getState().setStrategySignal('hydra', {
          ...entrySignal,
          timestamp: Date.now(),
          pair,
        });

        useStore.getState().addSignal({
          id: `sig-${Date.now()}-hydra-${pair}`,
          strategy: 'hydra',
          pair,
          type: 'buy',
          reason: entrySignal.reason,
          confidence: entrySignal.confidence,
          hydraScore: entrySignal.hydraScore?.totalScore,
          timestamp: Date.now(),
        });

        log('SIGNAL', `HYDRA score ${entrySignal.hydraScore?.totalScore}/100 on ${pair} — entry signal`, {
          strategy: 'hydra', confidence: entrySignal.confidence,
        });

        // Assign pair to signal for execution
        entrySignal.pair = pair;

        // Run risk pipeline
        const riskResult = runRiskPipeline(entrySignal, state);

        if (riskResult.blocked) {
          log('BLOCKED', riskResult.reason, { strategy: 'hydra' });
          logActivity(`${pair} scored ${entrySignal.hydraScore?.totalScore}/100 → BLOCKED: ${riskResult.reason}`);

          saveSignal({
            strategy: 'hydra', pair, direction: 'long',
            reason: entrySignal.reason, confidence: entrySignal.confidence,
            hydraScore: entrySignal.hydraScore?.totalScore,
            executed: false, blockedReason: riskResult.reason,
          }).catch(() => {});
          return 'blocked';
        }

        // Execute
        executeOrder(entrySignal, riskResult, state);
        return 'executed';
      } else if (entrySignal?.hydraScore) {
        const hs = entrySignal.hydraScore;
        const score = hs.totalScore;
        if (score != null) {
          const breakdown = `D1=${hs.d1?.score||0} D2=${hs.d2?.score||0} D3=${hs.d3?.score||0} D4=${hs.d4?.score||0} D5=${hs.d5?.score||0}`;
          const blocked = hs.spreadBlocked ? ' [SPREAD BLOCKED]' : '';
          const pairLabel = isActivePair ? pair : `[SCAN] ${pair}`;
          logActivity(`${pairLabel} scored ${score}/100 (${breakdown})${blocked} — ${entrySignal.reason || 'Below threshold'}`);
        }
      }
    } catch (err) {
      log('ERROR', `HYDRA checkEntry error on ${pair}: ${err.message}`);
    }
    return null;
  }, [log, logActivity, runRiskPipeline, executeOrder]);

  // =========================================================================
  //  Scanner: Evaluate VIPER on a single pair (parameterized)
  // =========================================================================
  const evaluatePairViper = useCallback((pair, { candles1m, candles5m, candles15m, indicators1m, indicators5m, indicators15m, orderBook, tradeFlow, viperMode }, state) => {
    if (!viperMode) return null;

    const isActivePair = pair === state.activePair;
    const currentPrice = state.tickers?.[pair]?.price;

    // Count open VIPER positions by mode
    const viperPositions = (state.positions || []).filter(
      (p) => p.strategy === 'viper' && p.status !== 'closed'
    );
    const openStrikePositions = viperPositions.filter(p => (p.viperMode === 'STRIKE' || p.mode === 'STRIKE')).length;
    const openCoilPositions = viperPositions.filter(p => (p.viperMode === 'COIL' || p.mode === 'COIL')).length;
    const openLungePositions = viperPositions.filter(p => (p.viperMode === 'LUNGE' || p.mode === 'LUNGE')).length;

    // Calculate allocated capital
    const portfolioValue = state.tradingMode === 'paper'
      ? state.paperPortfolio.balance
      : state.portfolio.totalValue || state.portfolio.availableCash || 0;

    const allocation = calculateAllocation({
      totalPortfolio: portfolioValue,
      splitConfig: state.allocationConfig,
      viperThreatLevel: state.viperReplacementThreat,
      hydraActive: true,
      viperActive: true,
    });

    // ---- Check exits on open VIPER positions for this pair ----
    const pairViperPositions = viperPositions.filter((p) => p.pair === pair);
    for (const position of pairViperPositions) {
      try {
        const exitSignal = viper.checkExit(position, null, null, null, {
          candles1m,
          candles5m,
          candles15m,
          indicators1m,
          indicators5m,
          indicators15m,
          currentPrice: currentPrice || position.entryPrice,
        });

        if (exitSignal && exitSignal.exit) {
          log('SIGNAL', `VIPER/${position.viperMode || position.mode} exit on ${pair}: ${exitSignal.reason}`, {
            strategy: 'viper', pair,
          });
          logViperActivity(`${position.viperMode || position.mode} exit on ${pair}: ${exitSignal.reason}`);
        }
      } catch (err) {
        log('ERROR', `VIPER checkExit error on ${pair}: ${err.message}`);
      }
    }

    // ---- Check for STRIKE max hold time on this pair ----
    for (const position of pairViperPositions) {
      if ((position.viperMode === 'STRIKE' || position.mode === 'STRIKE') && position.maxHoldMs) {
        const holdTime = Date.now() - (position.entryTimestamp || position.openedAt || Date.now());
        if (holdTime >= position.maxHoldMs) {
          log('SIGNAL', `VIPER/STRIKE timeout: ${pair} held for ${Math.round(holdTime / 1000)}s`, { strategy: 'viper', pair });
          logViperActivity(`STRIKE timeout on ${pair} after ${Math.round(holdTime / 1000)}s`);
        }
      }
    }

    // ---- Max hold enforcement for COIL and LUNGE ----
    for (const position of pairViperPositions) {
      const mode = position.viperMode || position.mode;
      const holdTime = Date.now() - (position.entryTimestamp || position.openedAt || Date.now());
      const maxHolds = { COIL: 30 * 60 * 1000, LUNGE: 2 * 60 * 60 * 1000 };
      if (maxHolds[mode] && holdTime >= maxHolds[mode]) {
        log('SIGNAL', `VIPER/${mode} max hold exceeded on ${pair}: ${Math.round(holdTime / 60000)}min`, { strategy: 'viper', pair });
        logViperActivity(`${mode} max hold exceeded on ${pair} (${Math.round(holdTime / 60000)}min)`);
      }
    }

    // ---- HYDRA max hold enforcement (45 min) ----
    const hydraPairPositions = (state.positions || []).filter(
      (p) => p.strategy === 'hydra' && p.status !== 'closed' && p.pair === pair
    );
    for (const position of hydraPairPositions) {
      const holdTime = Date.now() - (position.entryTimestamp || position.openedAt || Date.now());
      if (holdTime >= 45 * 60 * 1000) {
        log('SIGNAL', `HYDRA max hold exceeded on ${pair}: ${Math.round(holdTime / 60000)}min`, { strategy: 'hydra', pair });
        logActivity(`${pair} HYDRA max hold exceeded (${Math.round(holdTime / 60000)}min)`);
      }
    }

    // ---- Check for new VIPER entry ----
    try {
      const viperState = {
        activeMode: viperMode,
        openStrikePositions,
        openCoilPositions,
        openLungePositions,
        strikeLastTradeTs: engineRef.current.viperStrikeState.lastTradeTs,
        strikeConsecutiveWins: engineRef.current.viperStrikeState.consecutiveWins,
        strikeSkipNext: engineRef.current.viperStrikeState.skipNext,
      };

      const entrySignal = viper.checkEntry(null, null, orderBook, null, {
        viperState,
        candles1m,
        candles5m,
        candles15m,
        indicators1m,
        indicators5m,
        indicators15m,
        tradeFlow,
        pair,
        allocatedCapital: allocation.viperCapital,
      });

      if (entrySignal && entrySignal.entry) {
        if (Date.now() - entrySignal.signalTimestamp > 10000) {
          log('SKIP', `VIPER signal expired on ${pair}`);
          return null;
        }

        entrySignal.pair = pair;

        useStore.getState().setStrategySignal('viper', {
          ...entrySignal,
          timestamp: Date.now(),
          pair,
        });

        useStore.getState().addSignal({
          id: `sig-${Date.now()}-viper-${viperMode}-${pair}`,
          strategy: 'viper',
          mode: viperMode,
          pair,
          type: 'buy',
          reason: entrySignal.reason,
          confidence: entrySignal.confidence,
          timestamp: Date.now(),
        });

        log('SIGNAL', `VIPER/${viperMode} entry signal on ${pair}`, {
          strategy: 'viper', mode: viperMode, confidence: entrySignal.confidence,
        });

        const riskResult = runRiskPipeline(entrySignal, state, 'viper');

        if (riskResult.blocked) {
          log('BLOCKED', riskResult.reason, { strategy: 'viper' });
          logViperActivity(`${viperMode} on ${pair} → BLOCKED: ${riskResult.reason}`);

          saveSignal({
            strategy: 'viper', mode: viperMode, pair, direction: 'long',
            reason: entrySignal.reason, confidence: entrySignal.confidence,
            executed: false, blockedReason: riskResult.reason,
          }).catch(() => {});
          return 'blocked';
        }

        executeViperOrder(entrySignal, riskResult, state);
        return 'executed';
      }
    } catch (err) {
      log('ERROR', `VIPER checkEntry error on ${pair}: ${err.message}`);
    }
    return null;
  }, [log, logActivity, logViperActivity, runRiskPipeline, executeViperOrder]);

  // =========================================================================
  //  Scanner: Evaluate all pairs (HYDRA + VIPER)
  // =========================================================================
  const evaluateAllPairs = useCallback(() => {
    const state = useStore.getState();
    if (!state.botRunning) return;
    if (state.wsStatus !== 'connected') {
      if (engineRef.current.running) {
        useStore.getState().setEngineStatus('paused');
        log('SKIP', 'WebSocket disconnected — engine paused');
        engineRef.current.running = false;
      }
      return;
    }

    if (!engineRef.current.running) {
      useStore.getState().setEngineStatus('running');
      log('SIGNAL', 'WebSocket reconnected — engine resumed');
      engineRef.current.running = true;
    }

    // Circuit breaker
    if (engineRef.current.circuitBreaker) {
      const cbResult = canTrade(engineRef.current.circuitBreaker);
      if (!cbResult.allowed) {
        useStore.getState().setEngineStatus('paused');
        log('BLOCKED', `Circuit breaker: ${cbResult.reason}`);
        return;
      }
    }

    useStore.setState({ lastEngineEval: Date.now() });

    // Determine pairs to evaluate
    const scannerEnabled = state.scannerEnabled;
    const pairs = scannerEnabled ? (state.scannerPairs || []) : [state.activePair];

    // Count open positions for concurrent cap
    const openPositions = (state.positions || []).filter((p) => p.status !== 'closed');
    const maxConcurrent = state.maxConcurrentPositions || 3;

    // Count directional positions for correlation cap
    const longPositions = openPositions.filter((p) => p.direction === 'long' || !p.direction);

    // Process pairs sequentially to avoid balance race conditions
    for (const pair of pairs) {
      // Re-read state after each pair that may have opened a position
      const currentState = useStore.getState();
      const currentOpenPositions = (currentState.positions || []).filter((p) => p.status !== 'closed');

      // Max concurrent positions cap (still check exits even when capped)
      const isAtCap = currentOpenPositions.length >= maxConcurrent;

      // Correlation cap: max 2 positions in same direction
      const currentLongs = currentOpenPositions.filter((p) => p.direction === 'long' || !p.direction);
      const isAtCorrelationCap = currentLongs.length >= 2;

      const isActivePair = pair === currentState.activePair;

      // Gather data for this pair
      let candles, indicators, orderBook, tradeFlow, regime;

      if (isActivePair) {
        // Active pair: prefer scanner 1m candles+indicators for consistent evaluation
        // Fall back to global store only if scanner data hasn't loaded yet
        candles = currentState.scannerCandles?.[pair]?.['ONE_MINUTE']
          || currentState.candles['ONE_MINUTE']
          || currentState.candles[currentState.activeTimeframe];
        indicators = currentState.scannerIndicators?.[pair] || currentState.indicators;
        orderBook = currentState.orderBook;
        tradeFlow = currentState.tradeFlow;
        regime = currentState.currentRegime;
      } else {
        // Scanner pair: use scanner store data
        candles = currentState.scannerCandles?.[pair]?.['ONE_MINUTE'];
        indicators = currentState.scannerIndicators?.[pair] || {};
        orderBook = currentState.scannerOrderBooks?.[pair] || { bids: [], asks: [], spread: 0 };
        tradeFlow = currentState.scannerTradeFlow?.[pair] || { buyVolume: 0, sellVolume: 0, ratio: 1 };
        regime = currentState.scannerRegimes?.[pair] || 'choppy';
      }

      // Liquidity filter: skip pairs with < $5M daily volume
      const volume24h = currentState.tickers?.[pair]?.volume24h || 0;
      const price = currentState.tickers?.[pair]?.price || 0;
      const dailyVolumeUSD = volume24h * price;
      if (!isActivePair && dailyVolumeUSD > 0 && dailyVolumeUSD < 5000000) {
        continue; // Skip illiquid pairs
      }

      // Evaluate HYDRA — always run (for exits + score display), but pass skipEntry flag when at cap
      const skipHydraEntry = isAtCap || isAtCorrelationCap;
      try {
        const hydraResult = evaluatePairHydra(pair, {
          candles, indicators, orderBook, tradeFlow, regime,
          skipEntry: skipHydraEntry,
        }, currentState);
        if (hydraResult === 'executed') continue; // Move to next pair after execution
      } catch (err) {
        log('ERROR', `evaluatePairHydra error on ${pair}: ${err.message}`);
      }

      // Evaluate VIPER if enabled
      if (currentState.viperEnabled) {
        // Ratchet check: if LOCKED, skip all VIPER entries
        if (currentState.viperRatchetLevel === 'LOCKED') continue;

        // Get per-pair VIPER mode
        const viperMode = isActivePair
          ? currentState.viperActiveMode
          : (currentState.scannerViperModes?.[pair] || null);

        if (!viperMode) continue;

        // Build multi-TF data for VIPER — use scanner indicators for all pairs (1m/5m/15m namespaced)
        const pairInd = currentState.scannerIndicators?.[pair] || (isActivePair ? currentState.indicators : {});

        // Extract namespaced indicators
        const ind1m = {};
        const ind5m = {};
        const ind15m = {};
        for (const [key, value] of Object.entries(pairInd)) {
          if (key.startsWith('ONE_MINUTE_')) ind1m[key.replace('ONE_MINUTE_', '')] = value;
          else if (key.startsWith('FIVE_MINUTE_')) ind5m[key.replace('FIVE_MINUTE_', '')] = value;
          else if (key.startsWith('FIFTEEN_MINUTE_')) ind15m[key.replace('FIFTEEN_MINUTE_', '')] = value;
        }

        const effective1m = Object.keys(ind1m).length > 0 ? ind1m : pairInd;
        const effective5m = Object.keys(ind5m).length > 0 ? ind5m : pairInd;
        const effective15m = Object.keys(ind15m).length > 0 ? ind15m : pairInd;

        const candles5m = isActivePair
          ? currentState.candles['FIVE_MINUTE']
          : (currentState.scannerCandles?.[pair]?.['FIVE_MINUTE']);
        const candles15m = isActivePair
          ? currentState.candles['FIFTEEN_MINUTE']
          : (currentState.scannerCandles?.[pair]?.['FIFTEEN_MINUTE']);

        try {
          if (!isAtCap && !isAtCorrelationCap) {
            evaluatePairViper(pair, {
              candles1m: candles,
              candles5m,
              candles15m,
              indicators1m: effective1m,
              indicators5m: effective5m,
              indicators15m: effective15m,
              orderBook,
              tradeFlow,
              viperMode,
            }, currentState);
          }
        } catch (err) {
          log('ERROR', `evaluatePairViper error on ${pair}: ${err.message}`);
        }
      }
    }
  }, [log, evaluatePairHydra, evaluatePairViper]);

  // =========================================================================
  //  Scanner: Per-pair edge detection for VIPER
  // =========================================================================
  const runScannerEdgeDetection = useCallback(() => {
    const state = useStore.getState();
    if (!state.viperEnabled || !state.botRunning || !state.scannerEnabled) return;

    const pairs = state.scannerPairs || [];
    for (const pair of pairs) {
      if (pair === state.activePair) continue; // Active pair uses global edge detector

      const pairInd = state.scannerIndicators?.[pair] || {};
      const candles5m = state.scannerCandles?.[pair]?.['FIVE_MINUTE'];
      const candles15m = state.scannerCandles?.[pair]?.['FIFTEEN_MINUTE'];

      const ind5m = {};
      const ind15m = {};
      for (const [key, value] of Object.entries(pairInd)) {
        if (key.startsWith('FIVE_MINUTE_')) ind5m[key.replace('FIVE_MINUTE_', '')] = value;
        else if (key.startsWith('FIFTEEN_MINUTE_')) ind15m[key.replace('FIFTEEN_MINUTE_', '')] = value;
      }

      if (Object.keys(ind5m).length === 0 && Object.keys(ind15m).length === 0) continue;

      const pairOrderBook = state.scannerOrderBooks?.[pair] || {};
      const bestBid = pairOrderBook.bids?.[0]?.[0];
      const bestAsk = pairOrderBook.asks?.[0]?.[0];
      const spread = (bestBid && bestAsk)
        ? (parseFloat(bestAsk) - parseFloat(bestBid)) / parseFloat(bestAsk)
        : 0.001;

      try {
        const result = detectEdge({
          candles5m: candles5m || [],
          indicators5m: ind5m,
          candles15m: candles15m || [],
          indicators15m: ind15m,
          tradeFlow: state.scannerTradeFlow?.[pair] || { buyVolume: 0, sellVolume: 0, ratio: 1 },
          spread,
        });

        // Check allowed modes from ratchet
        const allowedModes = getAllowedModes(state.viperRatchetLevel || 'NORMAL');
        let winner = result.winner;
        if (!allowedModes.includes(winner)) {
          const sorted = Object.entries(result.scores)
            .filter(([mode]) => allowedModes.includes(mode))
            .sort((a, b) => b[1] - a[1]);
          winner = sorted.length > 0 ? sorted[0][0] : null;
        }

        useStore.getState().setScannerViperMode(pair, winner);
      } catch (err) {
        log('ERROR', `Scanner edge detector error for ${pair}: ${err.message}`);
      }
    }
  }, [log]);

  // =========================================================================
  //  VIPER — Edge Detector (selects STRIKE/COIL/LUNGE every 15 min)
  // =========================================================================
  const runEdgeDetector = useCallback(() => {
    const state = useStore.getState();
    if (!state.viperEnabled || !state.botRunning) return;

    const candles5m = state.candles['FIVE_MINUTE'];
    const candles15m = state.candles['FIFTEEN_MINUTE'];
    const indicators = state.indicators;

    // Build per-timeframe indicator objects from namespaced keys
    const indicators5m = {};
    const indicators15m = {};
    for (const [key, value] of Object.entries(indicators)) {
      if (key.startsWith('FIVE_MINUTE_')) {
        indicators5m[key.replace('FIVE_MINUTE_', '')] = value;
      } else if (key.startsWith('FIFTEEN_MINUTE_')) {
        indicators15m[key.replace('FIFTEEN_MINUTE_', '')] = value;
      }
    }

    // If we don't have multi-TF indicators yet, use main indicators as fallback
    const has5mIndicators = Object.keys(indicators5m).length > 0;
    const has15mIndicators = Object.keys(indicators15m).length > 0;
    const effectiveIndicators5m = has5mIndicators ? indicators5m : indicators;
    const effectiveIndicators15m = has15mIndicators ? indicators15m : indicators;

    if (!has5mIndicators || !has15mIndicators) {
      log('WARN', `VIPER edge detector: using fallback indicators (5m: ${has5mIndicators ? 'OK' : 'FALLBACK'}, 15m: ${has15mIndicators ? 'OK' : 'FALLBACK'}, 5m candles: ${candles5m?.length || 0}, 15m candles: ${candles15m?.length || 0})`);
    }

    // Calculate spread
    const bestBid = state.orderBook?.bids?.[0]?.[0];
    const bestAsk = state.orderBook?.asks?.[0]?.[0];
    const spread = (bestBid && bestAsk)
      ? (parseFloat(bestAsk) - parseFloat(bestBid)) / parseFloat(bestAsk)
      : 0.001;

    try {
      const result = detectEdge({
        candles5m: candles5m || state.candles[state.activeTimeframe],
        indicators5m: effectiveIndicators5m,
        candles15m,
        indicators15m: effectiveIndicators15m,
        tradeFlow: state.tradeFlow,
        spread,
      });

      // Check allowed modes from ratchet
      const allowedModes = getAllowedModes(state.viperRatchetLevel || 'NORMAL');
      let winner = result.winner;

      if (!allowedModes.includes(winner)) {
        // Fall back to highest-scoring allowed mode
        const sorted = Object.entries(result.scores)
          .filter(([mode]) => allowedModes.includes(mode))
          .sort((a, b) => b[1] - a[1]);

        if (sorted.length > 0) {
          winner = sorted[0][0];
          result.reasons.push(`Ratchet override: ${result.winner} blocked, using ${winner}`);
        } else {
          winner = null;
          result.reasons.push('Ratchet: all modes blocked');
        }
      }

      const prevMode = state.viperActiveMode;
      useStore.getState().setViperActiveMode(winner);
      useStore.getState().setViperModeScores(result.scores);

      if (prevMode !== winner) {
        const msg = winner
          ? `Mode switch: ${prevMode || 'none'} → ${winner} (scores: S=${result.scores.STRIKE} C=${result.scores.COIL} L=${result.scores.LUNGE})`
          : `All modes disabled by ratchet (level: ${state.viperRatchetLevel})`;
        log('SIGNAL', `VIPER ${msg}`);
        logViperActivity(msg);
      }
    } catch (err) {
      log('ERROR', `Edge detector error: ${err.message}`);
    }
  }, [log, logViperActivity]);

  // =========================================================================
  //  VIPER — Core evaluation cycle
  // =========================================================================
  const evaluateViper = useCallback(() => {
    const state = useStore.getState();
    if (!state.viperEnabled || !state.botRunning) return;
    if (state.wsStatus !== 'connected') return;

    const activeMode = state.viperActiveMode;
    if (!activeMode) {
      // Only log this once every 30s to avoid spam
      const now = Date.now();
      if (!engineRef.current._lastViperNoModeLog || now - engineRef.current._lastViperNoModeLog > 30000) {
        engineRef.current._lastViperNoModeLog = now;
        log('WARN', 'VIPER: no active mode selected yet — waiting for edge detector');
      }
      return;
    }

    // Build multi-timeframe context
    const candles1m = state.candles['ONE_MINUTE'] || state.candles[state.activeTimeframe];
    const candles5m = state.candles['FIVE_MINUTE'];
    const candles15m = state.candles['FIFTEEN_MINUTE'];

    const indicators = state.indicators;
    const indicators1m = {};
    const indicators5m = {};
    const indicators15m = {};

    for (const [key, value] of Object.entries(indicators)) {
      if (key.startsWith('ONE_MINUTE_')) {
        indicators1m[key.replace('ONE_MINUTE_', '')] = value;
      } else if (key.startsWith('FIVE_MINUTE_')) {
        indicators5m[key.replace('FIVE_MINUTE_', '')] = value;
      } else if (key.startsWith('FIFTEEN_MINUTE_')) {
        indicators15m[key.replace('FIFTEEN_MINUTE_', '')] = value;
      }
    }

    // Fallback: use main indicators if no namespaced ones
    const effective1m = Object.keys(indicators1m).length > 0 ? indicators1m : indicators;
    const effective5m = Object.keys(indicators5m).length > 0 ? indicators5m : indicators;
    const effective15m = Object.keys(indicators15m).length > 0 ? indicators15m : indicators;

    const pair = state.activePair;
    const orderBook = state.orderBook;

    // Count open VIPER positions by mode
    const viperPositions = (state.positions || []).filter(
      (p) => p.strategy === 'viper' && p.status !== 'closed'
    );
    const openStrikePositions = viperPositions.filter(p => p.viperMode === 'STRIKE' || p.mode === 'STRIKE').length;
    const openCoilPositions = viperPositions.filter(p => p.viperMode === 'COIL' || p.mode === 'COIL').length;
    const openLungePositions = viperPositions.filter(p => p.viperMode === 'LUNGE' || p.mode === 'LUNGE').length;

    // Calculate allocated capital
    const portfolioValue = state.tradingMode === 'paper'
      ? state.paperPortfolio.balance
      : state.portfolio.totalValue || state.portfolio.availableCash || 0;

    const allocation = calculateAllocation({
      totalPortfolio: portfolioValue,
      splitConfig: state.allocationConfig,
      viperThreatLevel: state.viperReplacementThreat,
      hydraActive: true,
      viperActive: true,
    });

    const currentPrice = state.tickers?.[pair]?.price;

    // ---- Check exits on open VIPER positions ----
    for (const position of viperPositions) {
      try {
        const exitSignal = viper.checkExit(position, null, null, null, {
          candles1m,
          candles5m,
          candles15m,
          indicators1m: effective1m,
          indicators5m: effective5m,
          indicators15m: effective15m,
          currentPrice: currentPrice || position.entryPrice,
        });

        if (exitSignal && exitSignal.exit) {
          log('SIGNAL', `VIPER/${position.viperMode || position.mode} exit: ${exitSignal.reason}`, {
            strategy: 'viper', pair: position.pair,
          });
          logViperActivity(`${position.viperMode || position.mode} exit on ${position.pair}: ${exitSignal.reason}`);
        }
      } catch (err) {
        log('ERROR', `VIPER checkExit error: ${err.message}`);
      }
    }

    // ---- Check for STRIKE max hold time ----
    for (const position of viperPositions) {
      if ((position.viperMode === 'STRIKE' || position.mode === 'STRIKE') && position.maxHoldMs) {
        const holdTime = Date.now() - (position.entryTimestamp || position.openedAt || Date.now());
        if (holdTime >= position.maxHoldMs) {
          log('SIGNAL', `VIPER/STRIKE timeout: ${position.pair} held for ${Math.round(holdTime / 1000)}s`, {
            strategy: 'viper', pair: position.pair,
          });
          logViperActivity(`STRIKE timeout on ${position.pair} after ${Math.round(holdTime / 1000)}s`);
        }
      }
    }

    // ---- Check for new VIPER entry ----
    try {
      const viperState = {
        activeMode,
        openStrikePositions,
        openCoilPositions,
        openLungePositions,
        strikeLastTradeTs: engineRef.current.viperStrikeState.lastTradeTs,
        strikeConsecutiveWins: engineRef.current.viperStrikeState.consecutiveWins,
        strikeSkipNext: engineRef.current.viperStrikeState.skipNext,
      };

      const entrySignal = viper.checkEntry(null, null, orderBook, null, {
        viperState,
        candles1m,
        candles5m,
        candles15m,
        indicators1m: effective1m,
        indicators5m: effective5m,
        indicators15m: effective15m,
        tradeFlow: state.tradeFlow,
        pair,
        allocatedCapital: allocation.viperCapital,
      });

      if (entrySignal && entrySignal.entry) {
        // Signal expiry check (10s for VIPER)
        if (Date.now() - entrySignal.signalTimestamp > 10000) {
          log('SKIP', 'VIPER signal expired');
          return;
        }

        useStore.getState().setStrategySignal('viper', {
          ...entrySignal,
          timestamp: Date.now(),
          pair,
        });

        useStore.getState().addSignal({
          id: `sig-${Date.now()}-viper-${activeMode}`,
          strategy: 'viper',
          mode: activeMode,
          pair,
          type: 'buy',
          reason: entrySignal.reason,
          confidence: entrySignal.confidence,
          timestamp: Date.now(),
        });

        log('SIGNAL', `VIPER/${activeMode} entry signal on ${pair}`, {
          strategy: 'viper', mode: activeMode, confidence: entrySignal.confidence,
        });

        // Run risk pipeline with VIPER-specific allocation
        const riskResult = runRiskPipeline(entrySignal, state, 'viper');

        if (riskResult.blocked) {
          log('BLOCKED', riskResult.reason, { strategy: 'viper' });
          logViperActivity(`${activeMode} on ${pair} → BLOCKED: ${riskResult.reason}`);

          saveSignal({
            strategy: 'viper',
            mode: activeMode,
            pair,
            direction: 'long',
            reason: entrySignal.reason,
            confidence: entrySignal.confidence,
            executed: false,
            blockedReason: riskResult.reason,
          }).catch(() => {});
          return;
        }

        // Execute
        executeViperOrder(entrySignal, riskResult, state);
      }
    } catch (err) {
      log('ERROR', `VIPER checkEntry error: ${err.message}`);
    }
  }, [log, logViperActivity, runRiskPipeline, executeViperOrder]);

  // =========================================================================
  //  Handle trade completion — calibration + session learning
  // =========================================================================
  const handlePositionClosed = useCallback((tradeResult) => {
    // Update circuit breaker
    if (engineRef.current.circuitBreaker) {
      engineRef.current.circuitBreaker = recordTrade(
        engineRef.current.circuitBreaker,
        tradeResult.netPnL || 0,
        tradeResult.fees || 0
      );

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

    const isViperTrade = tradeResult.strategy === 'viper';

    if (isViperTrade) {
      // ---- VIPER-specific trade handling ----
      const state = useStore.getState();

      // Update VIPER daily P&L
      const portfolioValue = state.tradingMode === 'paper'
        ? state.paperPortfolio.balance
        : state.portfolio.totalValue || 1;
      const pnlPct = ((tradeResult.netPnL || 0) / portfolioValue) * 100;
      useStore.getState().updateViperDailyPnL(tradeResult.netPnL || 0);

      // Evaluate ratchet transition
      const updatedState = useStore.getState();
      const newRatchetLevel = evaluateRatchet(
        (updatedState.viperDailyPnL / portfolioValue) * 100,
        (updatedState.viperDailyHighPnL / portfolioValue) * 100,
        updatedState.viperRatchetLevel
      );
      if (newRatchetLevel !== updatedState.viperRatchetLevel) {
        useStore.getState().setViperRatchetLevel(newRatchetLevel);
        log('SIGNAL', `VIPER ratchet: ${updatedState.viperRatchetLevel} → ${newRatchetLevel}`);
        logViperActivity(`Ratchet transition: ${updatedState.viperRatchetLevel} → ${newRatchetLevel}`);
      }

      // Update STRIKE cadence state
      const isWin = (tradeResult.netPnL || 0) > 0;
      const mode = tradeResult.mode || tradeResult.viperMode;
      if (mode === 'STRIKE') {
        const strikeState = engineRef.current.viperStrikeState;
        strikeState.lastTradeTs = Date.now();
        if (isWin) {
          strikeState.consecutiveWins++;
          strikeState.skipNext = false;
        } else {
          strikeState.consecutiveWins = 0;
          strikeState.skipNext = true;
        }
      }

      // Track VIPER trades
      engineRef.current.viperCompletedTrades.unshift(tradeResult);
      if (engineRef.current.viperCompletedTrades.length > 50) {
        engineRef.current.viperCompletedTrades = engineRef.current.viperCompletedTrades.slice(0, 50);
      }

      logViperActivity(`${mode || 'VIPER'} trade closed on ${tradeResult.pair}: ${isWin ? '+' : ''}$${(tradeResult.netPnL || 0).toFixed(2)}`);
    } else {
      // ---- HYDRA-specific trade handling ----
      // Update HYDRA daily P&L
      useStore.getState().updateHydraDailyPnL(tradeResult.netPnL || 0);

      // Track for self-calibration
      engineRef.current.completedTrades.unshift(tradeResult);
      if (engineRef.current.completedTrades.length > 50) {
        engineRef.current.completedTrades = engineRef.current.completedTrades.slice(0, 50);
      }

      // Track per-pair for session learning
      const pair = tradeResult.pair || 'UNKNOWN';
      if (!engineRef.current.pairTrades[pair]) engineRef.current.pairTrades[pair] = [];
      engineRef.current.pairTrades[pair].unshift(tradeResult);

      // Self-calibration check every 10 trades
      const state = useStore.getState();
      const hydraSettings = state.hydraSettings || {};

      if (hydraSettings.autoCalibrate !== false && engineRef.current.completedTrades.length % 10 === 0) {
        const result = recalibrateThreshold(
          engineRef.current.completedTrades,
          state.hydraEntryThreshold,
          hydraSettings.entryThreshold || 80
        );

        if (result.changed) {
          useStore.getState().setHydraEntryThreshold(result.threshold);
          saveThreshold(result.threshold);
          log('SIGNAL', `Threshold auto-adjusted: ${result.reason}`);
          logActivity(`Threshold auto-adjusted: ${state.hydraEntryThreshold} → ${result.threshold} (${result.reason})`);
        }
      }

      // Session learning: after every 20 trades on a pair
      if (engineRef.current.pairTrades[pair]?.length % 20 === 0) {
        updateSessionProfile(pair, engineRef.current.pairTrades[pair]);
        log('SIGNAL', `Session profile updated for ${pair} (${engineRef.current.pairTrades[pair].length} trades)`);
      }
    }
  }, [log, logActivity, logViperActivity]);

  // =========================================================================
  //  Lifecycle — start/stop engine
  // =========================================================================
  useEffect(() => {
    const unsubscribe = useStore.subscribe(
      (state, prevState) => {
        const wasRunning = prevState?.botRunning;
        const isRunning = state.botRunning;

        if (isRunning && !wasRunning) startEngine();
        if (!isRunning && wasRunning) stopEngine();
      }
    );

    if (useStore.getState().botRunning) startEngine();

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

    if (eng.unsubscribe) eng.unsubscribe();
    if (eng.intervalId) clearInterval(eng.intervalId);

    // Initialize circuit breaker
    const startingBalance = state.tradingMode === 'paper'
      ? state.paperPortfolio.balance
      : state.portfolio.totalValue || state.portfolio.availableCash || 0;
    eng.circuitBreaker = createCircuitBreaker(startingBalance);
    eng.lastEvalCandleTs = null;
    eng.running = true;

    // Auto-activate HYDRA strategy
    const strategies = { hydra: true };
    if (state.viperEnabled) strategies.viper = true;
    useStore.getState().setActiveStrategies(strategies);

    useStore.getState().setEngineStatus('running');
    log('SIGNAL', 'Engine started (HYDRA' + (state.viperEnabled ? ' + VIPER' : '') + ')');
    logActivity('HYDRA engine activated');

    // Subscribe to candle changes — triggers multi-pair evaluation
    eng.unsubscribe = useStore.subscribe((newState, prevState) => {
      if (!newState.botRunning) return;
      const tf = newState.activeTimeframe;
      const newCandles = newState.candles[tf];
      const prevCandles = prevState?.candles?.[tf];
      if (newCandles && prevCandles && newCandles.length !== prevCandles.length) {
        evaluateAllPairs();
      }
    });

    // Fallback interval — uses multi-pair evaluator
    eng.intervalId = setInterval(() => {
      if (!useStore.getState().botRunning) return;
      evaluateAllPairs();
    }, EVAL_INTERVAL_MS);

    // ---- VIPER timers ----
    if (state.viperEnabled) {
      logViperActivity('VIPER engine activated');

      // Edge detector: run immediately, then every 15 min (global + per-scanner-pair)
      runEdgeDetector();
      runScannerEdgeDetection();
      eng.viperModeTimerId = setInterval(() => {
        if (!useStore.getState().botRunning || !useStore.getState().viperEnabled) return;
        runEdgeDetector();
        runScannerEdgeDetection();
      }, EDGE_DETECTOR_INTERVAL_MS);

      // VIPER evaluation is now handled by evaluateAllPairs() in the main interval
      // No separate viperEvalIntervalId needed — evaluateAllPairs covers VIPER per pair

      // Daily reset timer: reset VIPER daily state at midnight UTC
      const scheduleNextDailyReset = () => {
        const now = new Date();
        const nextMidnight = new Date(now);
        nextMidnight.setUTCHours(0, 0, 0, 0);
        nextMidnight.setUTCDate(nextMidnight.getUTCDate() + 1);
        const msUntilReset = nextMidnight.getTime() - now.getTime();

        eng.dailyResetTimerId = setTimeout(() => {
          const s = useStore.getState();
          if (s.viperEnabled) {
            // Record the day in the ledger before resetting
            const portfolioVal = s.tradingMode === 'paper' ? s.paperPortfolio.balance : s.portfolio.totalValue || 1;
            const pnlPct = (s.viperDailyPnL / portfolioVal) * 100;
            const wins = engineRef.current.viperCompletedTrades.filter(t => (t.netPnL || 0) > 0).length;
            const total = engineRef.current.viperCompletedTrades.length;

            const updatedLedger = recordDay(s.viperPerformanceLedger, {
              date: new Date().toISOString().slice(0, 10),
              pnl: s.viperDailyPnL,
              pnlPct,
              trades: s.viperDailyTrades,
              winRate: total > 0 ? (wins / total) * 100 : 0,
              dominantMode: s.viperActiveMode || 'STRIKE',
            });
            useStore.getState().setViperPerformanceLedger(updatedLedger);
            saveLedger(updatedLedger);

            // Evaluate replacement threat
            const threatResult = evaluateStatus(updatedLedger);
            useStore.getState().setViperReplacementThreat(threatResult.status);

            // Reset daily counters
            useStore.getState().resetViperDaily();
            useStore.getState().resetHydraDailyPnL(); // Also reset HYDRA daily PnL
            engineRef.current.viperCompletedTrades = [];
            engineRef.current.viperStrikeState = { consecutiveWins: 0, lastTradeTs: 0, skipNext: false };

            logViperActivity(`Daily reset — yesterday: $${s.viperDailyPnL.toFixed(2)} (${s.viperDailyTrades} trades), threat: ${threatResult.status}`);
            log('SIGNAL', `VIPER daily reset. Threat level: ${threatResult.status}`);
          }

          // Schedule the next reset
          scheduleNextDailyReset();
        }, msUntilReset);
      };
      scheduleNextDailyReset();

      // Overnight cutoff timer
      const viperSettings = state.viperSettings || {};
      const cutoffHour = viperSettings.overnightCutoffHourUTC ?? 5;
      const scheduleCutoff = () => {
        const now = new Date();
        const cutoffTime = new Date(now);
        cutoffTime.setUTCHours(cutoffHour, 0, 0, 0);
        if (cutoffTime <= now) cutoffTime.setUTCDate(cutoffTime.getUTCDate() + 1);
        const msUntilCutoff = cutoffTime.getTime() - now.getTime();

        eng.overnightCutoffTimerId = setTimeout(() => {
          const s = useStore.getState();
          if (s.viperEnabled) {
            logViperActivity(`Overnight cutoff at ${cutoffHour}:00 UTC — VIPER positions should be closed`);
            log('SIGNAL', 'VIPER overnight cutoff triggered');
          }
          scheduleCutoff(); // Next day
        }, msUntilCutoff);
      };
      scheduleCutoff();
    }

    // Position close tracking (handles both HYDRA and VIPER)
    const posUnsubscribe = useStore.subscribe((newState, prevState) => {
      if (!prevState) return;
      const prevPositions = prevState.positions || [];
      const newPositions = newState.positions || [];

      if (prevPositions.length > newPositions.length) {
        const closedIds = new Set(newPositions.map((p) => p.id));
        for (const pos of prevPositions) {
          if (!closedIds.has(pos.id) && (pos.strategy === 'hydra' || pos.strategy === 'viper')) {
            const currentPrice = newState.tickers?.[pos.pair]?.price || pos.currentPrice || pos.entryPrice;
            const grossPnL = pos.direction === 'long'
              ? (currentPrice - pos.entryPrice) * (pos.qty || 0)
              : (pos.entryPrice - currentPrice) * (pos.qty || 0);
            const fees = (pos.fees || 0) * 2;

            handlePositionClosed({
              netPnL: grossPnL - fees,
              fees,
              strategy: pos.strategy,
              mode: pos.viperMode || pos.mode,
              viperMode: pos.viperMode || pos.mode,
              pair: pos.pair,
              pnl: grossPnL - fees,
              timestamp: Date.now(),
              sessionHour: pos.sessionHour,
            });

            if (pos.strategy === 'hydra') {
              logActivity(`${pos.pair} position closed → ${grossPnL - fees >= 0 ? '+' : ''}$${(grossPnL - fees).toFixed(2)}`);
            }
          }
        }
      }
    });

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

    // Clean up VIPER timers
    if (eng.viperModeTimerId) {
      clearInterval(eng.viperModeTimerId);
      eng.viperModeTimerId = null;
    }
    if (eng.viperEvalIntervalId) {
      clearInterval(eng.viperEvalIntervalId);
      eng.viperEvalIntervalId = null;
    }
    if (eng.dailyResetTimerId) {
      clearTimeout(eng.dailyResetTimerId);
      eng.dailyResetTimerId = null;
    }
    if (eng.overnightCutoffTimerId) {
      clearTimeout(eng.overnightCutoffTimerId);
      eng.overnightCutoffTimerId = null;
    }

    eng.running = false;
    eng.lastEvalCandleTs = null;

    useStore.getState().setEngineStatus('idle');
    log('SIGNAL', 'Engine stopped');
    logActivity('HYDRA engine deactivated');

    if (useStore.getState().viperEnabled) {
      logViperActivity('VIPER engine deactivated');
    }
  }
}
