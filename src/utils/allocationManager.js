/* ============================================================
   Cerebro Crypto — Capital Allocation Manager
   ============================================================
   Manages the capital split between HYDRA and VIPER strategies.
   Auto-adjusts based on VIPER's performance threat level.

   Default: HYDRA 60% / VIPER 40%
   Adjustments:
     DOMINANT  → 50/50
     ACTIVE    → 60/40 (default)
     WARNING   → 75/25
     CRITICAL  → 87/13
   ============================================================ */

const LS_KEY = 'allocation_config';

const DEFAULT_CONFIG = {
  hydra: 60,
  viper: 40,
};

// Threat-level overrides (applied on top of user config)
const THREAT_ADJUSTMENTS = {
  DOMINANT: { hydra: 50, viper: 50 },
  ACTIVE:   null, // Use user config as-is
  WARNING:  { hydra: 75, viper: 25 },
  CRITICAL: { hydra: 87, viper: 13 },
};

/**
 * Calculate capital allocation for each strategy.
 *
 * @param {Object} params
 * @param {number} params.totalPortfolio - total available capital
 * @param {Object} [params.splitConfig] - { hydra: number, viper: number } percentages
 * @param {string} [params.viperThreatLevel] - 'DOMINANT'|'ACTIVE'|'WARNING'|'CRITICAL'
 * @param {boolean} [params.hydraActive] - is HYDRA enabled?
 * @param {boolean} [params.viperActive] - is VIPER enabled?
 * @returns {{ hydraCapital: number, viperCapital: number, hydraPct: number, viperPct: number }}
 */
export function calculateAllocation({
  totalPortfolio,
  splitConfig,
  viperThreatLevel = 'ACTIVE',
  hydraActive = true,
  viperActive = false,
}) {
  // If only one strategy is active, give it everything
  if (!viperActive && hydraActive) {
    return { hydraCapital: totalPortfolio, viperCapital: 0, hydraPct: 100, viperPct: 0 };
  }
  if (viperActive && !hydraActive) {
    return { hydraCapital: 0, viperCapital: totalPortfolio, hydraPct: 0, viperPct: 100 };
  }
  if (!viperActive && !hydraActive) {
    return { hydraCapital: 0, viperCapital: 0, hydraPct: 0, viperPct: 0 };
  }

  // Both active — determine split
  let split = splitConfig || { ...DEFAULT_CONFIG };

  // Apply threat-level adjustments
  const threatOverride = THREAT_ADJUSTMENTS[viperThreatLevel];
  if (threatOverride) {
    split = { ...threatOverride };
  }

  // Normalize to 100%
  const total = split.hydra + split.viper;
  const hydraPct = total > 0 ? (split.hydra / total) * 100 : 50;
  const viperPct = total > 0 ? (split.viper / total) * 100 : 50;

  return {
    hydraCapital: totalPortfolio * (hydraPct / 100),
    viperCapital: totalPortfolio * (viperPct / 100),
    hydraPct: Math.round(hydraPct),
    viperPct: Math.round(viperPct),
  };
}

/**
 * Load saved allocation config from localStorage.
 * @returns {{ hydra: number, viper: number }}
 */
export function loadSplitConfig() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : { ...DEFAULT_CONFIG };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

/**
 * Save allocation config to localStorage.
 * @param {{ hydra: number, viper: number }} config
 */
export function saveSplitConfig(config) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(config));
  } catch {
    /* quota exceeded */
  }
}
