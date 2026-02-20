import { useState } from 'react';
import useStore from '../../store';
import { BUILTIN_PRESETS } from '../../config/indicatorDefaults';

export default function PresetManager() {
  const [newPresetName, setNewPresetName] = useState('');
  const indicatorConfig = useStore((s) => s.indicatorConfig);
  const indicatorPresets = useStore((s) => s.indicatorPresets);
  const activePreset = useStore((s) => s.activePreset);
  const setIndicatorPreset = useStore((s) => s.setIndicatorPreset);
  const deleteIndicatorPreset = useStore((s) => s.deleteIndicatorPreset);
  const loadPreset = useStore((s) => s.loadPreset);
  const setIndicatorConfig = useStore((s) => s.setIndicatorConfig);

  const handleSave = () => {
    if (!newPresetName.trim()) return;
    setIndicatorPreset(newPresetName.trim(), { ...indicatorConfig });
    setNewPresetName('');
  };

  const handleLoadBuiltin = (key) => {
    const preset = BUILTIN_PRESETS[key];
    if (preset) {
      // Set the indicator config from the built-in preset
      const config = {};
      for (const [indKey, settings] of Object.entries(preset.indicators)) {
        config[indKey] = { enabled: true, ...settings };
      }
      setIndicatorConfig(config);
      useStore.setState({ activePreset: preset.name });
    }
  };

  return (
    <div className="indpicker-presets">
      <div className="indpicker-presets-section">
        <div className="indpicker-presets-title">Built-in Presets</div>
        {Object.entries(BUILTIN_PRESETS).map(([key, preset]) => (
          <div key={key} className="indpicker-preset-row">
            <div className="indpicker-preset-info">
              <span className="indpicker-preset-name">{preset.name}</span>
            </div>
            <button className="indpicker-preset-load" onClick={() => handleLoadBuiltin(key)}>Load</button>
          </div>
        ))}
      </div>

      <div className="indpicker-presets-section">
        <div className="indpicker-presets-title">Custom Presets</div>
        {Object.entries(indicatorPresets).length === 0 && (
          <div className="indpicker-presets-empty">No saved presets</div>
        )}
        {Object.entries(indicatorPresets).map(([name, config]) => (
          <div key={name} className={`indpicker-preset-row ${activePreset === name ? 'active' : ''}`}>
            <div className="indpicker-preset-info">
              <span className="indpicker-preset-name">{name}</span>
              <span className="indpicker-preset-count">{Object.keys(config).filter((k) => config[k]?.enabled).length} indicators</span>
            </div>
            <button className="indpicker-preset-load" onClick={() => loadPreset(name)}>Load</button>
            <button className="indpicker-preset-delete" onClick={() => deleteIndicatorPreset(name)}>×</button>
          </div>
        ))}
      </div>

      <div className="indpicker-presets-save">
        <input
          className="indpicker-preset-input"
          type="text"
          placeholder="New preset name..."
          value={newPresetName}
          onChange={(e) => setNewPresetName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSave()}
        />
        <button className="indpicker-preset-save-btn" onClick={handleSave} disabled={!newPresetName.trim()}>Save Current</button>
      </div>
    </div>
  );
}
