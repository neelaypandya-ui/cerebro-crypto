/* ============================================================
   HYDRA Controls — Unified Strategy Dashboard
   ============================================================
   Replaces all prior strategy cards with HYDRA's single
   unified dashboard: score gauge, dimension breakdown,
   activity log, and session heatmap.
   ============================================================ */

import { useMemo, useState, useEffect } from 'react';
import useStore from '../../store';
import { formatTimestamp } from '../../utils/formatters';
import ScoreGauge from './ScoreGauge';
import DimensionBreakdown from './DimensionBreakdown';
import ActivityLog from './ActivityLog';
import SessionHeatmap from './SessionHeatmap';
import './HydraControls.css';

export default function HydraControls() {
  const botRunning = useStore((s) => s.botRunning);
  const setBotRunning = useStore((s) => s.setBotRunning);
  const currentRegime = useStore((s) => s.currentRegime);
  const activePair = useStore((s) => s.activePair);
  const emergencyStopAll = useStore((s) => s.emergencyStopAll);
  const engineStatus = useStore((s) => s.engineStatus);
  const lastEngineEval = useStore((s) => s.lastEngineEval);
  const hydraScore = useStore((s) => s.hydraScore);
  const hydraDimensions = useStore((s) => s.hydraDimensions);
  const hydraEntryThreshold = useStore((s) => s.hydraEntryThreshold);
  const setHydraEntryThreshold = useStore((s) => s.setHydraEntryThreshold);
  const hydraActivity = useStore((s) => s.hydraActivity);
  const hydraSettings = useStore((s) => s.hydraSettings);
  const setHydraSettings = useStore((s) => s.setHydraSettings);

  // Tick for "Xs ago" freshness
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!botRunning) return;
    const id = setInterval(() => setTick((t) => t + 1), 2000);
    return () => clearInterval(id);
  }, [botRunning]);

  const evalAgo = useMemo(() => {
    if (!lastEngineEval) return null;
    const secs = Math.floor((Date.now() - lastEngineEval) / 1000);
    return secs < 60 ? `${secs}s ago` : `${Math.floor(secs / 60)}m ago`;
  }, [lastEngineEval, /* tick */]);

  const totalScore = hydraScore?.totalScore ?? 0;
  const regimeColor = currentRegime === 'bullish' ? 'var(--bullish)' :
    currentRegime === 'bearish' ? 'var(--bearish)' : 'var(--warning-yellow)';

  const engineStatusClass = engineStatus === 'running' ? 'running' :
    engineStatus === 'paused' ? 'paused' : 'idle';

  // Need score difference to threshold
  const scoreNeeded = Math.max(0, hydraEntryThreshold - totalScore);

  return (
    <div className="hydra-container">
      {/* ---- Top: Status Bar ---- */}
      <div className="hydra-status-bar">
        <div className="hydra-status-left">
          <span className="hydra-title">HYDRA ENGINE</span>
          <span className={`hydra-engine-badge ${engineStatusClass}`}>
            <span className="hydra-engine-dot" />
            {engineStatus.toUpperCase()}
          </span>
          {evalAgo && <span className="hydra-eval-ago">{evalAgo}</span>}
        </div>
        <div className="hydra-status-right">
          <button
            className={`hydra-toggle-btn ${botRunning ? 'on' : 'off'}`}
            onClick={() => setBotRunning(!botRunning)}
          >
            <span className="hydra-toggle-knob" />
          </button>
          <button className="hydra-stop-btn" onClick={emergencyStopAll}>
            STOP
          </button>
        </div>
      </div>

      {/* ---- Regime + Pair + Threshold ---- */}
      <div className="hydra-info-row">
        <div className="hydra-info-item">
          <span className="hydra-info-label">Regime</span>
          <span className="hydra-info-value" style={{ color: regimeColor }}>
            {currentRegime?.toUpperCase()}
          </span>
        </div>
        <div className="hydra-info-item">
          <span className="hydra-info-label">Pair</span>
          <span className="hydra-info-value">{activePair}</span>
        </div>
        <div className="hydra-info-item">
          <span className="hydra-info-label">Threshold</span>
          <div className="hydra-threshold-control">
            <input
              type="range"
              min="65"
              max="95"
              value={hydraEntryThreshold}
              onChange={(e) => setHydraEntryThreshold(parseInt(e.target.value))}
              className="hydra-threshold-slider"
            />
            <span className="hydra-threshold-value">{hydraEntryThreshold}</span>
          </div>
        </div>
      </div>

      {/* ---- Bearish Banner ---- */}
      {currentRegime === 'bearish' && (
        <div className="hydra-bearish-banner">
          Capital Preservation — no new entries during bearish regime
        </div>
      )}

      {/* ---- Score Gauge + Dimensions ---- */}
      <div className="hydra-score-section">
        <div className="hydra-gauge-col">
          <ScoreGauge score={totalScore} threshold={hydraEntryThreshold} />
          {scoreNeeded > 0 && (
            <div className="hydra-score-needed">Need {scoreNeeded} more pts</div>
          )}
        </div>
        <div className="hydra-dims-col">
          <DimensionBreakdown dimensions={hydraDimensions} />
        </div>
      </div>

      {/* ---- Session Heatmap ---- */}
      <SessionHeatmap pair={activePair} />

      {/* ---- Activity Log ---- */}
      <div className="hydra-activity-section">
        <div className="hydra-activity-title">Activity Log</div>
        <ActivityLog activity={hydraActivity} />
      </div>
    </div>
  );
}
