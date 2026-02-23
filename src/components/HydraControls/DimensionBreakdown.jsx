/* ============================================================
   HYDRA — Dimension Breakdown Bars
   ============================================================ */

const DIMENSION_LABELS = [
  { key: 'd1', label: 'Trend Alignment', max: 20 },
  { key: 'd2', label: 'Momentum Quality', max: 20 },
  { key: 'd3', label: 'Volume Conviction', max: 20 },
  { key: 'd4', label: 'Microstructure', max: 20 },
  { key: 'd5', label: 'Session Intel', max: 20 },
];

function getBarColor(score, max) {
  const pct = score / max;
  if (pct >= 0.8) return 'var(--bullish)';
  if (pct >= 0.6) return 'var(--accent)';
  if (pct >= 0.4) return 'var(--warning-yellow)';
  return 'var(--bearish)';
}

export default function DimensionBreakdown({ dimensions }) {
  if (!dimensions) {
    return (
      <div className="hydra-dimensions">
        <div className="hydra-dimensions-empty">Waiting for score data...</div>
      </div>
    );
  }

  return (
    <div className="hydra-dimensions">
      {DIMENSION_LABELS.map(({ key, label, max }) => {
        const dim = dimensions[key];
        const score = dim?.score ?? 0;
        const pct = (score / max) * 100;
        const color = getBarColor(score, max);

        return (
          <div key={key} className="hydra-dim-row">
            <div className="hydra-dim-label">
              <span className="hydra-dim-key">{key.toUpperCase()}</span>
              <span className="hydra-dim-name">{label}</span>
            </div>
            <div className="hydra-dim-bar-container">
              <div
                className="hydra-dim-bar"
                style={{ width: `${pct}%`, backgroundColor: color }}
              />
            </div>
            <span className="hydra-dim-score">{score}/{max}</span>
          </div>
        );
      })}

      {/* Show first detail from each dimension */}
      <div className="hydra-dim-details">
        {DIMENSION_LABELS.map(({ key }) => {
          const dim = dimensions[key];
          const firstDetail = dim?.detail?.[0];
          return firstDetail ? (
            <div key={key} className="hydra-dim-detail-line">
              <span className="hydra-dim-detail-key">{key.toUpperCase()}</span>
              {firstDetail}
            </div>
          ) : null;
        })}
      </div>
    </div>
  );
}
