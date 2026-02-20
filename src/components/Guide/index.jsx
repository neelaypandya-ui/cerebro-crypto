import { useState } from 'react';
import GuideSidebar from './GuideSidebar';
import GuideSearch from './GuideSearch';
import GuideContent from './GuideContent';
import './Guide.css';

const SECTIONS = [
  { id: 'getting-started', title: 'Getting Started' },
  { id: 'interface', title: 'Interface Overview' },
  { id: 'paper-vs-live', title: 'Paper vs Live Trading' },
  { id: 'regime', title: 'Regime Detection' },
  { id: 'strategies', title: 'Strategy Guide (A-H)' },
  { id: 'risk', title: 'Risk Management' },
  { id: 'charts', title: 'Reading Charts' },
  { id: 'ai', title: 'AI Analyst' },
  { id: 'backtesting', title: 'Backtesting' },
  { id: 'scalping', title: 'Scalping Best Practices' },
  { id: 'troubleshooting', title: 'Troubleshooting' },
];

export default function Guide() {
  const [activeSection, setActiveSection] = useState('getting-started');
  const [searchQuery, setSearchQuery] = useState('');

  return (
    <div className="guide-container">
      <div className="guide-sidebar">
        <GuideSearch query={searchQuery} onSearch={setSearchQuery} />
        <GuideSidebar sections={SECTIONS} active={activeSection} onSelect={setActiveSection} />
      </div>
      <div className="guide-main">
        <GuideContent activeSection={activeSection} searchQuery={searchQuery} sections={SECTIONS} />
      </div>
    </div>
  );
}
