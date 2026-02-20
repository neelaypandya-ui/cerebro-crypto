/* ============================================================
   StrategyCard — Collapsible accordion card for a strategy
   ============================================================ */

import { useState } from 'react';
import useStore from '../../store';

export default function StrategyCard({ strategyKey, meta, enabled }) {
  const [expanded, setExpanded] = useState(false);
  const toggleStrategy = useStore((s) => s.toggleStrategy);
  const strategySignals = useStore((s) => s.strategySignals);

  const signal = strategySignals[strategyKey];
  const hasActiveSignal = signal && signal.entry;

  return (
    <div className={`strat-card ${enabled ? 'enabled' : ''} ${expanded ? 'expanded' : ''}`}>
      {/* Collapsed header */}
      <div className="strat-card-header" onClick={() => setExpanded(!expanded)}>
        <div className="strat-card-left">
          <span className="strat-card-expand">{expanded ? '▾' : '▸'}</span>
          <span className="strat-card-name">{meta.name}</span>
          <span className={`strat-card-regime-tag ${meta.regimes?.[0] || ''}`}>
            {meta.category || 'trend'}
          </span>
          {hasActiveSignal && <span className="strat-card-signal-dot" title="Active signal" />}
        </div>
        <div className="strat-card-right">
          <button
            className={`strat-card-toggle ${enabled ? 'on' : 'off'}`}
            onClick={(e) => { e.stopPropagation(); toggleStrategy(strategyKey); }}
          >
            <span className="strat-card-toggle-knob" />
          </button>
        </div>
      </div>

      {/* Summary line (always visible) */}
      <div className="strat-card-summary">{meta.description}</div>

      {/* Expanded details */}
      {expanded && (
        <div className="strat-card-details">
          {/* Entry Conditions */}
          {meta.entryConditions && (
            <div className="strat-card-section">
              <div className="strat-card-section-title">Entry Conditions</div>
              <ul className="strat-card-checklist">
                {meta.entryConditions.map((cond, i) => (
                  <li key={i} className="strat-card-check-item">
                    <span className="strat-card-check-icon">○</span>
                    {cond}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Exit Conditions */}
          {meta.exitConditions && (
            <div className="strat-card-section">
              <div className="strat-card-section-title">Exit / Risk</div>
              <ul className="strat-card-checklist">
                {meta.exitConditions.map((cond, i) => (
                  <li key={i} className="strat-card-check-item">
                    <span className="strat-card-check-icon">◆</span>
                    {cond}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Best For */}
          {meta.bestFor && (
            <div className="strat-card-section">
              <div className="strat-card-section-title">Best For</div>
              <div className="strat-card-tickers">
                {meta.bestFor.map((ticker) => (
                  <span key={ticker} className="strat-card-ticker-tag">{ticker}</span>
                ))}
              </div>
            </div>
          )}

          {/* Timeframes */}
          {meta.timeframes && (
            <div className="strat-card-section">
              <div className="strat-card-section-title">Timeframes</div>
              <div className="strat-card-tickers">
                {meta.timeframes.map((tf) => (
                  <span key={tf} className="strat-card-tf-tag">{tf.replace('_', ' ')}</span>
                ))}
              </div>
            </div>
          )}

          {/* Signal Status */}
          {signal && (
            <div className="strat-card-section">
              <div className="strat-card-section-title">Signal Status</div>
              <div className={`strat-card-signal-status ${hasActiveSignal ? 'active' : 'idle'}`}>
                {hasActiveSignal ? `Active: ${signal.reason}` : 'No active signal'}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
