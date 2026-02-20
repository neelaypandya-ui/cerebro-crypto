/* ============================================================
   BotMasterControls — Top-level bot control bar
   ============================================================ */

import { useMemo, useState, useEffect } from 'react';
import useStore from '../../store';
import { formatTimestamp } from '../../utils/formatters';

export default function BotMasterControls() {
  const botRunning = useStore((s) => s.botRunning);
  const setBotRunning = useStore((s) => s.setBotRunning);
  const currentRegime = useStore((s) => s.currentRegime);
  const activeStrategies = useStore((s) => s.activeStrategies);
  const strategySignals = useStore((s) => s.strategySignals);
  const signals = useStore((s) => s.signals);
  const emergencyStopAll = useStore((s) => s.emergencyStopAll);
  const engineStatus = useStore((s) => s.engineStatus);
  const lastEngineEval = useStore((s) => s.lastEngineEval);
  const engineLog = useStore((s) => s.engineLog);

  const activeCount = useMemo(
    () => Object.values(activeStrategies).filter(Boolean).length,
    [activeStrategies]
  );

  const openSignalCount = useMemo(
    () => Object.values(strategySignals).filter((s) => s && s.entry).length,
    [strategySignals]
  );

  const recentActivity = useMemo(() => (signals || []).slice(0, 5), [signals]);
  const recentEngineLog = useMemo(() => (engineLog || []).slice(0, 8), [engineLog]);

  // Tick every 2s so "Xs ago" stays fresh
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!botRunning) return;
    const id = setInterval(() => setTick((t) => t + 1), 2000);
    return () => clearInterval(id);
  }, [botRunning]);

  const evalAgo = (() => {
    if (!lastEngineEval) return null;
    const secs = Math.floor((Date.now() - lastEngineEval) / 1000);
    return secs < 60 ? `${secs}s ago` : `${Math.floor(secs / 60)}m ago`;
  })();

  const engineStatusClass = engineStatus === 'running' ? 'running'
    : engineStatus === 'paused' ? 'paused'
    : engineStatus === 'error' ? 'error' : 'idle';

  return (
    <div className="bot-master">
      <div className="bot-master-row">
        <div className="bot-master-toggle">
          <span className="bot-master-label">Bot</span>
          <button
            className={`bot-toggle-btn ${botRunning ? 'on' : 'off'}`}
            onClick={() => setBotRunning(!botRunning)}
            title={botRunning ? 'Turn bot OFF' : 'Turn bot ON'}
          >
            <span className="bot-toggle-knob" />
          </button>
          <span className={`bot-status-text ${botRunning ? 'on' : 'off'}`}>
            {botRunning ? 'RUNNING' : 'OFF'}
          </span>
          {botRunning && (
            <span className={`engine-status-badge ${engineStatusClass}`}>
              <span className="engine-status-dot" />
              <span>{engineStatus}</span>
              {evalAgo && <span className="engine-eval-time">{evalAgo}</span>}
            </span>
          )}
        </div>

        <div className={`bot-regime-badge ${currentRegime}`}>
          <span className="bot-regime-dot" />
          <span>{currentRegime}</span>
          <span className="bot-regime-time">{formatTimestamp(Date.now())}</span>
        </div>

        <div className="bot-master-stats">
          <span className="bot-stat">
            <span className="bot-stat-num">{activeCount}</span> strategies
          </span>
          <span className="bot-stat">
            <span className="bot-stat-num">{openSignalCount}</span> signals
          </span>
        </div>

        <button className="bot-emergency-btn" onClick={emergencyStopAll} title="Emergency Stop All">
          STOP ALL
        </button>
      </div>

      {recentActivity.length > 0 && (
        <div className="bot-activity-log">
          {recentActivity.map((sig, i) => (
            <div key={sig.id || i} className="bot-activity-entry">
              <span className="bot-activity-pair">{sig.pair}</span>
              <span className="bot-activity-strat">{sig.strategy}</span>
              <span className={`bot-activity-type ${(sig.type || 'hold').toLowerCase()}`}>
                {(sig.type || 'HOLD').toUpperCase()}
              </span>
              <span className="bot-activity-time">{formatTimestamp(sig.timestamp)}</span>
            </div>
          ))}
        </div>
      )}

      {botRunning && recentEngineLog.length > 0 && (
        <div className="engine-log">
          <div className="engine-log-title">Engine Log</div>
          {recentEngineLog.map((entry, i) => (
            <div key={entry.timestamp + '-' + i} className={`engine-log-entry engine-log-${(entry.type || 'info').toLowerCase()}`}>
              <span className="engine-log-type">{entry.type}</span>
              <span className="engine-log-msg">{entry.message}</span>
              <span className="engine-log-time">{formatTimestamp(entry.timestamp)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
