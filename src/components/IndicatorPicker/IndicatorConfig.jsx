import { useMemo } from 'react';
import useStore from '../../store';
import { INDICATOR_DEFAULTS } from '../../config/indicatorDefaults';

export default function IndicatorConfig({ indicatorKey, onBack }) {
  const indicatorConfig = useStore((s) => s.indicatorConfig);
  const setIndicatorConfig = useStore((s) => s.setIndicatorConfig);

  const defaults = indicatorKey ? INDICATOR_DEFAULTS[indicatorKey] : null;
  const config = indicatorKey ? (indicatorConfig[indicatorKey] || {}) : {};

  if (!defaults) {
    return (
      <div className="indpicker-config">
        <button className="indpicker-back" onClick={onBack}>← Back</button>
        <div className="indpicker-config-empty">Select an indicator to configure</div>
      </div>
    );
  }

  const currentParams = { ...defaults.params, ...(config.params || {}) };

  const updateParam = (paramKey, value) => {
    const numVal = parseFloat(value);
    if (isNaN(numVal)) return;
    setIndicatorConfig({
      [indicatorKey]: {
        ...config,
        params: { ...currentParams, [paramKey]: numVal },
      },
    });
  };

  const updateColor = (color) => {
    setIndicatorConfig({ [indicatorKey]: { ...config, color } });
  };

  const resetDefaults = () => {
    setIndicatorConfig({
      [indicatorKey]: { enabled: config.enabled, params: { ...defaults.params }, color: defaults.color },
    });
  };

  return (
    <div className="indpicker-config">
      <button className="indpicker-back" onClick={onBack}>← Back</button>
      <div className="indpicker-config-header">
        <span className="indpicker-config-name">{defaults.name}</span>
        <span className="indpicker-config-cat">{defaults.category}</span>
      </div>
      <div className="indpicker-config-desc">{defaults.description}</div>

      <div className="indpicker-params">
        {Object.entries(defaults.params).map(([key, defaultVal]) => (
          <div key={key} className="indpicker-param-row">
            <label className="indpicker-param-label">{key}</label>
            <input
              className="indpicker-param-input"
              type="number"
              value={currentParams[key] ?? defaultVal}
              onChange={(e) => updateParam(key, e.target.value)}
              step={typeof defaultVal === 'number' && defaultVal < 1 ? 0.01 : 1}
            />
          </div>
        ))}
      </div>

      <div className="indpicker-param-row">
        <label className="indpicker-param-label">Color</label>
        <input
          className="indpicker-color-input"
          type="color"
          value={config.color || defaults.color}
          onChange={(e) => updateColor(e.target.value)}
        />
      </div>

      <button className="indpicker-reset-btn" onClick={resetDefaults}>Reset to Defaults</button>
    </div>
  );
}
