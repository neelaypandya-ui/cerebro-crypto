/* ============================================================
   StrategyControls — HYDRA + VIPER Dashboard
   ============================================================
   Tab switcher between HYDRA and VIPER strategy panels.
   VIPER tab only visible when viperEnabled is true.
   ============================================================ */

import { useState, useEffect } from 'react';
import useStore from '../../store';
import HydraControls from '../HydraControls';
import ViperControls from '../ViperControls';

export default function StrategyControls() {
  const viperEnabled = useStore((s) => s.viperEnabled);
  const [activeTab, setActiveTab] = useState('hydra');

  // Auto-switch tabs when VIPER is enabled/disabled
  useEffect(() => {
    if (viperEnabled && activeTab !== 'viper') {
      setActiveTab('viper');
    } else if (!viperEnabled && activeTab === 'viper') {
      setActiveTab('hydra');
    }
  }, [viperEnabled]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      {viperEnabled && (
        <div style={{
          display: 'flex',
          gap: 0,
          borderBottom: '1px solid #1e1e2e',
          marginBottom: 0,
        }}>
          <button
            onClick={() => setActiveTab('hydra')}
            style={{
              flex: 1,
              padding: '6px 0',
              background: activeTab === 'hydra' ? 'rgba(108, 99, 255, 0.1)' : 'transparent',
              color: activeTab === 'hydra' ? '#6c63ff' : '#8888aa',
              border: 'none',
              borderBottom: activeTab === 'hydra' ? '2px solid #6c63ff' : '2px solid transparent',
              fontSize: '11px',
              fontWeight: 700,
              letterSpacing: '1px',
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            HYDRA
          </button>
          <button
            onClick={() => setActiveTab('viper')}
            style={{
              flex: 1,
              padding: '6px 0',
              background: activeTab === 'viper' ? 'rgba(0, 188, 212, 0.1)' : 'transparent',
              color: activeTab === 'viper' ? '#00bcd4' : '#8888aa',
              border: 'none',
              borderBottom: activeTab === 'viper' ? '2px solid #00bcd4' : '2px solid transparent',
              fontSize: '11px',
              fontWeight: 700,
              letterSpacing: '1px',
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            VIPER
          </button>
        </div>
      )}
      {activeTab === 'hydra' && <HydraControls />}
      {activeTab === 'viper' && viperEnabled && <ViperControls />}
    </div>
  );
}
