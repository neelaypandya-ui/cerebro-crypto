import { useState, useCallback } from 'react';
import useStore from '../../store';
import { formatUSD, formatPercent } from '../../utils/formatters';
import './TopBar.css';

/* ============================================================
   TopBar — Top Navigation Bar
   ============================================================ */
export default function TopBar() {
  const tradingMode = useStore((s) => s.tradingMode);
  const setTradingMode = useStore((s) => s.setTradingMode);
  const currentRegime = useStore((s) => s.currentRegime);
  const portfolio = useStore((s) => s.portfolio);
  const wsStatus = useStore((s) => s.wsStatus);
  const toggleSettings = useStore((s) => s.toggleSettings);
  const viperEnabled = useStore((s) => s.viperEnabled);
  const viperActiveMode = useStore((s) => s.viperActiveMode);
  const viperDailyPnL = useStore((s) => s.viperDailyPnL);
  const scannerEnabled = useStore((s) => s.scannerEnabled);
  const setScannerEnabled = useStore((s) => s.setScannerEnabled);
  const scannerPairs = useStore((s) => s.scannerPairs);

  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmInput, setConfirmInput] = useState('');

  /* ---- Mode toggle ---------------------------------------- */
  const handleModeClick = useCallback(() => {
    if (tradingMode === 'paper') {
      setShowConfirm(true);
      setConfirmInput('');
    } else {
      setTradingMode('paper');
    }
  }, [tradingMode, setTradingMode]);

  const handleConfirmSubmit = useCallback(() => {
    if (confirmInput === 'LIVE TRADING') {
      setTradingMode('live');
      setShowConfirm(false);
      setConfirmInput('');
    }
  }, [confirmInput, setTradingMode]);

  const handleConfirmCancel = useCallback(() => {
    setShowConfirm(false);
    setConfirmInput('');
  }, []);

  /* ---- Derived values ------------------------------------- */
  const { totalValue, availableCash, unrealizedPnL, sessionPnL, sessionWinRate } = portfolio;

  const pnlClass = (val) => (val >= 0 ? 'positive' : 'negative');

  return (
    <>
      <div className="topbar-inner">
        {/* Logo */}
        <div className="topbar-logo">
          <span className="topbar-logo-cerebro">CEREBRO</span>
          <span className="topbar-logo-crypto">CRYPTO</span>
        </div>

        <div className="topbar-divider" />

        {/* Regime badge */}
        <div className={`topbar-regime-badge ${currentRegime}`}>
          <span className="topbar-regime-dot" />
          {currentRegime}
        </div>

        {/* Scanner badge */}
        <div className="topbar-divider" />
        <button
          className={`topbar-scanner-badge ${scannerEnabled ? 'on' : 'off'}`}
          onClick={() => setScannerEnabled(!scannerEnabled)}
          title={scannerEnabled ? `Scanner ON: ${scannerPairs?.length || 0} pairs` : 'Scanner OFF — click to enable'}
        >
          SCAN {scannerEnabled ? (scannerPairs?.length || 0) : 'OFF'}
        </button>

        {/* VIPER badge */}
        {viperEnabled && viperActiveMode && (
          <>
            <div className="topbar-divider" />
            <div className={`topbar-viper-badge ${viperActiveMode}`}>
              {viperActiveMode}
              <span className="topbar-viper-pnl">
                {viperDailyPnL >= 0 ? '+' : ''}${viperDailyPnL.toFixed(0)}
              </span>
            </div>
          </>
        )}

        <div className="topbar-divider" />

        {/* Portfolio summary */}
        <div className="topbar-portfolio">
          <div className="topbar-stat">
            <span className="topbar-stat-label">Total Value</span>
            <span className="topbar-stat-value">{formatUSD(totalValue)}</span>
          </div>
          <div className="topbar-stat">
            <span className="topbar-stat-label">Available</span>
            <span className="topbar-stat-value">{formatUSD(availableCash)}</span>
          </div>
          <div className="topbar-stat">
            <span className="topbar-stat-label">Unrealized P&L</span>
            <span className={`topbar-stat-value ${pnlClass(unrealizedPnL)}`}>
              {formatUSD(unrealizedPnL)}
            </span>
          </div>
          <div className="topbar-stat">
            <span className="topbar-stat-label">Session P&L</span>
            <span className={`topbar-stat-value ${pnlClass(sessionPnL)}`}>
              {formatUSD(sessionPnL)}
            </span>
          </div>
          <div className="topbar-stat">
            <span className="topbar-stat-label">Win Rate</span>
            <span className="topbar-stat-value">{formatPercent(sessionWinRate)}</span>
          </div>
        </div>

        {/* Right-side actions */}
        <div className="topbar-actions">
          <button
            className={`topbar-mode-badge ${tradingMode}`}
            onClick={handleModeClick}
            title={tradingMode === 'paper' ? 'Switch to Live Trading' : 'Switch to Paper Trading'}
          >
            {tradingMode === 'paper' ? 'PAPER' : 'LIVE'}
          </button>

          <div className="topbar-ws-status">
            <span className={`topbar-ws-dot ${wsStatus}`} />
            <span>
              {wsStatus === 'connected'
                ? 'WS'
                : wsStatus === 'reconnecting'
                  ? 'Reconnecting'
                  : 'Offline'}
            </span>
          </div>

          <button
            className="topbar-settings-btn"
            onClick={toggleSettings}
            title="Settings"
          >
            &#9881;
          </button>
        </div>
      </div>

      {/* Confirmation modal for switching to LIVE */}
      {showConfirm && (
        <div className="topbar-confirm-overlay" onClick={handleConfirmCancel}>
          <div className="topbar-confirm-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Switch to Live Trading</h3>
            <p>
              You are about to enable LIVE trading with real funds. This action cannot be undone
              without switching back to paper mode. Type <strong>LIVE TRADING</strong> below to confirm.
            </p>
            <input
              className="topbar-confirm-input"
              type="text"
              value={confirmInput}
              onChange={(e) => setConfirmInput(e.target.value)}
              placeholder='Type "LIVE TRADING" to confirm'
              autoFocus
            />
            <div className="topbar-confirm-actions">
              <button className="topbar-confirm-cancel" onClick={handleConfirmCancel}>
                Cancel
              </button>
              <button
                className="topbar-confirm-submit"
                disabled={confirmInput !== 'LIVE TRADING'}
                onClick={handleConfirmSubmit}
              >
                Enable Live Trading
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
