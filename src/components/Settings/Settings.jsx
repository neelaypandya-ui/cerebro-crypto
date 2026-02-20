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
    setTestResult('Testing...');
    try {
      await coinbaseREST.getAccounts();
      setTestResult('Connected successfully!');
    } catch (err) {
      setTestResult(`Failed: ${err.message}`);
    }
  }, []);

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
    addToast({ type: 'success', message: 'Settings saved' });
  }, [
    apiKey, apiSecret, risk, defaultPair, defaultTimeframe,
    soundEnabled, aiProvider, aiApiKey, aiModel, setRiskSettings, addToast,
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
            <div className="settings-field">
              <label className="settings-field-label">API Key</label>
              <input
                className="settings-field-input"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Enter API key"
              />
            </div>
            <div className="settings-field">
              <label className="settings-field-label">API Secret</label>
              <input
                className="settings-field-input"
                type="password"
                value={apiSecret}
                onChange={(e) => setApiSecret(e.target.value)}
                placeholder="Enter API secret"
              />
            </div>
            <div className="settings-field-row">
              <button className="settings-btn success" onClick={handleTestConnection}>
                Test Connection
              </button>
              {testResult && (
                <span style={{ fontSize: 11, color: testResult.includes('success') ? 'var(--bullish)' : 'var(--bearish)' }}>
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
            <div className="settings-field">
              <label className="settings-field-label">Starting Balance (USD)</label>
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

          {/* Trading Defaults (Risk) */}
          <div className="settings-section">
            <div className="settings-section-title">Trading Defaults</div>
            {riskField('Position Size (%)', 'positionSizePct', 0.5)}
            <div className="settings-field">
              <label className="settings-field-label">Stop-Loss Method</label>
              <select
                className="settings-field-select"
                value={risk.stopLossMethod}
                onChange={(e) => setRisk({ ...risk, stopLossMethod: e.target.value })}
              >
                <option value="percentage">Percentage</option>
                <option value="atr">ATR-based</option>
              </select>
            </div>
            {riskField('Stop-Loss (%)', 'stopLossPct', 0.1)}
            {riskField('TP1 (R-multiple)', 'tp1R', 0.1)}
            {riskField('TP2 (R-multiple)', 'tp2R', 0.1)}
            {riskField('Trailing Stop (ATR)', 'trailingStopATR', 0.1)}
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
