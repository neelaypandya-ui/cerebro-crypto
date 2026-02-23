import { getThreatDisplayInfo } from '../../strategies/viper/performanceLedger.js';

export default function ThreatBadge({ status }) {
  const { label, color } = getThreatDisplayInfo(status);

  return (
    <span
      className="viper-threat-badge"
      style={{
        background: `${color}20`,
        color,
        border: `1px solid ${color}40`,
      }}
    >
      {label}
    </span>
  );
}
