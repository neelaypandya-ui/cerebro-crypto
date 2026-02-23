const MODE_CONFIG = {
  STRIKE: { color: '#ff8c00', icon: '\u26A1', label: 'STRIKE' },
  COIL:   { color: '#00bcd4', icon: '\u27B0', label: 'COIL' },
  LUNGE:  { color: '#9c27b0', icon: '\uD83D\uDE80', label: 'LUNGE' },
};

export default function ModeScores({ scores, activeMode }) {
  if (!scores) return null;

  return (
    <div className="viper-mode-scores">
      {Object.entries(MODE_CONFIG).map(([mode, config]) => {
        const score = scores[mode] || 0;
        const isActive = mode === activeMode;

        return (
          <div
            key={mode}
            className={`viper-mode-row ${isActive ? 'active' : ''}`}
            style={isActive ? { borderColor: config.color, boxShadow: `0 0 8px ${config.color}30` } : {}}
          >
            <span className="viper-mode-icon">{config.icon}</span>
            <span className="viper-mode-label" style={isActive ? { color: config.color } : {}}>
              {config.label}
            </span>
            <div className="viper-mode-bar-track">
              <div
                className="viper-mode-bar-fill"
                style={{
                  width: `${score}%`,
                  background: isActive
                    ? `linear-gradient(90deg, ${config.color}80, ${config.color})`
                    : `${config.color}40`,
                }}
              />
            </div>
            <span className="viper-mode-score" style={isActive ? { color: config.color } : {}}>
              {score}
            </span>
          </div>
        );
      })}
    </div>
  );
}
