import { useState } from 'react';
import ScalpAnalytics from './ScalpAnalytics';
import SpreadMonitor from './SpreadMonitor';
import TradeFlowBar from './TradeFlowBar';
import FeeImpactCalculator from './FeeImpactCalculator';
import './ScalpDashboard.css';

const TABS = [
  { id: 'analytics', label: 'Analytics' },
  { id: 'spread', label: 'Spread Monitor' },
  { id: 'flow', label: 'Trade Flow' },
  { id: 'fees', label: 'Fee Calculator' },
];

export default function ScalpDashboard() {
  const [activeTab, setActiveTab] = useState('analytics');

  return (
    <div className="scalp-dashboard">
      <div className="scalp-header">
        <h3 className="scalp-title">Scalp Dashboard</h3>
        <div className="scalp-tabs">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              className={`scalp-tab ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>
      <div className="scalp-content">
        {activeTab === 'analytics' && <ScalpAnalytics />}
        {activeTab === 'spread' && <SpreadMonitor />}
        {activeTab === 'flow' && <TradeFlowBar />}
        {activeTab === 'fees' && <FeeImpactCalculator />}
      </div>
    </div>
  );
}
