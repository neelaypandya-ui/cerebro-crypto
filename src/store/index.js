/* ============================================================
   Cerebro Crypto — Zustand Global Store
   ============================================================ */

import { create } from 'zustand';
import { DEFAULT_PAIRS, RISK_DEFAULTS } from '../config/constants.js';

// ---------------------------------------------------------------------------
// Safe localStorage helpers
// ---------------------------------------------------------------------------
const lsGet = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw !== null ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

const lsGetString = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw !== null ? raw : fallback;
  } catch {
    return fallback;
  }
};

const lsSet = (key, value) => {
  try {
    localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
  } catch {
    /* quota exceeded – silently ignore */
  }
};

// ---------------------------------------------------------------------------
// Store definition
// ---------------------------------------------------------------------------
const useStore = create((set, get) => ({
  // ---- Connection ---------------------------------------------------------
  wsStatus: 'disconnected', // 'disconnected' | 'connecting' | 'connected' | 'reconnecting'

  // ---- Trading Mode -------------------------------------------------------
  tradingMode: lsGetString('tradingMode', 'paper'),

  // ---- Market Data --------------------------------------------------------
  activePair: lsGetString('activePair', 'BTC-USD'),
  watchlist: lsGet('watchlist', [...DEFAULT_PAIRS]),
  favorites: lsGet('favorites', ['BTC-USD', 'ETH-USD', 'SOL-USD']),
  tickers: {},   // { 'BTC-USD': { price, change24h, high24h, low24h, volume24h, bid, ask, prevPrice } }
  orderBook: { bids: [], asks: [], spread: 0 },
  recentTrades: [],
  candles: {},   // { 'ONE_MINUTE': [...], 'ONE_HOUR': [...] }
  activeTimeframe: 'ONE_HOUR',

  // ---- Indicators (computed in worker) ------------------------------------
  indicators: {},

  // ---- Regime Detection ---------------------------------------------------
  currentRegime: 'choppy',
  regimeHistory: [],

  // ---- Positions & Orders -------------------------------------------------
  positions: [],
  pendingOrders: [],
  orderHistory: [],

  // ---- Portfolio ----------------------------------------------------------
  portfolio: {
    totalValue: 0,
    availableCash: 0,
    unrealizedPnL: 0,
    sessionPnL: 0,
    sessionWinRate: 0,
    sessionTradeCount: 0,
  },

  // ---- Paper Trading ------------------------------------------------------
  paperPortfolio: lsGet('paperPortfolio', {
    balance: 25000,
    positions: [],
    trades: [],
    startingBalance: 25000,
  }),

  // ---- Strategy & Bot -----------------------------------------------------
  activeStrategies: lsGet('activeStrategies', {}),
  botRunning: false,
  signals: [],

  // ---- Risk Settings ------------------------------------------------------
  riskSettings: lsGet('riskSettings', { ...RISK_DEFAULTS }),

  // ---- Alerts -------------------------------------------------------------
  alerts: [],
  alertLog: [],
  toasts: [],

  // ---- Indicator Config (per-indicator enabled/params/color) ---------------
  indicatorConfig: lsGet('indicatorConfig', {}),
  indicatorPresets: lsGet('indicatorPresets', {}),
  activePreset: lsGet('activePreset', null),

  // ---- Scalp Session Tracking ---------------------------------------------
  scalpSession: {
    streak: 0,
    wins: 0,
    losses: 0,
    netPnL: 0,
    fees: 0,
    trades: 0,
    pausedUntil: null,
    disabled: false,
    history: [],
  },

  // ---- Trade Flow (60s rolling buy/sell pressure) -------------------------
  tradeFlow: { buyVolume: 0, sellVolume: 0, ratio: 1 },

  // ---- Spread tracking per pair -------------------------------------------
  spreads: {},

  // ---- Per-strategy signal state ------------------------------------------
  strategySignals: {},

  // ---- Engine State -------------------------------------------------------
  engineLog: [],            // Last 100 engine decisions
  engineStatus: 'idle',     // 'idle' | 'running' | 'paused' | 'error'
  lastEngineEval: null,     // timestamp of last evaluation
  signalHistory: [],        // Last 200 signals for persistence

  // ---- VIPER State -------------------------------------------------------
  viperEnabled: lsGet('viperEnabled', false),
  viperActiveMode: null,         // null | 'STRIKE' | 'COIL' | 'LUNGE'
  viperModeScores: null,         // { STRIKE, COIL, LUNGE } from edge detector
  viperRatchetLevel: 'NORMAL',   // NORMAL | PROTECTED | PRESERVATION | LOCKED | RECOVERY
  viperDailyPnL: 0,
  viperDailyHighPnL: 0,
  viperDailyTrades: 0,
  viperSettings: lsGet('viper_settings', {
    enabled: false,
    edgeDetectorIntervalMin: 15,
    strikeCooldownSec: 90,
    strikeMaxConsecutiveWins: 3,
    coilMaxPositions: 2,
    lungeMaxPositions: 1,
    ratchetEnabled: true,
    overnightCutoffHourUTC: 5,
    dailyPnLTarget: 0.15,
    maxDailyLossPct: 0.5,
    performanceLedgerEnabled: true,
    capitalSplitPct: 40,
  }),
  viperActivity: [],             // Last 30 events
  viperPerformanceLedger: lsGet('viper_performance_ledger', []),
  viperReplacementThreat: 'ACTIVE', // DOMINANT | ACTIVE | WARNING | CRITICAL
  allocationConfig: lsGet('allocation_config', { hydra: 60, viper: 40 }),

  // ---- HYDRA State -------------------------------------------------------
  hydraScore: null,           // Current HYDRA score result
  hydraDimensions: null,      // { d1, d2, d3, d4, d5 } last dimension breakdown
  hydraEntryThreshold: lsGet('hydra_entry_threshold', 80),
  hydraSettings: lsGet('hydra_settings', {
    entryThreshold: 80,
    riskPerTrade: 0.01,
    maxPositionPct: 0.08,
    exitScoreThreshold: 40,
    signalExpirySec: 20,
    autoCalibrate: true,
    consecutiveLossPause: 3,
    consecutiveLossPauseMin: 15,
    sessionWeight: 1.0,
  }),
  hydraActivity: [],          // Last 20 HYDRA events
  hydraTradeCount: 0,         // Trades since last calibration check

  // ---- Scanner (Multi-Pair) -----------------------------------------------
  scannerPairs: lsGet('scannerPairs', ['BTC-USD', 'ETH-USD', 'SOL-USD', 'DOGE-USD', 'XRP-USD']),
  scannerCandles: {},       // { 'BTC-USD': { ONE_MINUTE: [...], FIVE_MINUTE: [...] } }
  scannerIndicators: {},    // { 'BTC-USD': { ema9: [...], rsi: [...], ... } }
  scannerOrderBooks: {},    // { 'BTC-USD': { bids: [], asks: [], spread: 0 } }
  scannerTradeFlow: {},     // { 'BTC-USD': { buyVolume, sellVolume, ratio } }
  scannerRegimes: {},       // { 'BTC-USD': 'bullish' }
  scannerViperModes: {},    // { 'BTC-USD': 'STRIKE', 'SOL-USD': 'LUNGE' }
  scannerEnabled: lsGet('scannerEnabled', true),
  maxConcurrentPositions: lsGet('maxConcurrentPositions', 3),

  // ---- HYDRA Daily Loss Limit -------------------------------------------
  hydraDailyPnL: 0,
  hydraDailyLossLimit: lsGet('hydraDailyLossLimit', -1.5), // % of portfolio

  // ---- Fee Tier ---------------------------------------------------------
  feeTier: null, // { taker_fee_rate, maker_fee_rate } from getTransactionsSummary

  // ---- UI State -----------------------------------------------------------
  settingsOpen: false,
  aiPanelOpen: false,
  backtestOpen: false,
  alertManagerOpen: false,
  activeBottomTab: null,
  activeLowerIndicator: 'RSI',
  chartIndicators: {
    ema9: true,
    ema21: true,
    ema50: true,
    sma200: false,
    vwap: false,
    bbands: false,
  },

  // =========================================================================
  //  Actions
  // =========================================================================

  // ---- Connection ---------------------------------------------------------
  setWsStatus: (status) => set({ wsStatus: status }),

  // ---- Trading Mode -------------------------------------------------------
  setTradingMode: (mode) => {
    lsSet('tradingMode', mode);
    set({ tradingMode: mode });
  },

  // ---- Market Data --------------------------------------------------------
  setActivePair: (pair) => {
    lsSet('activePair', pair);
    set({ activePair: pair });
  },

  updateTicker: (pairOrBatch, data) =>
    set((s) => {
      if (data === undefined && typeof pairOrBatch === 'object') {
        // Batch mode: updateTicker({ 'BTC-USD': {...}, 'ETH-USD': {...} })
        const updated = { ...s.tickers };
        for (const [pair, tickerData] of Object.entries(pairOrBatch)) {
          updated[pair] = { ...(updated[pair] || {}), ...tickerData };
        }
        return { tickers: updated };
      }
      // Single mode: updateTicker('BTC-USD', {...})
      return {
        tickers: {
          ...s.tickers,
          [pairOrBatch]: { ...(s.tickers[pairOrBatch] || {}), ...data },
        },
      };
    }),

  setOrderBook: (data) =>
    set((s) => {
      const { type, updates } = data;
      if (!updates || updates.length === 0) return {};

      if (type === 'snapshot') {
        // Build full order book from snapshot
        const bids = [];
        const asks = [];
        for (const u of updates) {
          const qty = parseFloat(u.new_quantity);
          if (qty <= 0) continue;
          const entry = [u.price_level, u.new_quantity];
          if (u.side === 'bid') bids.push(entry);
          else if (u.side === 'offer') asks.push(entry);
        }
        return { orderBook: { bids, asks, spread: 0, productId: data.productId } };
      }

      // Incremental update
      const bids = [...s.orderBook.bids];
      const asks = [...s.orderBook.asks];

      for (const u of updates) {
        const arr = u.side === 'bid' ? bids : asks;
        const qty = parseFloat(u.new_quantity);
        const idx = arr.findIndex((lvl) => lvl[0] === u.price_level);

        if (qty <= 0) {
          // Remove level
          if (idx !== -1) arr.splice(idx, 1);
        } else if (idx !== -1) {
          // Update existing level
          arr[idx] = [u.price_level, u.new_quantity];
        } else {
          // Add new level
          arr.push([u.price_level, u.new_quantity]);
        }
      }

      return { orderBook: { bids, asks, spread: 0, productId: data.productId } };
    }),

  addRecentTrade: (trade) =>
    set((s) => ({
      recentTrades: [trade, ...s.recentTrades].slice(0, 20),
    })),

  setCandles: (timeframe, data) =>
    set((s) => ({
      candles: { ...s.candles, [timeframe]: data },
    })),

  addCandle: (timeframe, candle) =>
    set((s) => {
      const existing = s.candles[timeframe] || [];
      if (existing.length === 0) {
        return { candles: { ...s.candles, [timeframe]: [candle] } };
      }
      const last = existing[existing.length - 1];
      // If same timestamp, update last candle; otherwise append
      if (last && last.timestamp === candle.timestamp) {
        const updated = [...existing.slice(0, -1), candle];
        return { candles: { ...s.candles, [timeframe]: updated } };
      }
      return { candles: { ...s.candles, [timeframe]: [...existing, candle] } };
    }),

  setActiveTimeframe: (tf) => set({ activeTimeframe: tf }),

  // ---- Indicators ---------------------------------------------------------
  setIndicators: (data) =>
    set((s) => ({
      indicators: { ...s.indicators, ...data },
    })),

  // ---- Regime Detection ---------------------------------------------------
  setRegime: (regime, timestamp) =>
    set((s) => ({
      currentRegime: regime,
      regimeHistory: [...s.regimeHistory, { regime, timestamp: timestamp || Date.now() }].slice(-100),
    })),

  // ---- Positions & Orders -------------------------------------------------
  setPositions: (positions) => set({ positions }),

  addPosition: (position) =>
    set((s) => ({ positions: [...s.positions, position] })),

  removePosition: (id) =>
    set((s) => ({
      positions: s.positions.filter((p) => p.id !== id),
    })),

  updatePosition: (id, data) =>
    set((s) => ({
      positions: s.positions.map((p) =>
        p.id === id ? { ...p, ...data } : p
      ),
    })),

  setPendingOrders: (orders) => set({ pendingOrders: orders }),

  // ---- Portfolio ----------------------------------------------------------
  setPortfolio: (data) =>
    set((s) => ({
      portfolio: { ...s.portfolio, ...data },
    })),

  updatePaperPortfolio: (data) => {
    const updated = { ...get().paperPortfolio, ...data };
    lsSet('paperPortfolio', updated);
    set({ paperPortfolio: updated });
  },

  // ---- Strategy & Bot -----------------------------------------------------
  setBotRunning: (running) => set({ botRunning: running }),

  addSignal: (signal) =>
    set((s) => ({
      signals: [signal, ...s.signals].slice(0, 50),
    })),

  // ---- Risk Settings ------------------------------------------------------
  setRiskSettings: (settings) => {
    const updated = { ...get().riskSettings, ...settings };
    lsSet('riskSettings', updated);
    set({ riskSettings: updated });
  },

  // ---- Toasts / Alerts ----------------------------------------------------
  addToast: (toast) =>
    set((s) => ({
      toasts: [
        ...s.toasts,
        {
          id: toast.id || `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          type: toast.type || 'info',
          message: toast.message,
          timestamp: toast.timestamp || Date.now(),
        },
      ].slice(-20),
    })),

  removeToast: (id) =>
    set((s) => ({
      toasts: s.toasts.filter((t) => t.id !== id),
    })),

  addAlert: (alert) =>
    set((s) => ({ alerts: [...s.alerts, alert] })),

  addAlertLog: (entry) =>
    set((s) => ({ alertLog: [...s.alertLog, entry].slice(-200) })),

  // ---- UI State -----------------------------------------------------------
  toggleSettings: () => set((s) => ({ settingsOpen: !s.settingsOpen })),
  toggleAIPanel: () => set((s) => ({ aiPanelOpen: !s.aiPanelOpen })),
  toggleBacktest: () => set((s) => ({ backtestOpen: !s.backtestOpen })),
  toggleAlertManager: () => set((s) => ({ alertManagerOpen: !s.alertManagerOpen })),
  setActiveBottomTab: (tab) => set({ activeBottomTab: tab }),

  setChartIndicators: (indicators) =>
    set((s) => ({
      chartIndicators: { ...s.chartIndicators, ...indicators },
    })),

  // ---- Indicator Config ---------------------------------------------------
  setIndicatorConfig: (config) => {
    const updated = { ...get().indicatorConfig, ...config };
    lsSet('indicatorConfig', updated);
    set({ indicatorConfig: updated });
  },

  setIndicatorPreset: (name, config) => {
    const presets = { ...get().indicatorPresets, [name]: config };
    lsSet('indicatorPresets', presets);
    set({ indicatorPresets: presets });
  },

  deleteIndicatorPreset: (name) => {
    const presets = { ...get().indicatorPresets };
    delete presets[name];
    lsSet('indicatorPresets', presets);
    set({ indicatorPresets: presets });
  },

  loadPreset: (name) => {
    const presets = get().indicatorPresets;
    const preset = presets[name];
    if (preset) {
      lsSet('indicatorConfig', preset);
      lsSet('activePreset', name);
      set({ indicatorConfig: preset, activePreset: name });
    }
  },

  // ---- Scalp Session -----------------------------------------------------
  updateScalpSession: (data) =>
    set((s) => ({ scalpSession: { ...s.scalpSession, ...data } })),

  resetScalpSession: () =>
    set({
      scalpSession: {
        streak: 0, wins: 0, losses: 0, netPnL: 0, fees: 0,
        trades: 0, pausedUntil: null, disabled: false, history: [],
      },
    }),

  // ---- Trade Flow --------------------------------------------------------
  setTradeFlow: (data) =>
    set((s) => ({ tradeFlow: { ...s.tradeFlow, ...data } })),

  // ---- Spreads -----------------------------------------------------------
  updateSpread: (pair, spreadData) =>
    set((s) => ({ spreads: { ...s.spreads, [pair]: spreadData } })),

  // ---- Strategy Signals --------------------------------------------------
  setStrategySignal: (strategy, signal) =>
    set((s) => ({
      strategySignals: { ...s.strategySignals, [strategy]: signal },
    })),

  // ---- VIPER State ----------------------------------------------------
  setViperEnabled: (enabled) => {
    lsSet('viperEnabled', enabled);
    set({ viperEnabled: enabled });
  },

  setViperActiveMode: (mode) => set({ viperActiveMode: mode }),

  setViperModeScores: (scores) => set({ viperModeScores: scores }),

  setViperRatchetLevel: (level) => set({ viperRatchetLevel: level }),

  updateViperDailyPnL: (pnl) =>
    set((s) => {
      const newPnL = s.viperDailyPnL + pnl;
      const newHigh = Math.max(s.viperDailyHighPnL, newPnL);
      return {
        viperDailyPnL: newPnL,
        viperDailyHighPnL: newHigh,
        viperDailyTrades: s.viperDailyTrades + 1,
      };
    }),

  resetViperDaily: () =>
    set({
      viperDailyPnL: 0,
      viperDailyHighPnL: 0,
      viperDailyTrades: 0,
      viperRatchetLevel: 'NORMAL',
    }),

  setViperSettings: (settings) => {
    const updated = { ...get().viperSettings, ...settings };
    lsSet('viper_settings', updated);
    set({ viperSettings: updated });
  },

  addViperActivity: (entry) =>
    set((s) => ({
      viperActivity: [
        { ...entry, timestamp: Date.now() },
        ...s.viperActivity,
      ].slice(0, 30),
    })),

  setViperPerformanceLedger: (ledger) => {
    lsSet('viper_performance_ledger', ledger);
    set({ viperPerformanceLedger: ledger });
  },

  setViperReplacementThreat: (threat) => set({ viperReplacementThreat: threat }),

  setAllocationConfig: (config) => {
    lsSet('allocation_config', config);
    set({ allocationConfig: config });
  },

  // ---- HYDRA State ----------------------------------------------------
  setHydraScore: (score) => set({ hydraScore: score }),

  setHydraDimensions: (dims) => set({ hydraDimensions: dims }),

  setHydraEntryThreshold: (threshold) => {
    const clamped = Math.max(65, Math.min(95, threshold));
    lsSet('hydra_entry_threshold', clamped);
    set({ hydraEntryThreshold: clamped });
  },

  setHydraSettings: (settings) => {
    const updated = { ...get().hydraSettings, ...settings };
    lsSet('hydra_settings', updated);
    set({ hydraSettings: updated });
  },

  addHydraActivity: (entry) =>
    set((s) => ({
      hydraActivity: [
        { ...entry, timestamp: Date.now() },
        ...s.hydraActivity,
      ].slice(0, 20),
    })),

  setHydraTradeCount: (count) => set({ hydraTradeCount: count }),

  // ---- Engine State ----------------------------------------------------
  setEngineStatus: (status) => set({ engineStatus: status }),

  addEngineLog: (entry) =>
    set((s) => ({
      engineLog: [
        { ...entry, timestamp: Date.now() },
        ...s.engineLog,
      ].slice(0, 100),
    })),

  addSignalHistory: (signal) =>
    set((s) => ({
      signalHistory: [signal, ...s.signalHistory].slice(0, 200),
    })),

  updateSessionAnalytics: (tradeResult) =>
    set((s) => {
      const prev = s.portfolio;
      const newCount = prev.sessionTradeCount + 1;
      const newPnL = prev.sessionPnL + (tradeResult.netPnL || 0);
      const isWin = (tradeResult.netPnL || 0) > 0;
      // Recalculate win rate: track wins via sessionWinRate * oldCount
      const prevWins = Math.round(prev.sessionWinRate * prev.sessionTradeCount / 100);
      const newWins = prevWins + (isWin ? 1 : 0);
      const newWinRate = newCount > 0 ? (newWins / newCount) * 100 : 0;
      return {
        portfolio: {
          ...prev,
          sessionPnL: newPnL,
          sessionTradeCount: newCount,
          sessionWinRate: newWinRate,
        },
      };
    }),

  // ---- Emergency Stop All ------------------------------------------------
  emergencyStopAll: () => {
    set({
      botRunning: false,
      activeStrategies: {},
      strategySignals: {},
      hydraScore: null,
      hydraDimensions: null,
      viperActiveMode: null,
      viperModeScores: null,
      viperRatchetLevel: 'NORMAL',
      scannerCandles: {},
      scannerIndicators: {},
      scannerOrderBooks: {},
      scannerTradeFlow: {},
      scannerRegimes: {},
      scannerViperModes: {},
    });
  },

  // ---- Scanner Actions --------------------------------------------------
  setScannerPairs: (pairs) => {
    lsSet('scannerPairs', pairs);
    // Clean up data for removed pairs
    const state = get();
    const pairSet = new Set(pairs);
    const cleanObj = (obj) => {
      const cleaned = {};
      for (const key of Object.keys(obj)) {
        if (pairSet.has(key)) cleaned[key] = obj[key];
      }
      return cleaned;
    };
    set({
      scannerPairs: pairs,
      scannerCandles: cleanObj(state.scannerCandles),
      scannerIndicators: cleanObj(state.scannerIndicators),
      scannerOrderBooks: cleanObj(state.scannerOrderBooks),
      scannerTradeFlow: cleanObj(state.scannerTradeFlow),
      scannerRegimes: cleanObj(state.scannerRegimes),
      scannerViperModes: cleanObj(state.scannerViperModes),
    });
  },

  setScannerCandles: (pair, timeframe, candles) =>
    set((s) => ({
      scannerCandles: {
        ...s.scannerCandles,
        [pair]: {
          ...(s.scannerCandles[pair] || {}),
          [timeframe]: candles,
        },
      },
    })),

  addScannerCandle: (pair, timeframe, candle) =>
    set((s) => {
      const pairData = s.scannerCandles[pair] || {};
      const existing = pairData[timeframe] || [];
      let updated;
      if (existing.length === 0) {
        updated = [candle];
      } else {
        const last = existing[existing.length - 1];
        if (last && last.timestamp === candle.timestamp) {
          updated = [...existing.slice(0, -1), candle];
        } else {
          updated = [...existing, candle];
        }
      }
      // Cap at 300 candles
      if (updated.length > 300) {
        updated = updated.slice(updated.length - 300);
      }
      return {
        scannerCandles: {
          ...s.scannerCandles,
          [pair]: { ...pairData, [timeframe]: updated },
        },
      };
    }),

  setScannerIndicators: (pair, indicators) =>
    set((s) => ({
      scannerIndicators: {
        ...s.scannerIndicators,
        [pair]: indicators,
      },
    })),

  setScannerOrderBook: (pair, data) =>
    set((s) => {
      const { type, updates } = data;
      if (!updates || updates.length === 0) return {};

      if (type === 'snapshot') {
        const bids = [];
        const asks = [];
        for (const u of updates) {
          const qty = parseFloat(u.new_quantity);
          if (qty <= 0) continue;
          const entry = [u.price_level, u.new_quantity];
          if (u.side === 'bid') bids.push(entry);
          else if (u.side === 'offer') asks.push(entry);
        }
        return {
          scannerOrderBooks: {
            ...s.scannerOrderBooks,
            [pair]: { bids, asks, spread: 0 },
          },
        };
      }

      // Incremental update
      const prev = s.scannerOrderBooks[pair] || { bids: [], asks: [], spread: 0 };
      const bids = [...prev.bids];
      const asks = [...prev.asks];

      for (const u of updates) {
        const arr = u.side === 'bid' ? bids : asks;
        const qty = parseFloat(u.new_quantity);
        const idx = arr.findIndex((lvl) => lvl[0] === u.price_level);

        if (qty <= 0) {
          if (idx !== -1) arr.splice(idx, 1);
        } else if (idx !== -1) {
          arr[idx] = [u.price_level, u.new_quantity];
        } else {
          arr.push([u.price_level, u.new_quantity]);
        }
      }

      return {
        scannerOrderBooks: {
          ...s.scannerOrderBooks,
          [pair]: { bids, asks, spread: 0 },
        },
      };
    }),

  setScannerTradeFlow: (pair, data) =>
    set((s) => ({
      scannerTradeFlow: {
        ...s.scannerTradeFlow,
        [pair]: { ...(s.scannerTradeFlow[pair] || {}), ...data },
      },
    })),

  setScannerRegime: (pair, regime) =>
    set((s) => ({
      scannerRegimes: { ...s.scannerRegimes, [pair]: regime },
    })),

  setScannerViperMode: (pair, mode) =>
    set((s) => ({
      scannerViperModes: { ...s.scannerViperModes, [pair]: mode },
    })),

  setScannerEnabled: (enabled) => {
    lsSet('scannerEnabled', enabled);
    set({ scannerEnabled: enabled });
  },

  setMaxConcurrentPositions: (n) => {
    lsSet('maxConcurrentPositions', n);
    set({ maxConcurrentPositions: n });
  },

  // ---- HYDRA Daily Loss Limit -------------------------------------------
  updateHydraDailyPnL: (pnl) =>
    set((s) => ({ hydraDailyPnL: s.hydraDailyPnL + pnl })),

  resetHydraDailyPnL: () => set({ hydraDailyPnL: 0 }),

  setHydraDailyLossLimit: (pct) => {
    lsSet('hydraDailyLossLimit', pct);
    set({ hydraDailyLossLimit: pct });
  },

  // ---- Fee Tier ---------------------------------------------------------
  setFeeTier: (data) => set({ feeTier: data }),

  // ---- Active Strategies (persisted) ------------------------------------
  setActiveStrategies: (strategies) => {
    lsSet('activeStrategies', strategies);
    set({ activeStrategies: strategies });
  },

  toggleStrategy: (key) => {
    const current = get().activeStrategies;
    const updated = { ...current, [key]: !current[key] };
    lsSet('activeStrategies', updated);
    set({ activeStrategies: updated });
  },

  // ---- Watchlist & Favorites ----------------------------------------------
  updateWatchlist: (watchlist) => {
    lsSet('watchlist', watchlist);
    set({ watchlist });
  },

  toggleFavorite: (pair) => {
    const { favorites } = get();
    const next = favorites.includes(pair)
      ? favorites.filter((p) => p !== pair)
      : [...favorites, pair];
    lsSet('favorites', next);
    set({ favorites: next });
  },
}));

export default useStore;
