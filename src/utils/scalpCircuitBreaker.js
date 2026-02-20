/* ============================================================
   Cerebro Crypto — Scalp Circuit Breaker
   ============================================================ */

/**
 * Circuit breaker state manager for scalp strategies.
 * Rules:
 *   - 3 consecutive losses → 15 min pause
 *   - 5 consecutive losses → 1 hour pause
 *   - Session net P&L drops below -1% of starting balance → disable for session
 */

export function createCircuitBreaker(startingBalance) {
  return {
    consecutiveLosses: 0,
    sessionPnL: 0,
    sessionFees: 0,
    totalTrades: 0,
    wins: 0,
    losses: 0,
    pausedUntil: null,
    disabled: false,
    startingBalance,
    history: [], // last 20 trade results
  };
}

export function recordTrade(state, pnl, fees = 0) {
  const next = { ...state };
  next.totalTrades++;
  next.sessionPnL += pnl;
  next.sessionFees += fees;
  next.history = [{ pnl, fees, timestamp: Date.now() }, ...next.history].slice(0, 20);

  if (pnl >= 0) {
    next.wins++;
    next.consecutiveLosses = 0;
  } else {
    next.losses++;
    next.consecutiveLosses++;
  }

  // Check circuit breaker rules
  if (next.consecutiveLosses >= 5) {
    next.pausedUntil = Date.now() + 60 * 60 * 1000; // 1 hour
  } else if (next.consecutiveLosses >= 3) {
    next.pausedUntil = Date.now() + 15 * 60 * 1000; // 15 min
  }

  // Session kill switch: -1% of starting balance
  const sessionLossThreshold = -0.01 * next.startingBalance;
  if (next.sessionPnL <= sessionLossThreshold) {
    next.disabled = true;
  }

  return next;
}

export function canTrade(state) {
  if (state.disabled) return { allowed: false, reason: 'Session disabled: net P&L exceeded -1% threshold' };
  if (state.pausedUntil && Date.now() < state.pausedUntil) {
    const remaining = Math.ceil((state.pausedUntil - Date.now()) / 60000);
    return { allowed: false, reason: `Paused for ${remaining} min (${state.consecutiveLosses} consecutive losses)` };
  }
  // Clear pause if time has elapsed
  if (state.pausedUntil && Date.now() >= state.pausedUntil) {
    state.pausedUntil = null;
  }
  return { allowed: true, reason: null };
}

export function resetSession(startingBalance) {
  return createCircuitBreaker(startingBalance);
}

export function getSessionStats(state) {
  return {
    streak: state.consecutiveLosses > 0 ? -state.consecutiveLosses : (state.history.length > 0 && state.history[0]?.pnl >= 0 ? countStreak(state.history) : 0),
    wins: state.wins,
    losses: state.losses,
    netPnL: state.sessionPnL,
    fees: state.sessionFees,
    trades: state.totalTrades,
    winRate: state.totalTrades > 0 ? (state.wins / state.totalTrades) * 100 : 0,
    pausedUntil: state.pausedUntil,
    disabled: state.disabled,
  };
}

function countStreak(history) {
  let count = 0;
  for (const t of history) {
    if (t.pnl >= 0) count++;
    else break;
  }
  return count;
}
