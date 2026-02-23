/* ============================================================
   Cerebro Crypto — Strategy Registry
   ============================================================
   HYDRA is the sole unified strategy. All prior strategies
   (A through H) have been replaced.
   ============================================================ */

import { hydra } from './hydra/index.js';
import { viper } from './viper/index.js';

export const STRATEGY_REGISTRY = {
  hydra,
  viper,
};

export function getStrategy(key) {
  return STRATEGY_REGISTRY[key] || null;
}

export function getStrategiesForRegime(regime) {
  return Object.entries(STRATEGY_REGISTRY)
    .filter(([, strat]) => strat.meta.regimes.includes(regime))
    .map(([key, strat]) => ({ key, ...strat }));
}

export function getAllStrategyMeta() {
  return Object.entries(STRATEGY_REGISTRY).map(([key, strat]) => ({
    key,
    ...strat.meta,
  }));
}
