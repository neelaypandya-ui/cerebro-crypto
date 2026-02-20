import { useMemo } from 'react';
import useStore from '../../store';

export default function ScalpAnalytics() {
  const scalpSession = useStore((s) => s.scalpSession);
  const resetScalpSession = useStore((s) => s.resetScalpSession);

  const stats = useMemo(() => {
    const { wins, losses, netPnL, fees, trades, history } = scalpSession;
    const winRate = trades > 0 ? (wins / trades) * 100 : 0;
    const avgWin = wins > 0 ? history.filter((t) => t.pnl >= 0).reduce((s, t) => s + t.pnl, 0) / wins : 0;
    const avgLoss = losses > 0 ? Math.abs(history.filter((t) => t.pnl < 0).reduce((s, t) => s + t.pnl, 0)) / losses : 0;
    const expectancy = trades > 0 ? (winRate / 100) * avgWin - ((100 - winRate) / 100) * avgLoss : 0;
    const feeDrag = netPnL !== 0 ? (fees / Math.abs(netPnL + fees)) * 100 : 0;
    const avgDuration = history.length > 0 ? history.reduce((s, t) => s + (t.duration || 0), 0) / history.length : 0;

    let verdict = 'neutral';
    let verdictText = 'Insufficient data';
    if (trades >= 10) {
      if (expectancy > 0 && winRate > 50 && feeDrag < 40) {
        verdict = 'bullish';
        verdictText = 'Scalping is profitable — keep going';
      } else if (expectancy < 0 || feeDrag > 60) {
        verdict = 'bearish';
        verdictText = 'Scalping is unprofitable — consider stopping';
      } else {
        verdict = 'choppy';
        verdictText = 'Marginal — tighten entries or increase size';
      }
    }

    return { winRate, avgWin, avgLoss, expectancy, feeDrag, avgDuration, verdict, verdictText };
  }, [scalpSession]);

  return (
    <div className="scalp-analytics">
      <div className="scalp-stats-grid">
        <div className="scalp-stat">
          <span className="scalp-stat-label">Trades</span>
          <span className="scalp-stat-value">{scalpSession.trades}</span>
        </div>
        <div className="scalp-stat">
          <span className="scalp-stat-label">Win Rate</span>
          <span className={`scalp-stat-value ${stats.winRate >= 50 ? 'bullish' : 'bearish'}`}>{stats.winRate.toFixed(1)}%</span>
        </div>
        <div className="scalp-stat">
          <span className="scalp-stat-label">Net P&L</span>
          <span className={`scalp-stat-value ${scalpSession.netPnL >= 0 ? 'bullish' : 'bearish'}`}>${scalpSession.netPnL.toFixed(2)}</span>
        </div>
        <div className="scalp-stat">
          <span className="scalp-stat-label">Fees Paid</span>
          <span className="scalp-stat-value">${scalpSession.fees.toFixed(2)}</span>
        </div>
        <div className="scalp-stat">
          <span className="scalp-stat-label">Streak</span>
          <span className={`scalp-stat-value ${scalpSession.streak >= 0 ? 'bullish' : 'bearish'}`}>{scalpSession.streak}</span>
        </div>
        <div className="scalp-stat">
          <span className="scalp-stat-label">Expectancy</span>
          <span className={`scalp-stat-value ${stats.expectancy >= 0 ? 'bullish' : 'bearish'}`}>${stats.expectancy.toFixed(2)}</span>
        </div>
        <div className="scalp-stat">
          <span className="scalp-stat-label">Fee Drag</span>
          <span className={`scalp-stat-value ${stats.feeDrag < 40 ? 'bullish' : 'bearish'}`}>{stats.feeDrag.toFixed(1)}%</span>
        </div>
        <div className="scalp-stat">
          <span className="scalp-stat-label">Avg Duration</span>
          <span className="scalp-stat-value">{stats.avgDuration.toFixed(0)}s</span>
        </div>
      </div>

      <div className={`scalp-verdict ${stats.verdict}`}>
        <span className="scalp-verdict-icon">{stats.verdict === 'bullish' ? '\u2713' : stats.verdict === 'bearish' ? '\u2717' : '~'}</span>
        <span className="scalp-verdict-text">{stats.verdictText}</span>
      </div>

      {scalpSession.pausedUntil && Date.now() < scalpSession.pausedUntil && (
        <div className="scalp-paused-banner">
          Circuit breaker active — paused until {new Date(scalpSession.pausedUntil).toLocaleTimeString()}
        </div>
      )}

      {scalpSession.disabled && (
        <div className="scalp-disabled-banner">
          Session disabled: net P&L exceeded loss threshold
        </div>
      )}

      <button className="scalp-reset-btn" onClick={resetScalpSession}>Reset Session</button>
    </div>
  );
}
