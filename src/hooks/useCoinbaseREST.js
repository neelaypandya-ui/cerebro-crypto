/* ============================================================
   Cerebro Crypto — useCoinbaseREST Hook
   ============================================================
   Provides REST API data fetching functions that integrate
   with the Zustand store, IndexedDB caching, and toast
   notifications for error handling.
   ============================================================ */

import { useCallback } from 'react';
import useStore from '../store';
import { coinbaseREST } from '../services/coinbaseREST';
import { saveCandles, getCandles as getCachedCandles } from '../db/indexedDB';

// =========================================================================
//  Toast helper — dispatches an error/info toast to the store
// =========================================================================
function dispatchToast(type, message) {
  const store = useStore.getState();
  if (typeof store.addToast === 'function') {
    store.addToast({ type, message, timestamp: Date.now() });
  } else {
    // Fallback if toast system not yet wired in store
    if (type === 'error') console.error('[REST]', message);
    else console.log('[REST]', message);
  }
}

// =========================================================================
//  Timeframe label to Coinbase granularity mapping
// =========================================================================
const GRANULARITY_MAP = {
  ONE_MINUTE: 'ONE_MINUTE',
  FIVE_MINUTE: 'FIVE_MINUTE',
  FIFTEEN_MINUTE: 'FIFTEEN_MINUTE',
  ONE_HOUR: 'ONE_HOUR',
  FOUR_HOUR: 'SIX_HOUR', // Coinbase does not have 4H, closest is 6H; adjust if needed
  ONE_DAY: 'ONE_DAY',
  ONE_WEEK: 'ONE_DAY', // Weekly assembled from daily
};

/**
 * Hook that exposes REST API fetching functions.
 * Each function handles loading states, errors, and store updates.
 */
export default function useCoinbaseREST() {
  // =========================================================================
  //  fetchProducts — get available trading pairs
  // =========================================================================
  const fetchProducts = useCallback(async () => {
    const store = useStore.getState();
    try {
      if (typeof store.setProductsLoading === 'function') store.setProductsLoading(true);

      const response = await coinbaseREST.getProducts();
      const products = response.products || response || [];

      if (typeof store.setProducts === 'function') {
        store.setProducts(products);
      }

      return products;
    } catch (error) {
      dispatchToast('error', `Failed to fetch products: ${error.message}`);
      return [];
    } finally {
      if (typeof store.setProductsLoading === 'function') store.setProductsLoading(false);
    }
  }, []);

  // =========================================================================
  //  fetchCandles — fetch OHLCV data with IndexedDB caching
  // =========================================================================
  const fetchCandles = useCallback(async (pair, timeframe, start, end) => {
    const store = useStore.getState();
    try {
      if (typeof store.setCandlesLoading === 'function') store.setCandlesLoading(true);

      // Try cache first
      const cached = await getCachedCandles(pair, timeframe, start, end);
      if (cached && cached.length > 0) {
        if (typeof store.setCandles === 'function') {
          store.setCandles(timeframe, cached);
        }

        // Still fetch fresh data in the background to update cache
        fetchCandlesFresh(pair, timeframe, start, end).catch(() => {});
        return cached;
      }

      // No cache — fetch from REST
      const candles = await fetchCandlesFresh(pair, timeframe, start, end);
      return candles;
    } catch (error) {
      dispatchToast('error', `Failed to fetch candles for ${pair}: ${error.message}`);
      return [];
    } finally {
      if (typeof store.setCandlesLoading === 'function') store.setCandlesLoading(false);
    }
  }, []);

  /**
   * Internal: fetch candles from REST and save to cache + store.
   */
  async function fetchCandlesFresh(pair, timeframe, start, end) {
    const params = {
      granularity: GRANULARITY_MAP[timeframe] || timeframe,
    };
    if (start) params.start = typeof start === 'number' ? Math.floor(start / 1000).toString() : start;
    if (end) params.end = typeof end === 'number' ? Math.floor(end / 1000).toString() : end;

    const response = await coinbaseREST.getProductCandles(pair, params);
    const rawCandles = response.candles || response || [];

    // Normalize candles
    const candles = rawCandles.map((c) => ({
      timestamp: parseInt(c.start, 10) * 1000, // convert to ms
      open: parseFloat(c.open),
      high: parseFloat(c.high),
      low: parseFloat(c.low),
      close: parseFloat(c.close),
      volume: parseFloat(c.volume),
    })).sort((a, b) => a.timestamp - b.timestamp);

    // Save to IndexedDB cache
    try {
      await saveCandles(pair, timeframe, candles);
    } catch (cacheError) {
      console.warn('[REST] Failed to cache candles:', cacheError);
    }

    // Update store
    const store = useStore.getState();
    if (typeof store.setCandles === 'function') {
      store.setCandles(timeframe, candles);
    }

    return candles;
  }

  // =========================================================================
  //  fetchAccounts — get portfolio balances
  // =========================================================================
  const fetchAccounts = useCallback(async () => {
    const store = useStore.getState();
    try {
      if (typeof store.setPortfolioLoading === 'function') store.setPortfolioLoading(true);

      const response = await coinbaseREST.getAccounts();
      const accounts = response.accounts || response || [];

      // Transform to portfolio format
      const portfolio = accounts
        .filter((a) => parseFloat(a.available_balance?.value || '0') > 0 || parseFloat(a.hold?.value || '0') > 0)
        .map((a) => ({
          currency: a.currency,
          available: parseFloat(a.available_balance?.value || '0'),
          hold: parseFloat(a.hold?.value || '0'),
          total: parseFloat(a.available_balance?.value || '0') + parseFloat(a.hold?.value || '0'),
        }));

      if (typeof store.setPortfolio === 'function') {
        store.setPortfolio(portfolio);
      }

      return portfolio;
    } catch (error) {
      dispatchToast('error', `Failed to fetch accounts: ${error.message}`);
      return [];
    } finally {
      if (typeof store.setPortfolioLoading === 'function') store.setPortfolioLoading(false);
    }
  }, []);

  // =========================================================================
  //  fetchOrders — get order history
  // =========================================================================
  const fetchOrders = useCallback(async (params = {}) => {
    const store = useStore.getState();
    try {
      if (typeof store.setOrdersLoading === 'function') store.setOrdersLoading(true);

      const response = await coinbaseREST.getOrders(params);
      const orders = response.orders || response || [];

      if (typeof store.setOrders === 'function') {
        store.setOrders(orders);
      }

      return orders;
    } catch (error) {
      dispatchToast('error', `Failed to fetch orders: ${error.message}`);
      return [];
    } finally {
      if (typeof store.setOrdersLoading === 'function') store.setOrdersLoading(false);
    }
  }, []);

  // =========================================================================
  //  fetchTransactionsSummary — get fee tier info
  // =========================================================================
  const fetchTransactionsSummary = useCallback(async () => {
    try {
      const response = await coinbaseREST.getTransactionsSummary();
      const store = useStore.getState();

      if (typeof store.setFeeTier === 'function') {
        store.setFeeTier(response);
      }

      return response;
    } catch (error) {
      dispatchToast('error', `Failed to fetch transaction summary: ${error.message}`);
      return null;
    }
  }, []);

  // =========================================================================
  //  placeOrder — place an order (respects paper mode)
  // =========================================================================
  const placeOrder = useCallback(async (orderData) => {
    const store = useStore.getState();
    const isPaper = store.tradingMode === 'paper';

    if (isPaper) {
      // In paper mode, delegate to the paper trading simulator
      // The paper trading hook will handle this
      dispatchToast('info', 'Paper mode: order simulated locally');
      return { paper: true, orderData };
    }

    try {
      if (typeof store.setOrderSubmitting === 'function') store.setOrderSubmitting(true);

      const response = await coinbaseREST.createOrder(orderData);

      if (response.success) {
        dispatchToast('info', `Order placed: ${response.order_id || 'OK'}`);
        // Refresh orders
        const ordersResponse = await coinbaseREST.getOrders({ limit: 50 });
        if (typeof store.setOrders === 'function') {
          store.setOrders(ordersResponse.orders || []);
        }
      } else {
        dispatchToast('error', `Order failed: ${response.error_response?.message || 'Unknown error'}`);
      }

      return response;
    } catch (error) {
      dispatchToast('error', `Order placement failed: ${error.message}`);
      throw error;
    } finally {
      if (typeof store.setOrderSubmitting === 'function') store.setOrderSubmitting(false);
    }
  }, []);

  // =========================================================================
  //  cancelOrder — cancel a pending order
  // =========================================================================
  const cancelOrder = useCallback(async (orderId) => {
    const store = useStore.getState();
    try {
      const response = await coinbaseREST.cancelOrders([orderId]);

      if (response.results && response.results[0]?.success) {
        dispatchToast('info', `Order ${orderId} cancelled`);
      } else {
        dispatchToast('error', `Failed to cancel order: ${response.results?.[0]?.failure_reason || 'Unknown'}`);
      }

      // Refresh orders
      const ordersResponse = await coinbaseREST.getOrders({ limit: 50 });
      if (typeof store.setOrders === 'function') {
        store.setOrders(ordersResponse.orders || []);
      }

      return response;
    } catch (error) {
      dispatchToast('error', `Cancel order failed: ${error.message}`);
      throw error;
    }
  }, []);

  // =========================================================================
  //  refreshPortfolio — fetch all portfolio data
  // =========================================================================
  const refreshPortfolio = useCallback(async () => {
    await Promise.all([
      fetchAccounts(),
      fetchOrders({ limit: 50 }),
      fetchTransactionsSummary(),
    ]);
  }, [fetchAccounts, fetchOrders, fetchTransactionsSummary]);

  return {
    fetchProducts,
    fetchCandles,
    fetchAccounts,
    fetchOrders,
    fetchTransactionsSummary,
    placeOrder,
    cancelOrder,
    refreshPortfolio,
  };
}
