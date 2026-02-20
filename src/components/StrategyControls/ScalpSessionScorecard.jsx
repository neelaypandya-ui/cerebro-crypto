/* ============================================================
   ScalpSessionScorecard — Live scalp session stats widget
   ============================================================ */

import useStore from '../../store';

export default function ScalpSessionScorecard() {
  const scalpSession = useStore((s) => s.scalpSession);

  const { wins, losses, netPnL, fees, trades, streak, pausedUntil, disabled } = scalpSession;
  const winRate = trades > 0 ? ((wins / trades) * 100).toFixed(0) : '—';

  const isPaused = pausedUntil && Date.now() < pausedUntil;
  const pauseMin = isPaused ? Math.ceil((pausedUntil - Date.now()) / 60000) : 0;

  if (trades === 0 && !disabled && !isPaused) return null;

  return (
    <div className="scalp-scorecard">
      <div className="scalp-scorecard-title">Scalp Session</div>
      <div className="scalp-scorecard-grid">
        <div className="scalp-scorecard-item">
          <span className="scalp-scorecard-label">W/L</span>
          <span className="scalp-scorecard-value">{wins}/{losses}</span>
        </div>
        <div className="scalp-scorecard-item">
          <span className="scalp-scorecard-label">Win%</span>
          <span className={`scalp-scorecard-value ${wins > losses ? 'bullish' : losses > wins ? 'bearish' : ''}`}>
            {winRate}%
          </span>
        </div>
        <div className="scalp-scorecard-item">
          <span className="scalp-scorecard-label">Net</span>
          <span className={`scalp-scorecard-value ${netPnL >= 0 ? 'bullish' : 'bearish'}`}>
            ${netPnL.toFixed(2)}
          </span>
        </div>
        <div className="scalp-scorecard-item">
          <span className="scalp-scorecard-label">Fees</span>
          <span className="scalp-scorecard-value">${fees.toFixed(2)}</span>
        </div>
        <div className="scalp-scorecard-item">
          <span className="scalp-scorecard-label">Streak</span>
          <span className={`scalp-scorecard-value ${streak >= 0 ? 'bullish' : 'bearish'}`}>
            {streak > 0 ? `+${streak}` : streak}
          </span>
        </div>
      </div>

      {isPaused && (
        <div className="scalp-scorecard-alert warning">
          Circuit breaker: paused for {pauseMin} min
        </div>
      )}
      {disabled && (
        <div className="scalp-scorecard-alert danger">
          Session disabled: loss threshold exceeded
        </div>
      )}
    </div>
  );
}
