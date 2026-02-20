/* ============================================================
   Cerebro Crypto — Coinbase Advanced Trade REST Client
   ============================================================
   All requests are proxied through the local Express server
   so that API keys never leave the backend.
   ============================================================ */

import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

// ---------------------------------------------------------------------------
// Response interceptor – unwrap Axios response to just .data by default
// ---------------------------------------------------------------------------
api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const message =
      error.response?.data?.message ||
      error.response?.data?.error ||
      error.message ||
      'Unknown API error';
    console.error('[coinbaseREST]', message);
    return Promise.reject(new Error(message));
  }
);

// ---------------------------------------------------------------------------
// Public API surface
// ---------------------------------------------------------------------------
export const coinbaseREST = {
  // ---- Products -----------------------------------------------------------
  getProducts: () => api.get('/coinbase/products'),

  getProductCandles: (productId, params) =>
    api.get(`/coinbase/products/${productId}/candles`, { params }),

  getProductTicker: (productId) =>
    api.get(`/coinbase/products/${productId}/ticker`),

  // ---- Accounts -----------------------------------------------------------
  getAccounts: () => api.get('/coinbase/accounts'),

  // ---- Orders -------------------------------------------------------------
  getOrders: (params) =>
    api.get('/coinbase/orders/historical/batch', { params }),

  createOrder: (orderData) =>
    api.post('/coinbase/orders', orderData),

  cancelOrders: (orderIds) =>
    api.post('/coinbase/orders/batch_cancel', { order_ids: orderIds }),

  // ---- Portfolio ----------------------------------------------------------
  getPortfolios: () => api.get('/coinbase/portfolios'),

  getTransactionsSummary: () => api.get('/coinbase/transaction_summary'),

  // ---- Trading Mode -------------------------------------------------------
  getMode: () => api.get('/mode'),

  setMode: (mode) => api.post('/mode', { mode }),

  // ---- WebSocket Auth -----------------------------------------------------
  getWsAuth: (channel, productIds) =>
    api.post('/ws-auth', { channel, product_ids: productIds }),
};

export default coinbaseREST;
