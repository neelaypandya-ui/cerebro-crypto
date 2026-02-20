/* ============================================================
   Cerebro Crypto — Risk Manager
   ============================================================
   Pre-order validation and position-sizing calculations.
   ============================================================ */

// ---------------------------------------------------------------------------
// Order validation
// ---------------------------------------------------------------------------

/**
 * Validate a proposed order against the current portfolio state and risk
 * settings.
 *
 * @param {Object} order - { pair, side, quantity, price, type }
 * @param {Object} state - current Zustand store state snapshot
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateOrder(order, state) {
  const errors = [];
  const { riskSettings, positions, portfolio, paperPortfolio, tradingMode, orderHistory } = state;

  // Determine available balance based on trading mode
  const availableCash =
    tradingMode === 'paper' ? paperPortfolio.balance : portfolio.availableCash;

  const orderValue = (order.price || 0) * (order.quantity || 0);

  // 1. Position size vs available balance
  if (order.side === 'BUY' && orderValue > availableCash) {
    errors.push(
      `Insufficient balance. Order value ($${orderValue.toFixed(2)}) exceeds available cash ($${availableCash.toFixed(2)}).`
    );
  }

  // 2. Max concurrent positions
  const currentPositions =
    tradingMode === 'paper' ? (paperPortfolio.positions || []) : positions;
  if (
    order.side === 'BUY' &&
    currentPositions.length >= riskSettings.maxPositions
  ) {
    errors.push(
      `Max concurrent positions (${riskSettings.maxPositions}) reached.`
    );
  }

  // 3. Pair cooldown
  const cooldownMs = (riskSettings.pairCooldownMinutes || 0) * 60 * 1000;
  if (cooldownMs > 0) {
    const recentTrades = (orderHistory || []).filter(
      (t) => t.pair === order.pair && Date.now() - (t.timestamp || 0) < cooldownMs
    );
    if (recentTrades.length > 0) {
      const minutesLeft = Math.ceil(
        (cooldownMs - (Date.now() - recentTrades[0].timestamp)) / 60000
      );
      errors.push(
        `Pair ${order.pair} is in cooldown. ${minutesLeft} minute(s) remaining.`
      );
    }
  }

  // 4. Daily trade count
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayTrades = (orderHistory || []).filter(
    (t) => (t.timestamp || 0) >= todayStart.getTime()
  );
  if (todayTrades.length >= riskSettings.maxTradesPerDay) {
    errors.push(
      `Daily trade limit (${riskSettings.maxTradesPerDay}) reached.`
    );
  }

  // 5. Daily loss limit
  const todayPnL = todayTrades.reduce((sum, t) => sum + (t.realizedPnL || 0), 0);
  if (todayPnL <= -riskSettings.maxDailyLossUSD) {
    errors.push(
      `Daily loss limit ($${riskSettings.maxDailyLossUSD}) reached. Today's P&L: $${todayPnL.toFixed(2)}.`
    );
  }

  // 6. No net-short positions (long-only enforcement)
  if (order.side === 'SELL') {
    const existingPosition = currentPositions.find((p) => p.pair === order.pair);
    const existingQty = existingPosition ? existingPosition.quantity : 0;
    if ((order.quantity || 0) > existingQty) {
      errors.push(
        `Cannot sell more than held quantity (${existingQty}). Short-selling is not allowed.`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ---------------------------------------------------------------------------
// Position sizing
// ---------------------------------------------------------------------------

/**
 * Calculate the dollar amount to allocate to a new position based on
 * portfolio value and risk settings.
 *
 * @param {number} portfolioValue - total portfolio value in USD
 * @param {Object} riskSettings   - from the store
 * @returns {number} USD amount
 */
export function calculatePositionSize(portfolioValue, riskSettings) {
  if (!portfolioValue || portfolioValue <= 0) return 0;
  const pct = (riskSettings.positionSizePct || 5) / 100;
  return Math.round(portfolioValue * pct * 100) / 100;
}

// ---------------------------------------------------------------------------
// Stop-loss calculation
// ---------------------------------------------------------------------------

/**
 * Calculate the stop-loss price.
 *
 * @param {number} entryPrice
 * @param {'percentage'|'atr'} method
 * @param {number|null} atr      - current ATR value (needed if method='atr')
 * @param {Object} riskSettings
 * @returns {number} stop-loss price
 */
export function calculateStopLoss(entryPrice, method, atr, riskSettings) {
  if (!entryPrice || entryPrice <= 0) return 0;

  if (method === 'atr' && atr && atr > 0) {
    const multiplier = riskSettings.trailingStopATR || 1;
    return Math.max(0, entryPrice - atr * multiplier);
  }

  // Default: percentage-based stop
  const pct = (riskSettings.stopLossPct || 2) / 100;
  return Math.max(0, entryPrice * (1 - pct));
}

// ---------------------------------------------------------------------------
// Take-profit calculation
// ---------------------------------------------------------------------------

/**
 * Calculate the take-profit price using an R-multiple of the risk.
 *
 * @param {number} entryPrice
 * @param {number} stopLoss
 * @param {number} rMultiple - e.g. 1.5, 2, 3
 * @returns {number} take-profit price
 */
export function calculateTakeProfit(entryPrice, stopLoss, rMultiple) {
  if (!entryPrice || !stopLoss || entryPrice <= stopLoss) return entryPrice;
  const risk = entryPrice - stopLoss;
  return entryPrice + risk * rMultiple;
}
