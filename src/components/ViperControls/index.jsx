/* ============================================================
   ViperControls — VIPER Strategy Dashboard
   ============================================================
   Status bar, mode scores, ratchet indicator, performance
   ledger, threat badge, and activity log.
   ============================================================ */

import useStore from '../../store';
import ModeScores from './ModeScores';
import RatchetIndicator from './RatchetIndicator';
import PerformanceLedgerDots from './PerformanceLedgerDots';
import ThreatBadge from './ThreatBadge';
import './ViperControls.css';

export default function ViperControls() {
  const viperActiveMode = useStore((s) => s.viperActiveMode);
  const viperModeScores = useStore((s) => s.viperModeScores);
  const viperRatchetLevel = useStore((s) => s.viperRatchetLevel);
  const viperDailyPnL = useStore((s) => s.viperDailyPnL);
  const viperDailyTrades = useStore((s) => s.viperDailyTrades);
  const viperActivity = useStore((s) => s.viperActivity);
  const viperPerformanceLedger = useStore((s) => s.viperPerformanceLedger);
  const viperReplacementThreat = useStore((s) => s.viperReplacementThreat);
  const emergencyStopAll = useStore((s) => s.emergencyStopAll);

  const formatTime = (ts) => {
    const d = new Date(ts);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  };

  return (
    <div className="viper-controls">
      {/* Status Bar */}
      <div className="viper-status-bar">
        <span className="viper-engine-badge">VIPER</span>
        <span className={`viper-mode-indicator ${viperActiveMode || 'none'}`}>
          {viperActiveMode || 'No Mode'}
        </span>
        <span className="viper-toggle-btn on">ACTIVE</span>
        <button className="viper-stop-btn" onClick={emergencyStopAll}>
          STOP
        </button>
      </div>

      {/* Mode Scores */}
      <div className="viper-section">
        <div className="viper-section-header">
          <span className="viper-section-title">Mode Competition</span>
        </div>
        <ModeScores scores={viperModeScores} activeMode={viperActiveMode} />
      </div>

      {/* Ratchet Indicator */}
      <div className="viper-section">
        <RatchetIndicator level={viperRatchetLevel} dailyPnL={viperDailyPnL} />
      </div>

      {/* Performance & Threat */}
      <div className="viper-section">
        <div className="viper-section-header">
          <span className="viper-section-title">Performance (10d)</span>
          <ThreatBadge status={viperReplacementThreat} />
        </div>
        <PerformanceLedgerDots ledger={viperPerformanceLedger} />
      </div>

      {/* Daily Stats */}
      <div className="viper-section">
        <div className="viper-info-row">
          <span className="viper-info-label">Today's Trades</span>
          <span className="viper-info-value">{viperDailyTrades}</span>
        </div>
        <div className="viper-info-row">
          <span className="viper-info-label">Today's P&L</span>
          <span
            className="viper-info-value"
            style={{ color: viperDailyPnL >= 0 ? '#00d4aa' : '#ff4560' }}
          >
            {viperDailyPnL >= 0 ? '+' : ''}${viperDailyPnL.toFixed(2)}
          </span>
        </div>
      </div>

      {/* Activity Log */}
      <div className="viper-section">
        <span className="viper-section-title">Activity</span>
        <div className="viper-activity-log">
          {viperActivity.length === 0 && (
            <div className="viper-activity-entry">No activity yet</div>
          )}
          {viperActivity.slice(0, 8).map((entry, i) => (
            <div key={i} className="viper-activity-entry">
              <span className="viper-activity-time">{formatTime(entry.timestamp)}</span>
              {entry.message}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
