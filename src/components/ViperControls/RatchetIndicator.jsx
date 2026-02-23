import { RATCHET_LEVELS, getRatchetDisplayInfo } from '../../strategies/viper/ratchet.js';

const SEGMENTS = [
  { key: RATCHET_LEVELS.RECOVERY, label: 'Recovery' },
  { key: RATCHET_LEVELS.NORMAL, label: 'Normal' },
  { key: RATCHET_LEVELS.PROTECTED, label: 'Protected' },
  { key: RATCHET_LEVELS.PRESERVATION, label: 'Preserve' },
  { key: RATCHET_LEVELS.LOCKED, label: 'Locked' },
];

export default function RatchetIndicator({ level, dailyPnL = 0 }) {
  const current = getRatchetDisplayInfo(level);

  return (
    <div className="viper-ratchet">
      <div className="viper-ratchet-label">
        <span>Ratchet</span>
        <span className="viper-ratchet-pnl" style={{ color: dailyPnL >= 0 ? '#00d4aa' : '#ff4560' }}>
          {dailyPnL >= 0 ? '+' : ''}{dailyPnL.toFixed(2)} USD
        </span>
      </div>
      <div className="viper-ratchet-bar">
        {SEGMENTS.map((seg) => {
          const info = getRatchetDisplayInfo(seg.key);
          const isActive = seg.key === level;
          return (
            <div
              key={seg.key}
              className={`viper-ratchet-segment ${isActive ? 'active' : ''}`}
              style={{
                background: isActive ? info.color : `${info.color}20`,
                borderColor: isActive ? info.color : 'transparent',
              }}
              title={`${seg.label}${isActive ? ' (active)' : ''}`}
            >
              <span className="viper-ratchet-segment-label">{seg.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
