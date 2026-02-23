/* ============================================================
   VIPER — Performance Ledger
   ============================================================
   Tracks daily performance against a benchmark to determine
   VIPER's "replacement threat" status. This status controls
   capital allocation multipliers.

   Statuses:
     DOMINANT  → ≥7/10 benchmark days → 1.25x allocation
     ACTIVE    → normal               → 1.0x
     WARNING   → 2+ losses & <3 bench → 0.6x
     CRITICAL  → 4+ losses in 10      → 0.25x
   ============================================================ */

const LS_KEY = 'viper_ledger';
const BENCHMARK_DAILY_PCT = 0.15; // 0.15% daily target to "meet benchmark"
const LEDGER_WINDOW = 10; // Rolling window of days to evaluate

export const THREAT_LEVELS = {
  DOMINANT: 'DOMINANT',
  ACTIVE:   'ACTIVE',
  WARNING:  'WARNING',
  CRITICAL: 'CRITICAL',
};

/**
 * Evaluate the current threat/replacement status from the ledger.
 * @param {Object[]} ledger - array of daily records, newest first
 * @returns {{ status: string, allocationMult: number, benchmarkDays: number, lossDays: number }}
 */
export function evaluateStatus(ledger) {
  const recent = ledger.slice(0, LEDGER_WINDOW);

  if (recent.length === 0) {
    return { status: THREAT_LEVELS.ACTIVE, allocationMult: 1.0, benchmarkDays: 0, lossDays: 0 };
  }

  let benchmarkDays = 0;
  let lossDays = 0;

  for (const day of recent) {
    const pnlPct = day.pnlPct || 0;
    if (pnlPct >= BENCHMARK_DAILY_PCT) {
      benchmarkDays++;
    }
    if (pnlPct < 0) {
      lossDays++;
    }
  }

  // CRITICAL: 4+ losses in last 10 days
  if (lossDays >= 4) {
    return { status: THREAT_LEVELS.CRITICAL, allocationMult: 0.25, benchmarkDays, lossDays };
  }

  // DOMINANT: 7+ benchmark days in last 10
  if (benchmarkDays >= 7) {
    return { status: THREAT_LEVELS.DOMINANT, allocationMult: 1.25, benchmarkDays, lossDays };
  }

  // WARNING: 2+ losses AND fewer than 3 benchmark days
  if (lossDays >= 2 && benchmarkDays < 3) {
    return { status: THREAT_LEVELS.WARNING, allocationMult: 0.6, benchmarkDays, lossDays };
  }

  // ACTIVE: normal performance
  return { status: THREAT_LEVELS.ACTIVE, allocationMult: 1.0, benchmarkDays, lossDays };
}

/**
 * Record a completed trading day in the ledger.
 * @param {Object[]} ledger - existing ledger
 * @param {{ date: string, pnl: number, pnlPct: number, trades: number, winRate: number, dominantMode: string }} dayResult
 * @returns {Object[]} updated ledger (newest first, max 30 entries)
 */
export function recordDay(ledger, dayResult) {
  const entry = {
    date: dayResult.date,
    pnl: dayResult.pnl || 0,
    pnlPct: dayResult.pnlPct || 0,
    trades: dayResult.trades || 0,
    winRate: dayResult.winRate || 0,
    dominantMode: dayResult.dominantMode || 'STRIKE',
    metBenchmark: (dayResult.pnlPct || 0) >= BENCHMARK_DAILY_PCT,
    timestamp: Date.now(),
  };

  return [entry, ...ledger].slice(0, 30);
}

/**
 * Load ledger from localStorage.
 * @returns {Object[]}
 */
export function loadLedger() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Save ledger to localStorage.
 * @param {Object[]} ledger
 */
export function saveLedger(ledger) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(ledger));
  } catch {
    /* quota exceeded */
  }
}

/**
 * Get the threat level display info for UI.
 * @param {string} status
 * @returns {{ label: string, color: string }}
 */
export function getThreatDisplayInfo(status) {
  switch (status) {
    case THREAT_LEVELS.DOMINANT:
      return { label: 'DOMINANT', color: '#00d4aa' };
    case THREAT_LEVELS.ACTIVE:
      return { label: 'ACTIVE', color: '#6c63ff' };
    case THREAT_LEVELS.WARNING:
      return { label: 'WARNING', color: '#f0b429' };
    case THREAT_LEVELS.CRITICAL:
      return { label: 'CRITICAL', color: '#ff4560' };
    default:
      return { label: 'ACTIVE', color: '#6c63ff' };
  }
}
