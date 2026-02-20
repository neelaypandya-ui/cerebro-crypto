import { useState, useMemo } from 'react';
import useStore from '../../store';
import { INDICATOR_DEFAULTS, INDICATOR_CATEGORIES } from '../../config/indicatorDefaults';

export default function IndicatorList({ onSelectIndicator }) {
  const [search, setSearch] = useState('');
  const indicatorConfig = useStore((s) => s.indicatorConfig);
  const setIndicatorConfig = useStore((s) => s.setIndicatorConfig);

  const indicators = useMemo(() => {
    const all = Object.values(INDICATOR_DEFAULTS);
    if (!search) return all;
    const q = search.toLowerCase();
    return all.filter((ind) => ind.name.toLowerCase().includes(q) || ind.key.toLowerCase().includes(q));
  }, [search]);

  const grouped = useMemo(() => {
    const groups = {};
    for (const cat of Object.values(INDICATOR_CATEGORIES)) {
      groups[cat] = indicators.filter((ind) => ind.category === cat);
    }
    return groups;
  }, [indicators]);

  const toggleIndicator = (key) => {
    const current = indicatorConfig[key] || {};
    setIndicatorConfig({ [key]: { ...current, enabled: !current.enabled } });
  };

  return (
    <div className="indpicker-list">
      <input
        className="indpicker-search"
        type="text"
        placeholder="Search indicators..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {Object.entries(grouped).map(([category, inds]) => {
        if (inds.length === 0) return null;
        return (
          <div key={category} className="indpicker-category">
            <div className="indpicker-category-title">{category}</div>
            {inds.map((ind) => {
              const cfg = indicatorConfig[ind.key] || {};
              const enabled = cfg.enabled || false;
              return (
                <div key={ind.key} className={`indpicker-item ${enabled ? 'enabled' : ''}`}>
                  <button
                    className={`indpicker-toggle ${enabled ? 'on' : 'off'}`}
                    onClick={() => toggleIndicator(ind.key)}
                  >
                    <span className="indpicker-toggle-knob" />
                  </button>
                  <div className="indpicker-item-info" onClick={() => onSelectIndicator(ind.key)}>
                    <span className="indpicker-item-name">{ind.name}</span>
                    <span className="indpicker-item-desc">{ind.description}</span>
                  </div>
                  <span className="indpicker-item-color" style={{ background: cfg.color || ind.color }} />
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
