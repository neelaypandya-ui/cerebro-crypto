/* ============================================================
   Cerebro Crypto — useOrders Hook
   ============================================================
   Manages order submission, cancellation, monitoring of
   pending orders, partial fills, and limit order timeouts.
   ============================================================ */

import { useEffect, useRef, useCallback } from 'react';
import useStore from '../store';
import useCoinbaseREST from './useCoinbaseREST';
import { RISK_DEFAULTS, SLIPPAGE_PCT, TAKER_FEE_PCT } from '../config/constants';

// Default limit order timeout in milliseconds (60 seconds)
const LIMIT_ORDER_TIMEOUT_MS = 60 * 1000;

/**
 * Hook for order lifecycle management.
 *
 * @returns {{
 *   submitOrder: Function,
 *   cancelOrder: Function,
 *   pendingOrders: Array,
 *   orderHistory: Array
 * }}
 */
export default function useOrders() {
  const tradingMode = useStore((s) => s.tradingMode);
  const activePair = useStore((s) => s.activePair);

  const { placeOrder, cancelOrder: cancelOrderREST, fetchOrders } = useCoinbaseREST();

  // Track limit order timeout timers
  const timeoutsRef = useRef(new Map());
  // Track monitoring interval
  const monitorRef = useRef(null);

  // =========================================================================
  //  Risk validation before order submission
  // =========================================================================
  const validateOrder = useCallback((orderData) => {
    const store = useStore.getState();
    const errors = [];

    // Get current risk settings (from store or defaults)
    const riskSettings = store.riskSettings || RISK_DEFAULTS;

    // Check max positions
    const openPositions = store.positions || [];
    if (openPositions.length >= riskSettings.maxPositions) {
      errors.push(`Maximum positions (${riskSettings.maxPositions}) reached`);
    }

    // Check max daily trades
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayTrades = (store.tradeLog || []).filter(
      (t) => t.entryTime >= todayStart.getTime()
    );
    if (todayTrades.length >= riskSettings.maxTradesPerDay) {
      errors.push(`Maximum daily trades (${riskSettings.maxTradesPerDay}) reached`);
    }

    // Check daily loss limit
    const todayPnL = todayTrades.reduce((sum, t) => sum + (t.realizedPnL || 0), 0);
    if (todayPnL <= -riskSettings.maxDailyLossUSD) {
      errors.push(`Daily loss limit ($${riskSettings.maxDailyLossUSD}) reached`);
    }

    // Check pair cooldown
    const pairTrades = todayTrades.filter((t) => t.pair === orderData.pair);
    if (pairTrades.length > 0) {
      const lastTrade = pairTrades[0]; // sorted newest-first
      const cooldownMs = riskSettings.pairCooldownMinutes * 60 * 1000;
      if (Date.now() - (lastTrade.exitTime || lastTrade.entryTime) < cooldownMs) {
        errors.push(`Pair cooldown (${riskSettings.pairCooldownMinutes}min) active for ${orderData.pair}`);
      }
    }

    // Check position size limit
    const balance = tradingMode === 'paper'
      ? (store.paperBalance || 0)
      : (store.portfolio || []).reduce((sum, a) => a.currency === 'USD' ? sum + a.available : sum, 0);

    const maxPositionValue = balance * (riskSettings.positionSizePct / 100);
    if (orderData.notionalValue && orderData.notionalValue > maxPositionValue) {
      errors.push(`Order value exceeds ${riskSettings.positionSizePct}% position size limit`);
    }

    return { valid: errors.length === 0, errors };
  }, [tradingMode]);

  // =========================================================================
  //  Submit an order
  // =========================================================================
  const submitOrder = useCallback(async (orderData) => {
    const store = useStore.getState();

    // Validate
    const validation = validateOrder(orderData);
    if (!validation.valid) {
      if (typeof store.addToast === 'function') {
        store.addToast({
          type: 'error',
          message: `Order rejected: ${validation.errors.join('; ')}`,
          timestamp: Date.now(),
        });
      }
      return { success: false, errors: validation.errors };
    }

    const isPaper = store.tradingMode === 'paper';

    if (isPaper) {
      // ---- Paper mode: simulate order fill ----
      return simulatePaperOrder(orderData);
    }

    // ---- Live mode: submit via REST ----
    try {
      const pair = orderData.pair || store.activePair;
      const side = orderData.side; // 'BUY' or 'SELL'
      const orderType = orderData.orderType || 'market';

      let orderConfig;

      if (orderType === 'market') {
        orderConfig = {
          market_market_ioc: {
            ...(orderData.baseSize
              ? { base_size: orderData.baseSize.toString() }
              : { quote_size: orderData.quoteSize.toString() }
            ),
          },
        };
      } else if (orderType === 'limit') {
        orderConfig = {
          limit_limit_gtc: {
            base_size: orderData.baseSize.toString(),
            limit_price: orderData.limitPrice.toString(),
            post_only: orderData.postOnly || false,
          },
        };
      }

      const clientOrderId = `cerebro-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      const result = await placeOrder({
        product_id: pair,
        side,
        order_configuration: orderConfig,
        client_order_id: clientOrderId,
      });

      // Set up limit order timeout
      if (orderType === 'limit' && result.order_id) {
        const timeoutId = setTimeout(() => {
          handleLimitOrderTimeout(result.order_id);
        }, orderData.timeout || LIMIT_ORDER_TIMEOUT_MS);
        timeoutsRef.current.set(result.order_id, timeoutId);
      }

      return { success: true, orderId: result.order_id };
    } catch (error) {
      return { success: false, errors: [error.message] };
    }
  }, [validateOrder, placeOrder]);

  // =========================================================================
  //  Paper order simulation
  // =========================================================================
  function simulatePaperOrder(orderData) {
    const store = useStore.getState();

    // Get current price
    const pair = orderData.pair || store.activePair;
    let fillPrice;

    if (orderData.orderType === 'limit') {
      fillPrice = parseFloat(orderData.limitPrice);
    } else {
      // Market order: use current ticker price with slippage
      const tickers = store.tickers || {};
      const candles = store.candles || [];
      const currentPrice = tickers[pair]?.price ||
        (candles.length > 0 ? candles[candles.length - 1].close : null);

      if (currentPrice == null) {
        if (typeof store.addToast === 'function') {
          store.addToast({ type: 'error', message: 'No price data available for paper order', timestamp: Date.now() });
        }
        return { success: false, errors: ['No price data available'] };
      }

      // Apply slippage
      fillPrice = orderData.side === 'BUY'
        ? currentPrice * (1 + SLIPPAGE_PCT / 100)
        : currentPrice * (1 - SLIPPAGE_PCT / 100);
    }

    const qty = orderData.baseSize || (orderData.quoteSize / fillPrice);
    const notionalValue = qty * fillPrice;
    const fees = notionalValue * (TAKER_FEE_PCT / 10000); // TAKER_FEE_PCT is in basis points (0.6 = 0.006%)

    // Check paper balance
    if (orderData.side === 'BUY' && notionalValue + fees > (store.paperBalance || 0)) {
      if (typeof store.addToast === 'function') {
        store.addToast({ type: 'error', message: 'Insufficient paper balance', timestamp: Date.now() });
      }
      return { success: false, errors: ['Insufficient paper balance'] };
    }

    // Create position from order
    const positionId = `paper-pos-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Calculate SL/TP levels
    const riskSettings = store.riskSettings || RISK_DEFAULTS;
    const riskPerShare = fillPrice * (riskSettings.stopLossPct / 100);
    const stopLoss = orderData.side === 'BUY'
      ? fillPrice - riskPerShare
      : fillPrice + riskPerShare;
    const tp1Price = orderData.side === 'BUY'
      ? fillPrice + riskPerShare * riskSettings.tp1R
      : fillPrice - riskPerShare * riskSettings.tp1R;
    const tp2Price = orderData.side === 'BUY'
      ? fillPrice + riskPerShare * riskSettings.tp2R
      : fillPrice - riskPerShare * riskSettings.tp2R;

    const position = {
      id: positionId,
      pair,
      direction: orderData.side === 'BUY' ? 'long' : 'short',
      entryPrice: fillPrice,
      qty,
      notionalValue,
      fees,
      stopLoss: orderData.stopLoss || stopLoss,
      tp1Price: orderData.tp1Price || tp1Price,
      tp2Price: orderData.tp2Price || tp2Price,
      tp1Hit: false,
      trailingActive: false,
      trailingStop: null,
      trailingStopDistance: riskPerShare,
      strategy: orderData.strategy || 'manual',
      entryTime: Date.now(),
      status: 'open',
      mode: 'paper',
    };

    // Update paper balance
    if (typeof store.setPaperBalance === 'function') {
      const cost = orderData.side === 'BUY' ? notionalValue + fees : -notionalValue + fees;
      store.setPaperBalance((store.paperBalance || 0) - cost);
    }

    // Add position to store
    if (typeof store.addPosition === 'function') {
      store.addPosition(position);
    }

    if (typeof store.addToast === 'function') {
      store.addToast({
        type: 'info',
        message: `Paper ${orderData.side}: ${qty.toFixed(6)} ${pair} @ $${fillPrice.toFixed(2)}`,
        timestamp: Date.now(),
      });
    }

    return { success: true, orderId: positionId, paper: true };
  }

  // =========================================================================
  //  Cancel an order
  // =========================================================================
  const cancelOrder = useCallback(async (orderId) => {
    const store = useStore.getState();
    const isPaper = store.tradingMode === 'paper';

    // Clear timeout if exists
    if (timeoutsRef.current.has(orderId)) {
      clearTimeout(timeoutsRef.current.get(orderId));
      timeoutsRef.current.delete(orderId);
    }

    if (isPaper) {
      // Paper mode: remove from pending orders in store
      if (typeof store.removePendingOrder === 'function') {
        store.removePendingOrder(orderId);
      }
      if (typeof store.addToast === 'function') {
        store.addToast({ type: 'info', message: `Paper order ${orderId} cancelled`, timestamp: Date.now() });
      }
      return { success: true };
    }

    // Live mode
    return cancelOrderREST(orderId);
  }, [cancelOrderREST]);

  // =========================================================================
  //  Handle limit order timeout
  // =========================================================================
  const handleLimitOrderTimeout = useCallback(async (orderId) => {
    timeoutsRef.current.delete(orderId);

    const store = useStore.getState();
    const pendingOrders = store.pendingOrders || [];
    const order = pendingOrders.find((o) => o.orderId === orderId);

    if (!order || order.status === 'filled') return;

    // Cancel the timed-out order
    if (typeof store.addToast === 'function') {
      store.addToast({
        type: 'warning',
        message: `Limit order ${orderId} timed out — cancelling`,
        timestamp: Date.now(),
      });
    }

    await cancelOrder(orderId);
  }, [cancelOrder]);

  // =========================================================================
  //  Monitor pending orders for partial fills
  // =========================================================================
  useEffect(() => {
    monitorRef.current = setInterval(() => {
      const store = useStore.getState();
      const pendingOrders = store.pendingOrders || [];

      for (const order of pendingOrders) {
        if (order.status === 'partially_filled' && typeof store.addToast === 'function') {
          const fillPct = order.filledSize && order.totalSize
            ? ((order.filledSize / order.totalSize) * 100).toFixed(1)
            : '?';
          // Only notify once per fill level (use a tracker in the order object)
          if (order._lastNotifiedFill !== fillPct) {
            store.addToast({
              type: 'info',
              message: `Order ${order.orderId} partially filled: ${fillPct}%`,
              timestamp: Date.now(),
            });
            if (typeof store.updatePendingOrder === 'function') {
              store.updatePendingOrder(order.orderId, { _lastNotifiedFill: fillPct });
            }
          }
        }
      }
    }, 2000);

    return () => {
      if (monitorRef.current) {
        clearInterval(monitorRef.current);
        monitorRef.current = null;
      }
      // Clear all timeout timers
      for (const [, timer] of timeoutsRef.current) {
        clearTimeout(timer);
      }
      timeoutsRef.current.clear();
    };
  }, []);

  // Read from store
  const pendingOrders = useStore((s) => s.pendingOrders || []);
  const orderHistory = useStore((s) => s.orders || []);

  return {
    submitOrder,
    cancelOrder,
    pendingOrders,
    orderHistory,
  };
}
