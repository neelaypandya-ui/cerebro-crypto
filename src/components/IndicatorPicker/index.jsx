import { useState } from 'react';
import IndicatorList from './IndicatorList';
import IndicatorConfig from './IndicatorConfig';
import PresetManager from './PresetManager';
import './IndicatorPicker.css';

export default function IndicatorPicker({ onClose }) {
  const [activeTab, setActiveTab] = useState('indicators'); // 'indicators' | 'config' | 'presets'
  const [selectedIndicator, setSelectedIndicator] = useState(null);

  return (
    <div className="indpicker-panel">
      <div className="indpicker-tabs">
        <button className={`indpicker-tab ${activeTab === 'indicators' ? 'active' : ''}`} onClick={() => setActiveTab('indicators')}>Indicators</button>
        <button className={`indpicker-tab ${activeTab === 'config' ? 'active' : ''}`} onClick={() => setActiveTab('config')}>Configure</button>
        <button className={`indpicker-tab ${activeTab === 'presets' ? 'active' : ''}`} onClick={() => setActiveTab('presets')}>Presets</button>
        <button className="indpicker-close" onClick={onClose}>&times;</button>
      </div>
      <div className="indpicker-content">
        {activeTab === 'indicators' && <IndicatorList onSelectIndicator={(key) => { setSelectedIndicator(key); setActiveTab('config'); }} />}
        {activeTab === 'config' && <IndicatorConfig indicatorKey={selectedIndicator} onBack={() => setActiveTab('indicators')} />}
        {activeTab === 'presets' && <PresetManager />}
      </div>
    </div>
  );
}
