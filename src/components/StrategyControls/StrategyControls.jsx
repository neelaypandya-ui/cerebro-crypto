import { useMemo } from 'react';
import useStore from '../../store';
import { REGIMES } from '../../config/constants';
import { STRATEGY_REGISTRY } from '../../strategies';
import BotMasterControls from './BotMasterControls';
import StrategyCard from './StrategyCard';
import ScalpSessionScorecard from './ScalpSessionScorecard';
import './StrategyControls.css';

/* ============================================================
   StrategyControls — Bot Control & Strategy Management
   ============================================================
   Redesigned with accordion cards grouped by regime,
   BotMasterControls at top, and ScalpSessionScorecard.
   ============================================================ */

// Group strategies by regime from the registry
const REGIME_GROUPS = {
  [REGIMES.BULLISH]: { label: 'Bullish Strategies', strategies: [] },
  [REGIMES.CHOPPY]:  { label: 'Choppy / Range Strategies', strategies: [] },
};

// Build groups from registry
for (const [key, strat] of Object.entries(STRATEGY_REGISTRY)) {
  for (const regime of strat.meta.regimes || []) {
    if (REGIME_GROUPS[regime]) {
      REGIME_GROUPS[regime].strategies.push({ key, meta: strat.meta });
    }
  }
}

export default function StrategyControls() {
  const currentRegime = useStore((s) => s.currentRegime);
  const activeStrategies = useStore((s) => s.activeStrategies);

  /* ---- Sorted regime groups: current regime first ---- */
  const sortedGroups = useMemo(() => {
    const entries = Object.entries(REGIME_GROUPS);
    // Put current regime's group first
    entries.sort(([a], [b]) => {
      if (a === currentRegime) return -1;
      if (b === currentRegime) return 1;
      return 0;
    });
    return entries;
  }, [currentRegime]);

  return (
    <div className="strategy-container">
      {/* Bot Master Controls */}
      <BotMasterControls />

      {/* Bearish Banner */}
      {currentRegime === REGIMES.BEARISH && (
        <div className="strategy-bearish-banner">
          <span className="strategy-bearish-banner-icon">&#9888;</span>
          <div>
            <div className="strategy-bearish-banner-text">Capital Preservation Mode</div>
            <div className="strategy-bearish-banner-sub">
              All strategies are paused during bearish regime. No new positions will be opened.
            </div>
          </div>
        </div>
      )}

      {/* Scalp Session Scorecard */}
      <ScalpSessionScorecard />

      {/* Strategy Accordion Groups */}
      <div className="strategy-groups">
        {sortedGroups.map(([regime, group]) => {
          const isCurrent = regime === currentRegime;
          return (
            <div key={regime} className={`strategy-group ${isCurrent ? 'current' : 'other'}`}>
              <div className={`strategy-group-header ${regime}`}>
                <span className="strategy-group-dot" />
                <span className="strategy-group-label">{group.label}</span>
                {isCurrent && <span className="strategy-group-current-tag">ACTIVE</span>}
              </div>
              <div className="strategy-group-cards">
                {group.strategies.map(({ key, meta }) => (
                  <StrategyCard
                    key={key}
                    strategyKey={key}
                    meta={meta}
                    enabled={activeStrategies[key] || false}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
