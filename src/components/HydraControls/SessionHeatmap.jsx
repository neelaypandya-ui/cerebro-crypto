/* ============================================================
   HYDRA — 24-Hour Session Heatmap
   ============================================================ */

import { useMemo } from 'react';
import { getSessionScore } from '../../strategies/hydra/sessionProfiles.js';

function getHeatColor(score) {
  if (score >= 10) return 'rgba(0, 212, 170, 0.6)';
  if (score >= 8)  return 'rgba(0, 212, 170, 0.35)';
  if (score >= 6)  return 'rgba(108, 99, 255, 0.3)';
  if (score >= 4)  return 'rgba(240, 180, 41, 0.2)';
  return 'rgba(255, 69, 96, 0.15)';
}

export default function SessionHeatmap({ pair }) {
  const currentHour = new Date().getUTCHours();

  const hours = useMemo(() => {
    const result = [];
    for (let h = 0; h < 24; h++) {
      result.push({
        hour: h,
        score: getSessionScore(pair || 'BTC-USD', h),
        isCurrent: h === currentHour,
      });
    }
    return result;
  }, [pair, currentHour]);

  const currentScore = hours.find((h) => h.isCurrent)?.score || 0;

  return (
    <div className="hydra-heatmap">
      <div className="hydra-heatmap-header">
        <span className="hydra-heatmap-title">Session Intelligence</span>
        <span className="hydra-heatmap-current">
          Now: {currentHour}:00 UTC ({currentScore}/12)
        </span>
      </div>
      <div className="hydra-heatmap-grid">
        {hours.map(({ hour, score, isCurrent }) => (
          <div
            key={hour}
            className={`hydra-heatmap-cell ${isCurrent ? 'current' : ''}`}
            style={{ backgroundColor: getHeatColor(score) }}
            title={`${hour}:00 UTC — Score: ${score}/12`}
          >
            <span className="hydra-heatmap-hour">{hour}</span>
          </div>
        ))}
      </div>
      <div className="hydra-heatmap-legend">
        <span className="hydra-heatmap-legend-item">
          <span className="hydra-heatmap-swatch" style={{ backgroundColor: 'rgba(255, 69, 96, 0.15)' }} />
          Low
        </span>
        <span className="hydra-heatmap-legend-item">
          <span className="hydra-heatmap-swatch" style={{ backgroundColor: 'rgba(108, 99, 255, 0.3)' }} />
          Mid
        </span>
        <span className="hydra-heatmap-legend-item">
          <span className="hydra-heatmap-swatch" style={{ backgroundColor: 'rgba(0, 212, 170, 0.6)' }} />
          Prime
        </span>
      </div>
    </div>
  );
}
