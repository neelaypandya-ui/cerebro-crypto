/* ============================================================
   HYDRA — Circular Score Gauge (0–100)
   ============================================================ */

import { useMemo } from 'react';

const RADIUS = 54;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function getScoreColor(score) {
  if (score >= 80) return '#00d4aa'; // bullish green
  if (score >= 60) return '#f0b429'; // warning yellow
  if (score >= 40) return '#ff8c00'; // orange
  return '#ff4560'; // bearish red
}

export default function ScoreGauge({ score, threshold }) {
  const safeScore = score ?? 0;
  const pct = safeScore / 100;
  const offset = CIRCUMFERENCE * (1 - pct);
  const color = getScoreColor(safeScore);
  const aboveThreshold = safeScore >= (threshold || 80);

  // Threshold position on the gauge
  const thresholdPct = (threshold || 80) / 100;
  const thresholdAngle = thresholdPct * 360 - 90;
  const thresholdRad = (thresholdAngle * Math.PI) / 180;
  const thresholdX = 64 + 54 * Math.cos(thresholdRad);
  const thresholdY = 64 + 54 * Math.sin(thresholdRad);

  return (
    <div className="hydra-gauge-container">
      <svg viewBox="0 0 128 128" className="hydra-gauge-svg">
        {/* Background circle */}
        <circle
          cx="64" cy="64" r={RADIUS}
          fill="none"
          stroke="var(--border)"
          strokeWidth="8"
        />

        {/* Score arc */}
        <circle
          cx="64" cy="64" r={RADIUS}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={offset}
          transform="rotate(-90 64 64)"
          style={{ transition: 'stroke-dashoffset 0.4s ease, stroke 0.3s ease' }}
        />

        {/* Threshold marker */}
        <circle
          cx={thresholdX} cy={thresholdY}
          r="3"
          fill="var(--text-secondary)"
        />

        {/* Pulsing ring when above threshold */}
        {aboveThreshold && (
          <circle
            cx="64" cy="64" r="60"
            fill="none"
            stroke={color}
            strokeWidth="1.5"
            opacity="0.5"
            className="hydra-gauge-pulse"
          />
        )}
      </svg>

      <div className="hydra-gauge-center">
        <span className="hydra-gauge-score" style={{ color }}>
          {safeScore}
        </span>
        <span className="hydra-gauge-max">/100</span>
      </div>

      {aboveThreshold && (
        <div className="hydra-gauge-ready">READY</div>
      )}
    </div>
  );
}
