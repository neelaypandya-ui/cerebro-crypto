/* ============================================================
   Cerebro Crypto — usePositions Hook
   ============================================================
   Tracks open positions, monitors real-time P&L, and handles
   stop-loss / take-profit execution.
   ============================================================ */

import { useEffect, useRef, useCallback } from 'react';
import useStore from '../store';
import { coinbaseREST } from '../services/coinbaseREST';
import { RISK_DEFAULTS, SLIPPAGE_PCT } from '../config/constants';

/**
 * Hook for managing positions with real-time P&L monitoring
 * and automatic stop-loss / take-profit execution.
 *
 * @returns {{
 *   positions: Array,
 *   closePosition: Function,
 *   updateStopLoss: Function,
 *   updateTakeProfit: Function
 * }}
 */
export default function usePositions() {
  const tradingMode = useStore((s) => s.tradingMode);
  const activePair = useStore((s) => s.activePair);
  const checkIntervalRef = useRef(null);

  // =========================================================================
  //  Get current price for a pair from store tickers
  // =========================================================================
  const getCurrentPrice = useCallback((pair) => {
    const store = useStore.getState();
    // Try ticker data first
    if (store.tickers && store.tickers[pair]) {
      return store.tickers[pair].price;
    }
    // Fallback: last candle close
    if (store.candles && store.candles.length > 0 && store.activePair === pair) {
      return store.candles[store.candles.length - 1].close;
    }
    return null;
  }, []);

  // =========================================================================
  //  Calculate real-time P&L for all positions
  // =========================================================================
  const updatePositionsPnL = useCallback(() => {
    const store = useStore.getState();
    const positions = store.positions || [];
    if (positions.length === 0) return;

    let updated = false;
    const updatedPositions = positions.map((pos) => {
      const currentPrice = getCurrentPrice(pos.pair);
      if (currentPrice == null) return pos;

      const direction = pos.direction === 'short' ? -1 : 1;
      const unrealizedPnL = direction * (currentPrice - pos.entryPrice) * pos.qty;
      const unrealizedPnLPct = direction * ((currentPrice - pos.entryPrice) / pos.entryPrice) * 100;

      if (pos.unrealizedPnL !== unrealizedPnL) {
        updated = true;
      }

      return {
        ...pos,
        currentPrice,
        unrealizedPnL: parseFloat(unrealizedPnL.toFixed(2)),
        unrealizedPnLPct: parseFloat(unrealizedPnLPct.toFixed(2)),
      };
    });

    if (updated && typeof store.setPositions === 'function') {
      store.setPositions(updatedPositions);
    }
  }, [getCurrentPrice]);

  // =========================================================================
  //  Check stop-loss and take-profit levels
  // =========================================================================
  const checkStopLossTP = useCallback(async () => {
    const store = useStore.getState();
    const positions = store.positions || [];
    const isPaper = store.tradingMode === 'paper';

    for (const pos of positions) {
      if (pos.status !== 'open') continue;

      const currentPrice = getCurrentPrice(pos.pair);
      if (currentPrice == null) continue;

      const isLong = pos.direction !== 'short';

      // Check stop-loss
      if (pos.stopLoss != null) {
        const stopHit = isLong
          ? currentPrice <= pos.stopLoss
          : currentPrice >= pos.stopLoss;

        if (stopHit) {
          await executeExit(pos, pos.stopLoss, 'Stop-loss triggered', pos.qty, isPaper);
          continue;
        }
      }

      // Check TP1 (partial close: 50%)
      if (!pos.tp1Hit && pos.tp1Price != null) {
        const tp1Hit = isLong
          ? currentPrice >= pos.tp1Price
          : currentPrice <= pos.tp1Price;

        if (tp1Hit) {
          const closeQty = pos.qty * 0.5;
          await executeExit(pos, pos.tp1Price, 'TP1 hit (1.5R)', closeQty, isPaper);

          // Mark TP1 as hit, move stop to break-even, activate trailing
          if (typeof store.updatePosition === 'function') {
            store.updatePosition(pos.id, {
              tp1Hit: true,
              qty: pos.qty - closeQty,
              stopLoss: pos.entryPrice, // Move to break-even
              trailingActive: true,
            });
          }
          continue;
        }
      }

      // Check TP2 (close remainder)
      if (pos.tp1Hit && pos.tp2Price != null) {
        const tp2Hit = isLong
          ? currentPrice >= pos.tp2Price
          : currentPrice <= pos.tp2Price;

        if (tp2Hit) {
          await executeExit(pos, pos.tp2Price, 'TP2 hit (3R)', pos.qty, isPaper);
          continue;
        }
      }

      // Trailing stop (active after TP1)
      if (pos.tp1Hit && pos.trailingActive && pos.trailingStop != null) {
        // Update trailing stop level
        if (isLong && currentPrice - pos.trailingStopDistance > pos.trailingStop) {
          if (typeof store.updatePosition === 'function') {
            store.updatePosition(pos.id, {
              trailingStop: currentPrice - pos.trailingStopDistance,
            });
          }
        }

        const trailingHit = isLong
          ? currentPrice <= pos.trailingStop
          : currentPrice >= pos.trailingStop;

        if (trailingHit) {
          await executeExit(pos, pos.trailingStop, 'Trailing stop triggered', pos.qty, isPaper);
        }
      }
    }
  }, [getCurrentPrice]);

  // =========================================================================
  //  Execute an exit (paper or live)
  // =========================================================================
  async function executeExit(position, exitPrice, reason, qty, isPaper) {
    const store = useStore.getState();
    const slippageAdjusted = position.direction !== 'short'
      ? exitPrice * (1 - SLIPPAGE_PCT / 100)
      : exitPrice * (1 + SLIPPAGE_PCT / 100);

    const direction = position.direction === 'short' ? -1 : 1;
    const realizedPnL = direction * (slippageAdjusted - position.entryPrice) * qty;

    if (isPaper) {
      // Paper mode: update state directly
      if (typeof store.closePaperPosition === 'function') {
        store.closePaperPosition(position.id, {
          exitPrice: slippageAdjusted,
          reason,
          qty,
          realizedPnL,
          exitTime: Date.now(),
        });
      } else if (typeof store.removePosition === 'function') {
        store.removePosition(position.id);
      }
    } else {
      // Live mode: place a market order to close via REST
      try {
        const side = position.direction === 'short' ? 'BUY' : 'SELL';
        await coinbaseREST.createOrder({
          product_id: position.pair,
          side,
          order_configuration: {
            market_market_ioc: {
              base_size: qty.toString(),
            },
          },
          client_order_id: `cerebro-exit-${position.id}-${Date.now()}`,
        });
      } catch (error) {
        console.error('[usePositions] Failed to execute live exit:', error);
        if (typeof store.addToast === 'function') {
          store.addToast({ type: 'error', message: `Exit failed: ${error.message}`, timestamp: Date.now() });
        }
        return; // Don't mark position as closed if the order failed
      }
    }

    // Log the trade
    if (typeof store.addTradeLog === 'function') {
      store.addTradeLog({
        id: `trade-${position.id}-${Date.now()}`,
        pair: position.pair,
        direction: position.direction,
        entryPrice: position.entryPrice,
        exitPrice: slippageAdjusted,
        qty,
        realizedPnL: parseFloat(realizedPnL.toFixed(2)),
        reason,
        strategy: position.strategy,
        entryTime: position.entryTime,
        exitTime: Date.now(),
        mode: isPaper ? 'paper' : 'live',
      });
    }
  }

  // =========================================================================
  //  Close a position manually
  // =========================================================================
  const closePosition = useCallback(async (positionId) => {
    const store = useStore.getState();
    const positions = store.positions || [];
    const pos = positions.find((p) => p.id === positionId);
    if (!pos) return;

    const currentPrice = getCurrentPrice(pos.pair);
    if (currentPrice == null) {
      if (typeof store.addToast === 'function') {
        store.addToast({ type: 'error', message: 'Cannot close: no current price available', timestamp: Date.now() });
      }
      return;
    }

    const isPaper = store.tradingMode === 'paper';
    await executeExit(pos, currentPrice, 'Manual close', pos.qty, isPaper);
  }, [getCurrentPrice]);

  // =========================================================================
  //  Update stop-loss for a position
  // =========================================================================
  const updateStopLoss = useCallback((positionId, newStopLoss) => {
    const store = useStore.getState();
    if (typeof store.updatePosition === 'function') {
      store.updatePosition(positionId, { stopLoss: newStopLoss });
    }
  }, []);

  // =========================================================================
  //  Update take-profit for a position
  // =========================================================================
  const updateTakeProfit = useCallback((positionId, { tp1Price, tp2Price }) => {
    const store = useStore.getState();
    if (typeof store.updatePosition === 'function') {
      store.updatePosition(positionId, {
        ...(tp1Price != null && { tp1Price }),
        ...(tp2Price != null && { tp2Price }),
      });
    }
  }, []);

  // =========================================================================
  //  Start monitoring interval
  // =========================================================================
  useEffect(() => {
    // Check SL/TP every 500ms
    checkIntervalRef.current = setInterval(() => {
      updatePositionsPnL();
      checkStopLossTP();
    }, 500);

    return () => {
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
        checkIntervalRef.current = null;
      }
    };
  }, [updatePositionsPnL, checkStopLossTP]);

  // Read positions from store for return value
  const positions = useStore((s) => s.positions || []);

  return {
    positions,
    closePosition,
    updateStopLoss,
    updateTakeProfit,
  };
}
