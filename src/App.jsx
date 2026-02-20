import React, { useState, useEffect, useCallback } from 'react';
import useStore from './store';
import useMarketData from './hooks/useMarketData';
import useStrategyEngine from './hooks/useStrategyEngine';

import TopBar           from './components/TopBar/TopBar';
import Watchlist        from './components/Watchlist/Watchlist';
import OrderBook        from './components/OrderBook/OrderBook';
import Chart            from './components/Chart/Chart';
import StrategyControls from './components/StrategyControls/StrategyControls';
import OrderEntry       from './components/OrderEntry/OrderEntry';
import Positions        from './components/Positions/Positions';
import TradeLog         from './components/TradeLog/TradeLog';
import Settings         from './components/Settings/Settings';
import Toasts           from './components/Toasts/Toasts';
import AIAssistant      from './components/AIAssistant/AIAssistant';
import Backtest         from './components/Backtest/Backtest';
import AlertManager     from './components/AlertManager/AlertManager';
import ScalpDashboard   from './components/ScalpDashboard';
import Guide            from './components/Guide';

import './App.css';

/* ============================================================
   ChartSafe — loads Chart in an iframe-like isolation layer.
   The Chart component is loaded lazily; if it crashes, only
   the chart panel is affected.
   ============================================================ */
const LazyChart = React.lazy(() => import('./components/Chart/Chart'));

function ChartSafe() {
  return (
    <React.Suspense fallback={<div style={{ padding: 20, color: '#8888aa', fontSize: 12 }}>Loading chart...</div>}>
      <LazyChart />
    </React.Suspense>
  );
}

/* ============================================================
   PanelBoundary — per-panel error boundary so one crash
   doesn't take down the whole app
   ============================================================ */
class PanelBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, retries: 0 };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.error(`[PanelBoundary:${this.props.label}]`, error, info);
    // Auto-recover panel after 1 second (up to 5 retries)
    if (this.state.retries < 5) {
      setTimeout(() => {
        this.setState((s) => ({ error: null, retries: s.retries + 1 }));
      }, 1000);
    }
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 10, fontSize: 11, color: '#ff4560' }}>
          <strong>{this.props.label || 'Panel'}:</strong>{' '}
          {this.state.retries < 5 ? 'Recovering...' : String(this.state.error.message || this.state.error)}
        </div>
      );
    }
    return this.props.children;
  }
}

/* ============================================================
   Bottom-tab identifiers for slide-up modals
   ============================================================ */
const BOTTOM_TABS = [
  { id: 'backtest',     label: 'Backtesting' },
  { id: 'alerts',       label: 'Alert Manager' },
  { id: 'scalp',        label: 'Scalp Dashboard' },
  { id: 'guide',        label: 'User Guide' },
];

/* ============================================================
   App — Root Layout Component
   ============================================================ */
export default function App() {
  const tradingMode = useStore((s) => s.tradingMode);

  // Initialize WebSocket, REST data fetching, and indicator calculations
  useMarketData();

  // Start the strategy execution engine (side-effect only, no UI output)
  useStrategyEngine();

  const [activeModal, setActiveModal] = useState(null);
  const [aiCollapsed, setAiCollapsed] = useState(false);

  /* ---- Modal helpers -------------------------------------- */
  const openModal = useCallback((id) => {
    setActiveModal((prev) => (prev === id ? null : id));
  }, []);

  const closeModal = useCallback(() => {
    setActiveModal(null);
  }, []);

  /* ---- Derive root CSS class ------------------------------ */
  const modeClass = tradingMode === 'live' ? 'live' : 'paper';

  return (
    <div className={`app-container ${modeClass}`}>
      {/* ====== Row 1 — Top Bar ============================== */}
      <header className="top-bar">
        <TopBar />
      </header>

      {/* ====== Row 2 — Three-column body ==================== */}

      {/* -- Left Sidebar ------------------------------------ */}
      <aside className="left-sidebar">
        <div className="panel-card sidebar-panel">
          <PanelBoundary label="Watchlist">
            <Watchlist />
          </PanelBoundary>
        </div>
        <div className="panel-card sidebar-panel">
          <PanelBoundary label="OrderBook">
            <OrderBook />
          </PanelBoundary>
        </div>
      </aside>

      {/* -- Main / Center Panel ----------------------------- */}
      <main className="main-panel">
        <div className="panel-card chart-panel">
          <PanelBoundary label="Chart">
            <Chart />
          </PanelBoundary>
        </div>
        <div className="panel-card strategy-panel">
          <PanelBoundary label="StrategyControls">
            <StrategyControls />
          </PanelBoundary>
        </div>
      </main>

      {/* -- Right Sidebar ----------------------------------- */}
      <aside className="right-sidebar">
        <div className="panel-card right-panel">
          <PanelBoundary label="OrderEntry">
            <OrderEntry />
          </PanelBoundary>
        </div>
        <div className="panel-card right-panel">
          <PanelBoundary label="Positions">
            <Positions />
          </PanelBoundary>
        </div>
        <div className="panel-card right-panel">
          <PanelBoundary label="TradeLog">
            <TradeLog />
          </PanelBoundary>
        </div>
        <div className="panel-card right-panel ai-panel">
          <button
            className="ai-collapse-toggle"
            onClick={() => setAiCollapsed((c) => !c)}
            aria-label={aiCollapsed ? 'Expand AI Assistant' : 'Collapse AI Assistant'}
          >
            AI Assistant {aiCollapsed ? '+' : '-'}
          </button>
          {!aiCollapsed && (
            <PanelBoundary label="AIAssistant">
              <AIAssistant />
            </PanelBoundary>
          )}
        </div>
      </aside>

      {/* ====== Bottom Tab Bar =============================== */}
      <nav className="bottom-tab-bar">
        {BOTTOM_TABS.map((tab) => (
          <button
            key={tab.id}
            className={`bottom-tab ${activeModal === tab.id ? 'active' : ''}`}
            onClick={() => openModal(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {/* ====== Slide-up Modal Overlay ======================= */}
      {activeModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div
            className="modal-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            <button className="modal-close" onClick={closeModal}>
              &times;
            </button>

            {activeModal === 'backtest' && <Backtest />}
            {activeModal === 'alerts'   && <AlertManager />}
            {activeModal === 'scalp'    && <ScalpDashboard />}
            {activeModal === 'guide'    && <Guide />}
          </div>
        </div>
      )}

      {/* ====== Settings Slide-out (always mounted, self-manages visibility) ====== */}
      <Settings />

      {/* ====== Toast Notifications ====== */}
      <Toasts />
    </div>
  );
}
