/* ============================================================
   Cerebro Crypto — Strategy Registry
   ============================================================ */

import { cryptoMomentum } from './cryptoMomentum.js';
import { breakout } from './breakout.js';
import { vwapReclaim } from './vwapReclaim.js';
import { meanReversion } from './meanReversion.js';
import { rangeScalp } from './rangeScalp.js';
import { microVwapScalp } from './microVwapScalp.js';
import { momentumSpikeScalp } from './momentumSpikeScalp.js';
import { orderBookImbalanceScalp } from './orderBookImbalanceScalp.js';

export const STRATEGY_REGISTRY = {
  momentum: cryptoMomentum,
  breakout: breakout,
  vwap_reclaim: vwapReclaim,
  mean_reversion: meanReversion,
  range_scalp: rangeScalp,
  micro_vwap_scalp: microVwapScalp,
  momentum_spike_scalp: momentumSpikeScalp,
  order_book_imbalance: orderBookImbalanceScalp,
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
