/* ============================================================
   Cerebro Crypto — Paper Trading Simulator
   ============================================================
   Simulates order fills, position creation, and P&L calculation
   for paper (virtual) trading.
   ============================================================ */

import { SLIPPAGE_PCT, TAKER_FEE_PCT } from '../config/constants.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Generate a random UUID v4.
 */
function uuid() {
  // crypto.randomUUID is available in modern browsers
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ---------------------------------------------------------------------------
// Simulate a fill
// ---------------------------------------------------------------------------

/**
 * Simulate an order fill with realistic slippage and fees.
 *
 * @param {Object} order        - { pair, side, quantity, price, type }
 * @param {number} currentPrice - latest market price
 * @param {Object} [settings]   - optional overrides { slippagePct, takerFeePct }
 *
 * @returns {Object} simulated fill
 */
export function simulateFill(order, currentPrice, settings = {}) {
  const slippage = settings.slippagePct ?? SLIPPAGE_PCT;
  const takerFee = settings.takerFeePct ?? TAKER_FEE_PCT;

  const side = (order.side || 'BUY').toUpperCase();

  // Apply slippage: buys fill slightly higher, sells slightly lower
  const slippageMult = side === 'BUY'
    ? 1 + slippage / 100
    : 1 - slippage / 100;
  const fillPrice = currentPrice * slippageMult;

  const quantity = order.quantity || 0;
  const fee = fillPrice * quantity * (takerFee / 100);

  return {
    orderId: uuid(),
    pair: order.pair,
    side,
    type: order.type || 'MARKET',
    quantity,
    requestedPrice: currentPrice,
    fillPrice: Math.round(fillPrice * 1e8) / 1e8, // 8 decimal places max
    fee: Math.round(fee * 100) / 100,
    totalCost: side === 'BUY'
      ? Math.round((fillPrice * quantity + fee) * 100) / 100
      : Math.round((fillPrice * quantity - fee) * 100) / 100,
    timestamp: Date.now(),
    status: 'FILLED',
  };
}

// ---------------------------------------------------------------------------
// Create a paper position from a fill
// ---------------------------------------------------------------------------

/**
 * Create a structured position object from a simulated fill.
 *
 * @param {Object} fill      - output of simulateFill()
 * @param {string} [strategy] - strategy identifier (e.g. 'momentum')
 *
 * @returns {Object} position
 */
export function createPaperPosition(fill, strategy = 'manual') {
  return {
    id: uuid(),
    orderId: fill.orderId,
    pair: fill.pair,
    side: fill.side,
    strategy,
    entryPrice: fill.fillPrice,
    quantity: fill.quantity,
    entryFee: fill.fee,
    entryTimestamp: fill.timestamp,
    currentPrice: fill.fillPrice,
    unrealizedPnL: 0,
    stopLoss: null,
    takeProfit: null,
    status: 'OPEN',
  };
}

// ---------------------------------------------------------------------------
// Close a paper position
// ---------------------------------------------------------------------------

/**
 * Close a paper position at the given market price and return realised P&L.
 *
 * @param {Object} position     - an open position object
 * @param {number} currentPrice - current market price to exit at
 * @param {Object} [settings]   - optional { slippagePct, takerFeePct }
 *
 * @returns {Object} closure details
 */
export function closePaperPosition(position, currentPrice, settings = {}) {
  const slippage = settings.slippagePct ?? SLIPPAGE_PCT;
  const takerFee = settings.takerFeePct ?? TAKER_FEE_PCT;

  // Exit is a sell (closing a long)
  const exitPrice = currentPrice * (1 - slippage / 100);
  const exitFee = exitPrice * position.quantity * (takerFee / 100);

  const grossPnL = (exitPrice - position.entryPrice) * position.quantity;
  const totalFees = (position.entryFee || 0) + exitFee;
  const netPnL = grossPnL - totalFees;

  return {
    positionId: position.id,
    pair: position.pair,
    strategy: position.strategy,
    side: position.side,
    entryPrice: position.entryPrice,
    exitPrice: Math.round(exitPrice * 1e8) / 1e8,
    quantity: position.quantity,
    entryFee: position.entryFee || 0,
    exitFee: Math.round(exitFee * 100) / 100,
    grossPnL: Math.round(grossPnL * 100) / 100,
    netPnL: Math.round(netPnL * 100) / 100,
    holdDuration: Date.now() - (position.entryTimestamp || Date.now()),
    entryTimestamp: position.entryTimestamp,
    exitTimestamp: Date.now(),
    status: 'CLOSED',
  };
}
