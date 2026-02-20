import { useState, useMemo, useCallback } from 'react';
import useStore from '../../store';
import { DEFAULT_PAIRS } from '../../config/constants';
import { formatTimestamp } from '../../utils/formatters';
import './AlertManager.css';

/* ============================================================
   AlertManager — Alert Management Panel (Slide-up Modal)
   ============================================================ */

const ALERT_TYPES = [
  { value: 'price_above', label: 'Price Above' },
  { value: 'price_below', label: 'Price Below' },
  { value: 'rsi_overbought', label: 'RSI Overbought (>70)' },
  { value: 'rsi_oversold', label: 'RSI Oversold (<30)' },
  { value: 'macd_cross_up', label: 'MACD Bullish Cross' },
  { value: 'macd_cross_down', label: 'MACD Bearish Cross' },
  { value: 'regime_change', label: 'Regime Change' },
];

const ALERT_CATEGORIES = {
  price_above: 'price',
  price_below: 'price',
  rsi_overbought: 'indicator',
  rsi_oversold: 'indicator',
  macd_cross_up: 'indicator',
  macd_cross_down: 'indicator',
  regime_change: 'strategy',
};

export default function AlertManager() {
  const alerts = useStore((s) => s.alerts);
  const alertLog = useStore((s) => s.alertLog);
  const addAlert = useStore((s) => s.addAlert);
  const addToast = useStore((s) => s.addToast);

  /* ---- Form state ----------------------------------------- */
  const [pair, setPair] = useState('BTC-USD');
  const [alertType, setAlertType] = useState('price_above');
  const [value, setValue] = useState('');

  /* ---- Needs value input? --------------------------------- */
  const needsValue = useMemo(() => {
    return ['price_above', 'price_below'].includes(alertType);
  }, [alertType]);

  /* ---- Create alert --------------------------------------- */
  const handleCreate = useCallback(() => {
    if (needsValue && (!value || isNaN(parseFloat(value)))) {
      addToast({ type: 'warning', message: 'Please enter a valid value for this alert' });
      return;
    }

    const alert = {
      id: `alert-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      pair,
      type: alertType,
      category: ALERT_CATEGORIES[alertType] || 'price',
      condition: ALERT_TYPES.find((t) => t.value === alertType)?.label || alertType,
      value: needsValue ? parseFloat(value) : null,
      active: true,
      createdAt: new Date().toISOString(),
    };

    addAlert(alert);
    setValue('');
    addToast({ type: 'success', message: `Alert created: ${alert.condition} for ${pair}` });
  }, [pair, alertType, value, needsValue, addAlert, addToast]);

  /* ---- Delete alert --------------------------------------- */
  const handleDelete = useCallback((id) => {
    useStore.setState((s) => ({
      alerts: s.alerts.filter((a) => a.id !== id),
    }));
  }, []);

  /* ---- Toggle alert --------------------------------------- */
  const handleToggle = useCallback((id) => {
    useStore.setState((s) => ({
      alerts: s.alerts.map((a) =>
        a.id === id ? { ...a, active: !a.active } : a
      ),
    }));
  }, []);

  return (
    <div className="alertmanager-container">
      <h2 className="alertmanager-title">Alert Manager</h2>

      {/* Create alert form */}
      <div className="alertmanager-form">
        <div className="alertmanager-field">
          <label className="alertmanager-field-label">Pair</label>
          <select
            className="alertmanager-field-select"
            value={pair}
            onChange={(e) => setPair(e.target.value)}
          >
            {DEFAULT_PAIRS.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>

        <div className="alertmanager-field">
          <label className="alertmanager-field-label">Alert Type</label>
          <select
            className="alertmanager-field-select"
            value={alertType}
            onChange={(e) => setAlertType(e.target.value)}
          >
            {ALERT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>

        {needsValue && (
          <div className="alertmanager-field">
            <label className="alertmanager-field-label">Value (USD)</label>
            <input
              className="alertmanager-field-input"
              type="number"
              step="any"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="e.g. 50000"
            />
          </div>
        )}

        <button className="alertmanager-create-btn" onClick={handleCreate}>
          Create Alert
        </button>
      </div>

      {/* Active alerts */}
      <div>
        <h3 className="alertmanager-section-title">
          Active Alerts ({alerts.length})
        </h3>
        {alerts.length === 0 ? (
          <div className="alertmanager-empty">No alerts configured</div>
        ) : (
          <table className="alertmanager-table">
            <thead>
              <tr>
                <th>Pair</th>
                <th>Condition</th>
                <th>Value</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {alerts.map((alert) => (
                <tr key={alert.id}>
                  <td style={{ fontWeight: 600 }}>{alert.pair}</td>
                  <td>{alert.condition}</td>
                  <td style={{ fontFamily: "'Courier New', monospace" }}>
                    {alert.value != null ? `$${alert.value.toLocaleString()}` : '--'}
                  </td>
                  <td>
                    <span className={`alertmanager-status ${alert.active ? 'active' : 'inactive'}`}>
                      {alert.active ? 'Active' : 'Paused'}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button
                        className="alertmanager-action-btn toggle"
                        onClick={() => handleToggle(alert.id)}
                      >
                        {alert.active ? 'Pause' : 'Resume'}
                      </button>
                      <button
                        className="alertmanager-action-btn delete"
                        onClick={() => handleDelete(alert.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Alert history */}
      <div>
        <h3 className="alertmanager-section-title">
          Alert History ({alertLog.length})
        </h3>
        {alertLog.length === 0 ? (
          <div className="alertmanager-empty">No alerts triggered yet</div>
        ) : (
          <div className="alertmanager-history">
            {alertLog.map((entry, i) => (
              <div key={entry.id || i} className="alertmanager-history-row">
                <span className="alertmanager-history-time">
                  {formatTimestamp(entry.timestamp)}
                </span>
                <span className="alertmanager-history-pair">{entry.pair}</span>
                <span className={`alertmanager-history-type ${entry.category || 'price'}`}>
                  {entry.category || 'price'}
                </span>
                <span className="alertmanager-history-message">{entry.message || entry.condition}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
