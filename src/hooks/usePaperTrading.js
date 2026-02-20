/* ============================================================
   Cerebro Crypto — usePaperTrading Hook
   ============================================================
   Simulates order fills at live prices, tracks paper
   positions and P&L, and persists state to IndexedDB
   and localStorage.
   ============================================================ */

import { useEffect, useRef, useCallback, useState } from 'react';
import useStore from '../store';
import { savePaperTrade, getPaperTrades } from '../db/indexedDB';
import {
  PAPER_STARTING_BALANCE,
  SLIPPAGE_PCT,
  TAKER_FEE_PCT,
  RISK_DEFAULTS,
} from '../config/constants';

// localStorage keys
const LS_PAPER_BALANCE = 'cerebro-paper-balance';
const LS_PAPER_POSITIONS = 'cerebro-paper-positions';

/**
 * Hook for paper trading simulation.
 * Provides the same interface as live trading hooks so that
 * the rest of the app can swap between modes seamlessly.
 *
 * @returns {{
 *   paperBalance: number,
 *   paperPositions: Array,
 *   paperTrades: Array,
 *   paperEquity: number,
 *   submitPaperOrder: Function,
 *   closePaperPosition: Function,
 *   resetPaperAccount: Function,
 *   loading: boolean
 * }}
 */
export default function usePaperTrading() {
  const [paperBalance, setPaperBalance] = useState(() => {
    const saved = localStorage.getItem(LS_PAPER_BALANCE);
    return saved != null ? parseFloat(saved) : PAPER_STARTING_BALANCE;
  });

  const [paperPositions, setPaperPositions] = useState(() => {
    try {
      const saved = localStorage.getItem(LS_PAPER_POSITIONS);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [paperTrades, setPaperTrades] = useState([]);
  const [loading, setLoading] = useState(false);
  const monitorRef = useRef(null);

  // =========================================================================
  //  Persist to localStorage on state changes
  // =========================================================================
  useEffect(() => {
    localStorage.setItem(LS_PAPER_BALANCE, paperBalance.toString());
  }, [paperBalance]);

  useEffect(() => {
    try {
      localStorage.setItem(LS_PAPER_POSITIONS, JSON.stringify(paperPositions));
    } catch {
      // localStorage full or unavailable
    }
  }, [paperPositions]);

  // =========================================================================
  //  Sync paper state to Zustand store
  // =========================================================================
  useEffect(() => {
    useStore.setState({ paperBalance });
  }, [paperBalance]);

  useEffect(() => {
    const store = useStore.getState();
    if (store.tradingMode === 'paper' && typeof store.setPositions === 'function') {
      store.setPositions(paperPositions);
    }
  }, [paperPositions]);

  // =========================================================================
  //  Load paper trades from IndexedDB on mount
  // =========================================================================
  useEffect(() => {
    async function loadTrades() {
      try {
        const trades = await getPaperTrades();
        setPaperTrades(trades);
      } catch (err) {
        console.warn('[usePaperTrading] Failed to load paper trades:', err);
      }
    }
    loadTrades();
  }, []);

  // =========================================================================
  //  Get current price helper
  // =========================================================================
  const getCurrentPrice = useCallback((pair) => {
    const store = useStore.getState();
    if (store.tickers && store.tickers[pair]) {
      return store.tickers[pair].price;
    }
    if (store.candles && store.candles.length > 0 && store.activePair === pair) {
      return store.candles[store.candles.length - 1].close;
    }
    return null;
  }, []);

  // =========================================================================
  //  Calculate paper equity (balance + open positions mark-to-market)
  // =========================================================================
  const calculateEquity = useCallback(() => {
    let openValue = 0;
    for (const pos of paperPositions) {
      if (pos.status !== 'open') continue;
      const price = getCurrentPrice(pos.pair);
      if (price != null) {
        openValue += pos.qty * price;
      } else {
        openValue += pos.qty * pos.entryPrice;
      }
    }
    return paperBalance + openValue;
  }, [paperBalance, paperPositions, getCurrentPrice]);

  // =========================================================================
  //  Submit a paper order
  // =========================================================================
  const submitPaperOrder = useCallback((orderData) => {
    const pair = orderData.pair || useStore.getState().activePair;
    const side = orderData.side; // 'BUY' or 'SELL'
    const orderType = orderData.orderType || 'market';

    let fillPrice;

    if (orderType === 'limit') {
      fillPrice = parseFloat(orderData.limitPrice);
    } else {
      const currentPrice = getCurrentPrice(pair);
      if (currentPrice == null) {
        dispatchToast('error', 'No price data for paper order');
        return { success: false, errors: ['No price data'] };
      }
      // Apply slippage
      fillPrice = side === 'BUY'
        ? currentPrice * (1 + SLIPPAGE_PCT / 100)
        : currentPrice * (1 - SLIPPAGE_PCT / 100);
    }

    const qty = orderData.baseSize || (orderData.quoteSize ? orderData.quoteSize / fillPrice : 0);
    if (qty <= 0) {
      dispatchToast('error', 'Invalid order quantity');
      return { success: false, errors: ['Invalid quantity'] };
    }

    const notionalValue = qty * fillPrice;
    const fees = notionalValue * (TAKER_FEE_PCT / 10000);
    const totalCost = notionalValue + fees;

    // Balance check for buys
    if (side === 'BUY' && totalCost > paperBalance) {
      dispatchToast('error', `Insufficient paper balance: need $${totalCost.toFixed(2)}, have $${paperBalance.toFixed(2)}`);
      return { success: false, errors: ['Insufficient balance'] };
    }

    // Risk settings for SL/TP
    const store = useStore.getState();
    const risk = store.riskSettings || RISK_DEFAULTS;
    const riskPerShare = fillPrice * (risk.stopLossPct / 100);

    const isLong = side === 'BUY';
    const stopLoss = orderData.stopLoss || (isLong ? fillPrice - riskPerShare : fillPrice + riskPerShare);
    const tp1Price = orderData.tp1Price || (isLong ? fillPrice + riskPerShare * risk.tp1R : fillPrice - riskPerShare * risk.tp1R);
    const tp2Price = orderData.tp2Price || (isLong ? fillPrice + riskPerShare * risk.tp2R : fillPrice - riskPerShare * risk.tp2R);

    const positionId = `paper-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const newPosition = {
      id: positionId,
      pair,
      direction: isLong ? 'long' : 'short',
      entryPrice: fillPrice,
      qty,
      notionalValue,
      fees,
      stopLoss,
      tp1Price,
      tp2Price,
      tp1Hit: false,
      trailingActive: false,
      trailingStop: null,
      trailingStopDistance: riskPerShare,
      strategy: orderData.strategy || 'manual',
      entryTime: Date.now(),
      status: 'open',
      mode: 'paper',
    };

    // Update balance
    if (isLong) {
      setPaperBalance((prev) => prev - totalCost);
    } else {
      // Short: receive proceeds minus fees
      setPaperBalance((prev) => prev + notionalValue - fees);
    }

    // Add position
    setPaperPositions((prev) => [...prev, newPosition]);

    dispatchToast('info', `Paper ${side}: ${qty.toFixed(6)} ${pair} @ $${fillPrice.toFixed(2)}`);

    return { success: true, orderId: positionId, paper: true };
  }, [paperBalance, getCurrentPrice]);

  // =========================================================================
  //  Close a paper position
  // =========================================================================
  const closePaperPosition = useCallback(async (positionId, exitData = {}) => {
    const pos = paperPositions.find((p) => p.id === positionId);
    if (!pos) return;

    const exitPrice = exitData.exitPrice || getCurrentPrice(pos.pair);
    if (exitPrice == null) {
      dispatchToast('error', 'No current price available to close position');
      return;
    }

    const closeQty = exitData.qty || pos.qty;
    const direction = pos.direction === 'short' ? -1 : 1;
    const realizedPnL = direction * (exitPrice - pos.entryPrice) * closeQty;
    const fees = closeQty * exitPrice * (TAKER_FEE_PCT / 10000);

    // Return capital
    const proceeds = pos.direction === 'long'
      ? closeQty * exitPrice - fees
      : closeQty * (pos.entryPrice - exitPrice) + closeQty * pos.entryPrice - fees;

    setPaperBalance((prev) => prev + (pos.direction === 'long' ? closeQty * exitPrice - fees : closeQty * pos.entryPrice + realizedPnL - fees));

    // Update or remove position
    if (closeQty >= pos.qty) {
      // Full close
      setPaperPositions((prev) => prev.filter((p) => p.id !== positionId));
    } else {
      // Partial close
      setPaperPositions((prev) =>
        prev.map((p) =>
          p.id === positionId
            ? { ...p, qty: p.qty - closeQty }
            : p
        )
      );
    }

    // Save trade record
    const tradeRecord = {
      id: `paper-trade-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      pair: pos.pair,
      direction: pos.direction,
      entryPrice: pos.entryPrice,
      exitPrice,
      qty: closeQty,
      realizedPnL: parseFloat(realizedPnL.toFixed(2)),
      fees: parseFloat(fees.toFixed(2)),
      reason: exitData.reason || 'Manual close',
      strategy: pos.strategy,
      entryTime: pos.entryTime,
      exitTime: Date.now(),
      timestamp: Date.now(),
      mode: 'paper',
    };

    try {
      await savePaperTrade(tradeRecord);
    } catch (err) {
      console.warn('[usePaperTrading] Failed to save trade to IndexedDB:', err);
    }

    setPaperTrades((prev) => [tradeRecord, ...prev]);

    // Update store trade log
    const store = useStore.getState();
    if (typeof store.addTradeLog === 'function') {
      store.addTradeLog(tradeRecord);
    }

    dispatchToast('info', `Paper position closed: ${pos.pair} PnL $${realizedPnL.toFixed(2)}`);
  }, [paperPositions, getCurrentPrice]);

  // =========================================================================
  //  Monitor paper positions for SL/TP (when in paper mode)
  // =========================================================================
  useEffect(() => {
    monitorRef.current = setInterval(() => {
      const store = useStore.getState();
      if (store.tradingMode !== 'paper') return;

      for (const pos of paperPositions) {
        if (pos.status !== 'open') continue;
        const currentPrice = getCurrentPrice(pos.pair);
        if (currentPrice == null) continue;

        const isLong = pos.direction !== 'short';

        // Stop-loss
        if (pos.stopLoss != null) {
          const hit = isLong ? currentPrice <= pos.stopLoss : currentPrice >= pos.stopLoss;
          if (hit) {
            closePaperPosition(pos.id, {
              exitPrice: pos.stopLoss * (isLong ? (1 - SLIPPAGE_PCT / 100) : (1 + SLIPPAGE_PCT / 100)),
              reason: 'Stop-loss triggered',
            });
            continue;
          }
        }

        // TP1 (partial 50%)
        if (!pos.tp1Hit && pos.tp1Price != null) {
          const hit = isLong ? currentPrice >= pos.tp1Price : currentPrice <= pos.tp1Price;
          if (hit) {
            const closeQty = pos.qty * 0.5;
            closePaperPosition(pos.id, {
              exitPrice: pos.tp1Price,
              qty: closeQty,
              reason: 'TP1 hit (1.5R)',
            });
            // Mark TP1 hit, move stop to break-even
            setPaperPositions((prev) =>
              prev.map((p) =>
                p.id === pos.id
                  ? {
                      ...p,
                      tp1Hit: true,
                      stopLoss: p.entryPrice,
                      trailingActive: true,
                      trailingStop: isLong
                        ? currentPrice - p.trailingStopDistance
                        : currentPrice + p.trailingStopDistance,
                    }
                  : p
              )
            );
            continue;
          }
        }

        // TP2 (close remainder)
        if (pos.tp1Hit && pos.tp2Price != null) {
          const hit = isLong ? currentPrice >= pos.tp2Price : currentPrice <= pos.tp2Price;
          if (hit) {
            closePaperPosition(pos.id, {
              exitPrice: pos.tp2Price,
              reason: 'TP2 hit (3R)',
            });
            continue;
          }
        }

        // Trailing stop
        if (pos.tp1Hit && pos.trailingActive && pos.trailingStop != null) {
          // Update trailing stop
          if (isLong && currentPrice - pos.trailingStopDistance > pos.trailingStop) {
            setPaperPositions((prev) =>
              prev.map((p) =>
                p.id === pos.id
                  ? { ...p, trailingStop: currentPrice - p.trailingStopDistance }
                  : p
              )
            );
          } else if (!isLong && currentPrice + pos.trailingStopDistance < pos.trailingStop) {
            setPaperPositions((prev) =>
              prev.map((p) =>
                p.id === pos.id
                  ? { ...p, trailingStop: currentPrice + p.trailingStopDistance }
                  : p
              )
            );
          }

          const trailingHit = isLong
            ? currentPrice <= pos.trailingStop
            : currentPrice >= pos.trailingStop;

          if (trailingHit) {
            closePaperPosition(pos.id, {
              exitPrice: pos.trailingStop,
              reason: 'Trailing stop triggered',
            });
          }
        }
      }
    }, 500);

    return () => {
      if (monitorRef.current) {
        clearInterval(monitorRef.current);
      }
    };
  }, [paperPositions, getCurrentPrice, closePaperPosition]);

  // =========================================================================
  //  Reset paper account
  // =========================================================================
  const resetPaperAccount = useCallback(() => {
    setPaperBalance(PAPER_STARTING_BALANCE);
    setPaperPositions([]);
    setPaperTrades([]);
    localStorage.removeItem(LS_PAPER_BALANCE);
    localStorage.removeItem(LS_PAPER_POSITIONS);
    useStore.setState({ paperBalance: PAPER_STARTING_BALANCE });

    dispatchToast('info', `Paper account reset to $${PAPER_STARTING_BALANCE.toLocaleString()}`);
  }, []);

  // =========================================================================
  //  Toast helper
  // =========================================================================
  function dispatchToast(type, message) {
    const store = useStore.getState();
    if (typeof store.addToast === 'function') {
      store.addToast({ type, message, timestamp: Date.now() });
    } else {
      if (type === 'error') console.error('[PaperTrading]', message);
      else console.log('[PaperTrading]', message);
    }
  }

  return {
    paperBalance,
    paperPositions,
    paperTrades,
    paperEquity: calculateEquity(),
    submitPaperOrder,
    closePaperPosition,
    resetPaperAccount,
    loading,
  };
}
