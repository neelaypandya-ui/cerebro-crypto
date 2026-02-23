import { useState, useCallback, useEffect } from 'react';
import useStore from '../../store';
import { RISK_DEFAULTS, DEFAULT_PAIRS, TIMEFRAMES } from '../../config/constants';
import coinbaseREST from '../../services/coinbaseREST';
import './Settings.css';

/* ============================================================
   Settings — Slide-out Settings Panel
   ============================================================ */

/* localStorage key helpers */
const lsGet = (key, fallback) => {
  try {
    const v = localStorage.getItem(key);
    return v !== null ? JSON.parse(v) : fallback;
  } catch { return fallback; }
};
const lsSave = (key, val) => {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch { /* ignore */ }
};

export default function Settings() {
  const settingsOpen = useStore((s) => s.settingsOpen);
  const toggleSettings = useStore((s) => s.toggleSettings);
  const wsStatus = useStore((s) => s.wsStatus);
  const riskSettings = useStore((s) => s.riskSettings);
  const setRiskSettings = useStore((s) => s.setRiskSettings);
  const paperPortfolio = useStore((s) => s.paperPortfolio);
  const updatePaperPortfolio = useStore((s) => s.updatePaperPortfolio);
  const addToast = useStore((s) => s.addToast);
  const hydraSettings = useStore((s) => s.hydraSettings);
  const setHydraSettings = useStore((s) => s.setHydraSettings);
  const viperEnabled = useStore((s) => s.viperEnabled);
  const setViperEnabled = useStore((s) => s.setViperEnabled);
  const viperSettings = useStore((s) => s.viperSettings);
  const setViperSettings = useStore((s) => s.setViperSettings);
  const allocationConfig = useStore((s) => s.allocationConfig);
  const setAllocationConfig = useStore((s) => s.setAllocationConfig);
  const scannerEnabled = useStore((s) => s.scannerEnabled);
  const setScannerEnabled = useStore((s) => s.setScannerEnabled);
  const scannerPairs = useStore((s) => s.scannerPairs);
  const setScannerPairs = useStore((s) => s.setScannerPairs);
  const maxConcurrentPositions = useStore((s) => s.maxConcurrentPositions);
  const setMaxConcurrentPositions = useStore((s) => s.setMaxConcurrentPositions);
  const hydraDailyLossLimit = useStore((s) => s.hydraDailyLossLimit);
  const setHydraDailyLossLimit = useStore((s) => s.setHydraDailyLossLimit);

  /* ---- Local form state ----------------------------------- */
  const [apiKey, setApiKey] = useState(() => lsGet('cb_api_key', ''));
  const [apiSecret, setApiSecret] = useState(() => lsGet('cb_api_secret', ''));
  const [paperBalance, setPaperBalance] = useState(String(paperPortfolio.startingBalance || 25000));
  const [risk, setRisk] = useState({ ...RISK_DEFAULTS, ...riskSettings });
  const [defaultPair, setDefaultPair] = useState(() => lsGet('defaultPair', 'BTC-USD'));
  const [defaultTimeframe, setDefaultTimeframe] = useState(() => lsGet('defaultTimeframe', 'ONE_HOUR'));
  const [soundEnabled, setSoundEnabled] = useState(() => lsGet('soundEnabled', true));
  const [aiProvider, setAiProvider] = useState(() => lsGet('aiProvider', 'claude'));
  const [aiApiKey, setAiApiKey] = useState(() => lsGet('aiApiKey', ''));
  const [aiModel, setAiModel] = useState(() => lsGet('aiModel', 'claude-sonnet-4-20250514'));
  const [testResult, setTestResult] = useState('');
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  /* Sync risk from store if it changes externally */
  useEffect(() => {
    setRisk({ ...RISK_DEFAULTS, ...riskSettings });
  }, [riskSettings]);

  /* ---- Test connection ------------------------------------- */
  const handleTestConnection = useCallback(async () => {
    if (!apiKey.trim() && !apiSecret.trim()) {
      setTestResult('No API credentials entered. Testing server-side .env config...');
    } else {
      setTestResult('Testing...');
    }
    try {
      await coinbaseREST.getAccounts();
      if (!apiKey.trim() && !apiSecret.trim()) {
        setTestResult('Server .env connected (credentials not set in UI)');
      } else {
        setTestResult('Connected successfully!');
      }
    } catch (err) {
      setTestResult(`Failed: ${err.message}`);
    }
  }, [apiKey, apiSecret]);

  /* ---- Reset paper portfolio ------------------------------- */
  const handleResetPaper = useCallback(() => {
    if (!showResetConfirm) {
      setShowResetConfirm(true);
      return;
    }
    const bal = parseFloat(paperBalance) || 25000;
    updatePaperPortfolio({
      balance: bal,
      positions: [],
      trades: [],
      startingBalance: bal,
    });
    setShowResetConfirm(false);
    addToast({ type: 'info', message: 'Paper portfolio reset' });
  }, [showResetConfirm, paperBalance, updatePaperPortfolio, addToast]);

  /* ---- Save all settings ---------------------------------- */
  const handleSave = useCallback(() => {
    lsSave('cb_api_key', apiKey);
    lsSave('cb_api_secret', apiSecret);
    setRiskSettings(risk);
    lsSave('defaultPair', defaultPair);
    lsSave('defaultTimeframe', defaultTimeframe);
    lsSave('soundEnabled', soundEnabled);
    lsSave('aiProvider', aiProvider);
    lsSave('aiApiKey', aiApiKey);
    lsSave('aiModel', aiModel);
    // HYDRA settings are saved directly via setHydraSettings in the form
    // but also sync the entry threshold to the live engine
    useStore.getState().setHydraEntryThreshold(hydraSettings.entryThreshold || 80);
    addToast({ type: 'success', message: 'Settings saved' });
  }, [
    apiKey, apiSecret, risk, defaultPair, defaultTimeframe,
    soundEnabled, aiProvider, aiApiKey, aiModel, setRiskSettings, addToast,
    hydraSettings,
  ]);

  /* ---- Risk field helper ---------------------------------- */
  const riskField = (label, key, step = 1) => (
    <div className="settings-field">
      <label className="settings-field-label">{label}</label>
      <input
        className="settings-field-input"
        type="number"
        step={step}
        value={risk[key] ?? ''}
        onChange={(e) => setRisk({ ...risk, [key]: parseFloat(e.target.value) || 0 })}
      />
    </div>
  );

  /* ---- Clear cache ----------------------------------------- */
  const handleClearCache = useCallback(() => {
    try {
      const keys = ['candles', 'indicators', 'tickers'];
      keys.forEach((k) => localStorage.removeItem(k));
      addToast({ type: 'info', message: 'Cache cleared' });
    } catch { /* ignore */ }
  }, [addToast]);

  /* ---- Request notification permission -------------------- */
  const handleNotifPermission = useCallback(async () => {
    if ('Notification' in window) {
      const perm = await Notification.requestPermission();
      addToast({ type: 'info', message: `Notification permission: ${perm}` });
    }
  }, [addToast]);

  if (!settingsOpen) return null;

  return (
    <>
      <div className="settings-overlay" onClick={toggleSettings} />
      <div className="settings-panel">
        {/* Header */}
        <div className="settings-header">
          <span className="settings-title">Settings</span>
          <button className="settings-close-btn" onClick={toggleSettings}>&times;</button>
        </div>

        {/* Body */}
        <div className="settings-body">
          {/* Connection */}
          <div className="settings-section">
            <div className="settings-section-title">Connection</div>
            <p className="settings-hint">
              API credentials are loaded from the server-side <code>.env</code> file.
              These fields save to localStorage for reference only.
            </p>
            <div className="settings-field">
              <label className="settings-field-label">API Key</label>
              <input
                className="settings-field-input"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Configured in .env"
              />
            </div>
            <div className="settings-field">
              <label className="settings-field-label">API Secret</label>
              <input
                className="settings-field-input"
                type="password"
                value={apiSecret}
                onChange={(e) => setApiSecret(e.target.value)}
                placeholder="Configured in .env"
              />
            </div>
            <div className="settings-field-row">
              <button className="settings-btn success" onClick={handleTestConnection}>
                Test Connection
              </button>
              {testResult && (
                <span className="settings-test-result" style={{ color: testResult.includes('Failed') ? 'var(--bearish)' : 'var(--bullish)' }}>
                  {testResult}
                </span>
              )}
            </div>
            <div className="settings-ws-status">
              <span className={`settings-ws-dot ${wsStatus}`} />
              <span>WebSocket: {wsStatus}</span>
            </div>
          </div>

          {/* Paper Trading */}
          <div className="settings-section">
            <div className="settings-section-title">Paper Trading</div>
            <div className="settings-paper-balance">
              <span className="settings-paper-balance-label">Current Balance</span>
              <span className={`settings-paper-balance-value ${paperPortfolio.balance >= paperPortfolio.startingBalance ? 'bullish' : 'bearish'}`}>
                ${(paperPortfolio.balance || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span className="settings-paper-balance-sub">
                Starting: ${(paperPortfolio.startingBalance || 25000).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                {' | '}
                P&L: {((paperPortfolio.balance || 0) - (paperPortfolio.startingBalance || 25000)) >= 0 ? '+' : ''}
                ${((paperPortfolio.balance || 0) - (paperPortfolio.startingBalance || 25000)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            <div className="settings-field">
              <label className="settings-field-label">Reset Balance To (USD)</label>
              <input
                className="settings-field-input"
                type="number"
                value={paperBalance}
                onChange={(e) => setPaperBalance(e.target.value)}
              />
            </div>
            <div className="settings-field-row">
              <button className="settings-btn danger" onClick={handleResetPaper}>
                {showResetConfirm ? 'Confirm Reset' : 'Reset Paper Portfolio'}
              </button>
              {showResetConfirm && (
                <button className="settings-btn" onClick={() => setShowResetConfirm(false)}>Cancel</button>
              )}
            </div>
          </div>

          {/* HYDRA Settings */}
          <div className="settings-section">
            <div className="settings-section-title">HYDRA Strategy</div>
            <div className="settings-field">
              <label className="settings-field-label">Entry Score Threshold (65–95)</label>
              <input
                className="settings-field-input"
                type="number"
                min={65}
                max={95}
                step={1}
                value={hydraSettings.entryThreshold}
                onChange={(e) => setHydraSettings({ ...hydraSettings, entryThreshold: parseInt(e.target.value) || 80 })}
              />
            </div>
            <div className="settings-field">
              <label className="settings-field-label">Risk Per Trade (% of portfolio)</label>
              <input
                className="settings-field-input"
                type="number"
                min={0.25}
                max={3}
                step={0.25}
                value={(hydraSettings.riskPerTrade * 100).toFixed(2)}
                onChange={(e) => setHydraSettings({ ...hydraSettings, riskPerTrade: (parseFloat(e.target.value) || 1) / 100 })}
              />
            </div>
            <div className="settings-field">
              <label className="settings-field-label">Max Position Size (% hard cap)</label>
              <input
                className="settings-field-input"
                type="number"
                min={2}
                max={15}
                step={1}
                value={(hydraSettings.maxPositionPct * 100).toFixed(0)}
                onChange={(e) => setHydraSettings({ ...hydraSettings, maxPositionPct: (parseFloat(e.target.value) || 8) / 100 })}
              />
            </div>
            <div className="settings-field">
              <label className="settings-field-label">Exit Score Threshold (20–60)</label>
              <input
                className="settings-field-input"
                type="number"
                min={20}
                max={60}
                step={5}
                value={hydraSettings.exitScoreThreshold}
                onChange={(e) => setHydraSettings({ ...hydraSettings, exitScoreThreshold: parseInt(e.target.value) || 40 })}
              />
            </div>
            <div className="settings-field">
              <label className="settings-field-label">Signal Expiry (seconds)</label>
              <input
                className="settings-field-input"
                type="number"
                min={5}
                max={60}
                step={5}
                value={hydraSettings.signalExpirySec}
                onChange={(e) => setHydraSettings({ ...hydraSettings, signalExpirySec: parseInt(e.target.value) || 20 })}
              />
            </div>
            <div className="settings-toggle-row">
              <span className="settings-toggle-label">Auto-Calibrate Threshold</span>
              <button
                className={`settings-toggle-btn ${hydraSettings.autoCalibrate ? 'on' : 'off'}`}
                onClick={() => setHydraSettings({ ...hydraSettings, autoCalibrate: !hydraSettings.autoCalibrate })}
              >
                <span className="settings-toggle-knob" />
              </button>
            </div>
            <div className="settings-field">
              <label className="settings-field-label">Consecutive Loss Pause (trades)</label>
              <input
                className="settings-field-input"
                type="number"
                min={1}
                max={5}
                step={1}
                value={hydraSettings.consecutiveLossPause}
                onChange={(e) => setHydraSettings({ ...hydraSettings, consecutiveLossPause: parseInt(e.target.value) || 3 })}
              />
            </div>
            <div className="settings-field">
              <label className="settings-field-label">Session Score Weight (0.5–2.0)</label>
              <input
                className="settings-field-input"
                type="number"
                min={0.5}
                max={2.0}
                step={0.1}
                value={hydraSettings.sessionWeight}
                onChange={(e) => setHydraSettings({ ...hydraSettings, sessionWeight: parseFloat(e.target.value) || 1.0 })}
              />
            </div>
          </div>

          {/* VIPER Strategy Settings */}
          <div className="settings-section">
            <div className="settings-section-title">VIPER Strategy</div>
            <div className="settings-toggle-row">
              <span className="settings-toggle-label">Enable VIPER</span>
              <button
                className={`settings-toggle-btn ${viperEnabled ? 'on' : 'off'}`}
                onClick={() => setViperEnabled(!viperEnabled)}
              >
                <span className="settings-toggle-knob" />
              </button>
            </div>
            <div className="settings-field">
              <label className="settings-field-label">Edge Detector Interval (min)</label>
              <input
                className="settings-field-input"
                type="number"
                min={5}
                max={60}
                step={5}
                value={viperSettings.edgeDetectorIntervalMin}
                onChange={(e) => setViperSettings({ edgeDetectorIntervalMin: parseInt(e.target.value) || 15 })}
              />
            </div>
            <div className="settings-field">
              <label className="settings-field-label">STRIKE Cooldown (sec)</label>
              <input
                className="settings-field-input"
                type="number"
                min={30}
                max={300}
                step={15}
                value={viperSettings.strikeCooldownSec}
                onChange={(e) => setViperSettings({ strikeCooldownSec: parseInt(e.target.value) || 90 })}
              />
            </div>
            <div className="settings-field">
              <label className="settings-field-label">STRIKE Max Consecutive Wins (pause trigger)</label>
              <input
                className="settings-field-input"
                type="number"
                min={2}
                max={10}
                step={1}
                value={viperSettings.strikeMaxConsecutiveWins}
                onChange={(e) => setViperSettings({ strikeMaxConsecutiveWins: parseInt(e.target.value) || 3 })}
              />
            </div>
            <div className="settings-field">
              <label className="settings-field-label">COIL Max Concurrent Positions</label>
              <input
                className="settings-field-input"
                type="number"
                min={1}
                max={4}
                step={1}
                value={viperSettings.coilMaxPositions}
                onChange={(e) => setViperSettings({ coilMaxPositions: parseInt(e.target.value) || 2 })}
              />
            </div>
            <div className="settings-field">
              <label className="settings-field-label">LUNGE Max Concurrent Positions</label>
              <input
                className="settings-field-input"
                type="number"
                min={1}
                max={2}
                step={1}
                value={viperSettings.lungeMaxPositions}
                onChange={(e) => setViperSettings({ lungeMaxPositions: parseInt(e.target.value) || 1 })}
              />
            </div>
            <div className="settings-toggle-row">
              <span className="settings-toggle-label">Ratchet System</span>
              <button
                className={`settings-toggle-btn ${viperSettings.ratchetEnabled ? 'on' : 'off'}`}
                onClick={() => setViperSettings({ ratchetEnabled: !viperSettings.ratchetEnabled })}
              >
                <span className="settings-toggle-knob" />
              </button>
            </div>
            <div className="settings-field">
              <label className="settings-field-label">Overnight Cutoff Hour (UTC)</label>
              <input
                className="settings-field-input"
                type="number"
                min={0}
                max={23}
                step={1}
                value={viperSettings.overnightCutoffHourUTC}
                onChange={(e) => setViperSettings({ overnightCutoffHourUTC: parseInt(e.target.value) || 5 })}
              />
            </div>
            <div className="settings-field">
              <label className="settings-field-label">Daily P&L Target (%)</label>
              <input
                className="settings-field-input"
                type="number"
                min={0.05}
                max={1.0}
                step={0.05}
                value={viperSettings.dailyPnLTarget}
                onChange={(e) => setViperSettings({ dailyPnLTarget: parseFloat(e.target.value) || 0.15 })}
              />
            </div>
            <div className="settings-field">
              <label className="settings-field-label">Max Daily Loss (%)</label>
              <input
                className="settings-field-input"
                type="number"
                min={0.1}
                max={2.0}
                step={0.1}
                value={viperSettings.maxDailyLossPct}
                onChange={(e) => setViperSettings({ maxDailyLossPct: parseFloat(e.target.value) || 0.5 })}
              />
            </div>
            <div className="settings-toggle-row">
              <span className="settings-toggle-label">Performance Ledger</span>
              <button
                className={`settings-toggle-btn ${viperSettings.performanceLedgerEnabled ? 'on' : 'off'}`}
                onClick={() => setViperSettings({ performanceLedgerEnabled: !viperSettings.performanceLedgerEnabled })}
              >
                <span className="settings-toggle-knob" />
              </button>
            </div>
          </div>

          {/* Multi-Pair Scanner */}
          <div className="settings-section">
            <div className="settings-section-title">Multi-Pair Scanner</div>
            <p className="settings-hint">
              Scans top pairs simultaneously for HYDRA and VIPER trade opportunities on 1m candles.
            </p>
            <div className="settings-toggle-row">
              <span className="settings-toggle-label">Scanner Enabled</span>
              <button
                className={`settings-toggle-btn ${scannerEnabled ? 'on' : 'off'}`}
                onClick={() => setScannerEnabled(!scannerEnabled)}
              >
                <span className="settings-toggle-knob" />
              </button>
            </div>
            <div className="settings-field">
              <label className="settings-field-label">Scanner Pairs (max 5)</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                {DEFAULT_PAIRS.slice(0, 10).map((pair) => {
                  const isSelected = scannerPairs.includes(pair);
                  const isDisabled = !isSelected && scannerPairs.length >= 5;
                  return (
                    <button
                      key={pair}
                      className={`settings-btn ${isSelected ? 'success' : ''}`}
                      style={{
                        padding: '3px 8px',
                        fontSize: 11,
                        opacity: isDisabled ? 0.4 : 1,
                        cursor: isDisabled ? 'not-allowed' : 'pointer',
                      }}
                      disabled={isDisabled}
                      onClick={() => {
                        if (isSelected) {
                          setScannerPairs(scannerPairs.filter((p) => p !== pair));
                        } else if (scannerPairs.length < 5) {
                          setScannerPairs([...scannerPairs, pair]);
                        }
                      }}
                    >
                      {pair.replace('-USD', '')}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="settings-field">
              <label className="settings-field-label">Max Concurrent Positions (1–5)</label>
              <input
                className="settings-field-input"
                type="number"
                min={1}
                max={5}
                step={1}
                value={maxConcurrentPositions}
                onChange={(e) => setMaxConcurrentPositions(Math.max(1, Math.min(5, parseInt(e.target.value) || 3)))}
              />
            </div>
            <div className="settings-field">
              <label className="settings-field-label">HYDRA Daily Loss Limit (% of portfolio, negative)</label>
              <input
                className="settings-field-input"
                type="number"
                min={-5}
                max={-0.5}
                step={0.5}
                value={hydraDailyLossLimit}
                onChange={(e) => setHydraDailyLossLimit(parseFloat(e.target.value) || -1.5)}
              />
            </div>
            <p className="settings-hint" style={{ marginTop: 4, fontSize: 10 }}>
              Refresh: 30s REST poll + real-time WebSocket. Pairs skip below $5M daily volume.
            </p>
          </div>

          {/* Capital Allocation */}
          <div className="settings-section">
            <div className="settings-section-title">Capital Allocation</div>
            <p className="settings-hint">
              Split capital between HYDRA and VIPER. Auto-adjusts based on VIPER threat level.
            </p>
            <div className="settings-field">
              <label className="settings-field-label">
                HYDRA: {allocationConfig.hydra}% / VIPER: {allocationConfig.viper}%
              </label>
              <input
                className="settings-field-input"
                type="range"
                min={30}
                max={90}
                step={5}
                value={allocationConfig.hydra}
                onChange={(e) => {
                  const hydra = parseInt(e.target.value);
                  setAllocationConfig({ hydra, viper: 100 - hydra });
                }}
                style={{ width: '100%' }}
              />
            </div>
          </div>

          {/* Risk Defaults */}
          <div className="settings-section">
            <div className="settings-section-title">Risk Defaults</div>
            {riskField('Max Positions', 'maxPositions', 1)}
            {riskField('Max Daily Loss (USD)', 'maxDailyLossUSD', 50)}
            {riskField('Max Trades/Day', 'maxTradesPerDay', 1)}
            {riskField('Pair Cooldown (min)', 'pairCooldownMinutes', 1)}
          </div>

          {/* Display */}
          <div className="settings-section">
            <div className="settings-section-title">Display</div>
            <div className="settings-field">
              <label className="settings-field-label">Default Pair</label>
              <select
                className="settings-field-select"
                value={defaultPair}
                onChange={(e) => setDefaultPair(e.target.value)}
              >
                {DEFAULT_PAIRS.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <div className="settings-field">
              <label className="settings-field-label">Default Timeframe</label>
              <select
                className="settings-field-select"
                value={defaultTimeframe}
                onChange={(e) => setDefaultTimeframe(e.target.value)}
              >
                {TIMEFRAMES.map((tf) => (
                  <option key={tf.value} value={tf.value}>{tf.label}</option>
                ))}
              </select>
            </div>
            <div className="settings-toggle-row">
              <span className="settings-toggle-label">Sound Effects</span>
              <button
                className={`settings-toggle-btn ${soundEnabled ? 'on' : 'off'}`}
                onClick={() => setSoundEnabled(!soundEnabled)}
              >
                <span className="settings-toggle-knob" />
              </button>
            </div>
            <button className="settings-btn" onClick={handleNotifPermission}>
              Request Notification Permission
            </button>
          </div>

          {/* AI Assistant */}
          <div className="settings-section">
            <div className="settings-section-title">AI Assistant</div>
            <div className="settings-field">
              <label className="settings-field-label">Provider</label>
              <select
                className="settings-field-select"
                value={aiProvider}
                onChange={(e) => setAiProvider(e.target.value)}
              >
                <option value="claude">Claude (Anthropic)</option>
                <option value="openai">OpenAI</option>
              </select>
            </div>
            <div className="settings-field">
              <label className="settings-field-label">API Key</label>
              <input
                className="settings-field-input"
                type="password"
                value={aiApiKey}
                onChange={(e) => setAiApiKey(e.target.value)}
                placeholder="Enter AI API key"
              />
            </div>
            <div className="settings-field">
              <label className="settings-field-label">Model</label>
              <select
                className="settings-field-select"
                value={aiModel}
                onChange={(e) => setAiModel(e.target.value)}
              >
                {aiProvider === 'claude' ? (
                  <>
                    <option value="claude-sonnet-4-20250514">Claude Sonnet 4</option>
                    <option value="claude-opus-4-20250514">Claude Opus 4</option>
                    <option value="claude-3-5-haiku-20241022">Claude 3.5 Haiku</option>
                  </>
                ) : (
                  <>
                    <option value="gpt-4o">GPT-4o</option>
                    <option value="gpt-4o-mini">GPT-4o Mini</option>
                    <option value="gpt-4-turbo">GPT-4 Turbo</option>
                  </>
                )}
              </select>
            </div>
          </div>

          {/* Data Management */}
          <div className="settings-section">
            <div className="settings-section-title">Data Management</div>
            <div className="settings-field-row" style={{ gap: 8 }}>
              <button className="settings-btn" onClick={handleClearCache}>Clear Cache</button>
              <button className="settings-btn" onClick={() => {
                const all = {
                  riskSettings: risk,
                  paperPortfolio,
                  trades: paperPortfolio.trades || [],
                };
                const blob = new Blob([JSON.stringify(all, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'cerebro-export.json';
                a.click();
                URL.revokeObjectURL(url);
              }}>
                Export Data
              </button>
              <button className="settings-btn danger" onClick={() => {
                if (window.confirm('Reset all settings to defaults? This cannot be undone.')) {
                  localStorage.clear();
                  window.location.reload();
                }
              }}>
                Reset All
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="settings-footer">
          <button className="settings-save-btn" onClick={handleSave}>
            Save Settings
          </button>
        </div>
      </div>
    </>
  );
}
