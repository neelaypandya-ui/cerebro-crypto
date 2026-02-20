import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import useStore from '../../store';
import { DEFAULT_PAIRS, TIMEFRAMES, STRATEGIES, COLORS, RISK_DEFAULTS } from '../../config/constants';
import { formatUSD, formatPercent, formatDuration, formatPrice, formatDate } from '../../utils/formatters';
import './Backtest.css';

/* ============================================================
   Backtest — Backtesting Panel (Slide-up Modal)
   ============================================================ */

export default function Backtest() {
  const riskSettings = useStore((s) => s.riskSettings);

  /* ---- Form state ----------------------------------------- */
  const [pair, setPair] = useState('BTC-USD');
  const [timeframe, setTimeframe] = useState('ONE_HOUR');
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 3);
    return d.toISOString().slice(0, 10);
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [strategy, setStrategy] = useState(STRATEGIES.MOMENTUM);
  const [startingCapital, setStartingCapital] = useState('25000');
  const [riskOverrides, setRiskOverrides] = useState({ ...RISK_DEFAULTS, ...riskSettings });

  /* ---- Results state -------------------------------------- */
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState(null);

  /* ---- Chart ref ------------------------------------------ */
  const chartContainerRef = useRef(null);

  /* ---- Run backtest --------------------------------------- */
  const handleRun = useCallback(async () => {
    setRunning(true);
    setProgress(0);
    setResults(null);

    /* Simulate backtest execution with progress */
    const steps = 20;
    for (let i = 1; i <= steps; i++) {
      await new Promise((r) => setTimeout(r, 100));
      setProgress((i / steps) * 100);
    }

    /* Generate simulated backtest results */
    const capital = parseFloat(startingCapital) || 25000;
    const totalTrades = Math.floor(Math.random() * 50) + 20;
    const winRate = 0.45 + Math.random() * 0.25;
    const winners = Math.round(totalTrades * winRate);
    const losers = totalTrades - winners;

    const avgWin = capital * 0.02 * (0.5 + Math.random());
    const avgLoss = capital * 0.012 * (0.5 + Math.random());
    const totalReturn = (winners * avgWin) - (losers * avgLoss);
    const maxDrawdown = -(capital * (0.05 + Math.random() * 0.1));
    const profitFactor = losers > 0 ? (winners * avgWin) / (losers * avgLoss) : Infinity;
    const sharpe = (totalReturn / capital) / (0.1 + Math.random() * 0.15);
    const avgDuration = (3600000 * 2) + Math.random() * 3600000 * 24;

    /* Generate equity curve */
    const equityCurve = [];
    let equity = capital;
    const startTs = new Date(startDate).getTime() / 1000;
    const endTs = new Date(endDate).getTime() / 1000;
    const interval = (endTs - startTs) / totalTrades;

    for (let i = 0; i <= totalTrades; i++) {
      equityCurve.push({
        time: Math.floor(startTs + i * interval),
        value: equity,
      });
      const isWin = Math.random() < winRate;
      equity += isWin ? avgWin * (0.5 + Math.random()) : -avgLoss * (0.5 + Math.random());
      equity = Math.max(equity, capital * 0.5);
    }

    /* Generate trade log */
    const trades = [];
    let runningEquity = capital;
    for (let i = 0; i < totalTrades; i++) {
      const isWin = Math.random() < winRate;
      const pnl = isWin ? avgWin * (0.5 + Math.random()) : -avgLoss * (0.5 + Math.random());
      runningEquity += pnl;

      const entryT = startTs + i * interval;
      const dur = avgDuration * (0.3 + Math.random() * 1.5);
      const entryPrice = 30000 + Math.random() * 70000;
      const exitPrice = entryPrice * (1 + (isWin ? 0.02 : -0.012) * (0.5 + Math.random()));

      trades.push({
        id: i + 1,
        pair,
        strategy,
        entryPrice,
        exitPrice,
        pnl,
        entryTime: new Date(entryT * 1000).toISOString(),
        exitTime: new Date((entryT + dur / 1000) * 1000).toISOString(),
        duration: dur,
      });
    }

    setResults({
      totalReturn,
      totalReturnPct: totalReturn / capital,
      maxDrawdown,
      maxDrawdownPct: maxDrawdown / capital,
      winRate,
      profitFactor,
      sharpe,
      totalTrades,
      avgDuration,
      equityCurve,
      trades,
    });

    setRunning(false);
  }, [pair, strategy, startDate, endDate, startingCapital]);

  /* ---- Render equity curve on canvas ----------------------- */
  useEffect(() => {
    if (!results || !chartContainerRef.current) return;

    const drawEquityCurve = () => {
      const container = chartContainerRef.current;
      if (!container) return;

      let canvas = container.querySelector('canvas');
      if (!canvas) {
        canvas = document.createElement('canvas');
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        container.appendChild(canvas);
      }

      const dpr = window.devicePixelRatio || 1;
      const rect = container.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = rect.width + 'px';
      canvas.style.height = rect.height + 'px';

      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.scale(dpr, dpr);

      const W = rect.width;
      const H = rect.height;
      const pad = { top: 10, right: 60, bottom: 24, left: 10 };
      const cW = W - pad.left - pad.right;
      const cH = H - pad.top - pad.bottom;
      const curve = results.equityCurve;

      if (curve.length < 2) { ctx.restore(); return; }

      let minV = Infinity, maxV = -Infinity;
      for (const pt of curve) {
        if (pt.value < minV) minV = pt.value;
        if (pt.value > maxV) maxV = pt.value;
      }
      const range = maxV - minV || 1;
      const padV = range * 0.05;
      minV -= padV;
      maxV += padV;
      const finalRange = maxV - minV;

      // Grid
      ctx.strokeStyle = 'rgba(30,30,46,0.3)';
      ctx.lineWidth = 0.5;
      for (let i = 0; i <= 4; i++) {
        const y = pad.top + cH * (i / 4);
        ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left + cW, y); ctx.stroke();
      }

      // Equity line
      ctx.strokeStyle = COLORS.accent;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < curve.length; i++) {
        const x = pad.left + (i / (curve.length - 1)) * cW;
        const y = pad.top + cH * (1 - (curve[i].value - minV) / finalRange);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Fill under line
      const lastX = pad.left + cW;
      const baseY = pad.top + cH;
      ctx.lineTo(lastX, baseY);
      ctx.lineTo(pad.left, baseY);
      ctx.closePath();
      ctx.fillStyle = 'rgba(108, 99, 255, 0.08)';
      ctx.fill();

      // Axis labels
      ctx.fillStyle = COLORS.textSecondary;
      ctx.font = '9px monospace';
      ctx.textAlign = 'left';
      for (let i = 0; i <= 4; i++) {
        const y = pad.top + cH * (i / 4);
        const val = maxV - (i / 4) * finalRange;
        ctx.fillText(formatUSD(val), pad.left + cW + 4, y + 3);
      }

      ctx.restore();
    };

    drawEquityCurve();
    const ro = new ResizeObserver(drawEquityCurve);
    ro.observe(chartContainerRef.current);

    return () => ro.disconnect();
  }, [results]);

  /* ---- Export handlers ------------------------------------- */
  const exportCSV = useCallback(() => {
    if (!results) return;
    const headers = 'Trade,Pair,Strategy,Entry Price,Exit Price,P&L,Duration,Entry Time,Exit Time\n';
    const rows = results.trades.map((t) =>
      `${t.id},${t.pair},${t.strategy},${t.entryPrice.toFixed(2)},${t.exitPrice.toFixed(2)},${t.pnl.toFixed(2)},${formatDuration(t.duration)},${t.entryTime},${t.exitTime}`
    ).join('\n');
    const blob = new Blob([headers + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backtest-${pair}-${strategy}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [results, pair, strategy]);

  const exportJSON = useCallback(() => {
    if (!results) return;
    const blob = new Blob([JSON.stringify(results, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backtest-${pair}-${strategy}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [results, pair, strategy]);

  return (
    <div className="backtest-container">
      <h2 className="backtest-title">Backtesting</h2>

      {/* Input form */}
      <div className="backtest-form">
        <div className="backtest-field">
          <label className="backtest-field-label">Pair</label>
          <select className="backtest-field-select" value={pair} onChange={(e) => setPair(e.target.value)}>
            {DEFAULT_PAIRS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>

        <div className="backtest-field">
          <label className="backtest-field-label">Timeframe</label>
          <select className="backtest-field-select" value={timeframe} onChange={(e) => setTimeframe(e.target.value)}>
            {TIMEFRAMES.map((tf) => <option key={tf.value} value={tf.value}>{tf.label}</option>)}
          </select>
        </div>

        <div className="backtest-field">
          <label className="backtest-field-label">Start Date</label>
          <input className="backtest-field-input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>

        <div className="backtest-field">
          <label className="backtest-field-label">End Date</label>
          <input className="backtest-field-input" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>

        <div className="backtest-field">
          <label className="backtest-field-label">Strategy</label>
          <select className="backtest-field-select" value={strategy} onChange={(e) => setStrategy(e.target.value)}>
            {Object.entries(STRATEGIES).map(([key, val]) => (
              <option key={val} value={val}>{key.replace(/_/g, ' ')}</option>
            ))}
          </select>
        </div>

        <div className="backtest-field">
          <label className="backtest-field-label">Starting Capital</label>
          <input
            className="backtest-field-input"
            type="number"
            value={startingCapital}
            onChange={(e) => setStartingCapital(e.target.value)}
          />
        </div>

        <div className="backtest-field">
          <label className="backtest-field-label">Position Size %</label>
          <input
            className="backtest-field-input"
            type="number"
            step="0.5"
            value={riskOverrides.positionSizePct}
            onChange={(e) => setRiskOverrides({ ...riskOverrides, positionSizePct: parseFloat(e.target.value) || 5 })}
          />
        </div>

        <div className="backtest-field">
          <label className="backtest-field-label">Stop-Loss %</label>
          <input
            className="backtest-field-input"
            type="number"
            step="0.1"
            value={riskOverrides.stopLossPct}
            onChange={(e) => setRiskOverrides({ ...riskOverrides, stopLossPct: parseFloat(e.target.value) || 2 })}
          />
        </div>

        <button
          className="backtest-run-btn"
          onClick={handleRun}
          disabled={running}
        >
          {running ? 'Running...' : 'Run Backtest'}
        </button>
      </div>

      {/* Loading */}
      {running && (
        <div className="backtest-loading">
          <div className="backtest-loading-text">Running backtest...</div>
          <div className="backtest-progress-bar">
            <div className="backtest-progress-fill" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      {/* Results */}
      {results && (
        <div className="backtest-results">
          <div className="backtest-results-title">Results</div>

          {/* Stats grid */}
          <div className="backtest-stats">
            <div className="backtest-stat-card">
              <div className="backtest-stat-label">Total Return</div>
              <div className={`backtest-stat-value ${results.totalReturn >= 0 ? 'positive' : 'negative'}`}>
                {formatUSD(results.totalReturn)}
              </div>
            </div>
            <div className="backtest-stat-card">
              <div className="backtest-stat-label">Return %</div>
              <div className={`backtest-stat-value ${results.totalReturnPct >= 0 ? 'positive' : 'negative'}`}>
                {formatPercent(results.totalReturnPct)}
              </div>
            </div>
            <div className="backtest-stat-card">
              <div className="backtest-stat-label">Max Drawdown</div>
              <div className="backtest-stat-value negative">
                {formatUSD(results.maxDrawdown)}
              </div>
            </div>
            <div className="backtest-stat-card">
              <div className="backtest-stat-label">Win Rate</div>
              <div className="backtest-stat-value">
                {(results.winRate * 100).toFixed(1)}%
              </div>
            </div>
            <div className="backtest-stat-card">
              <div className="backtest-stat-label">Profit Factor</div>
              <div className={`backtest-stat-value ${results.profitFactor >= 1 ? 'positive' : 'negative'}`}>
                {results.profitFactor === Infinity ? 'Inf' : results.profitFactor.toFixed(2)}
              </div>
            </div>
            <div className="backtest-stat-card">
              <div className="backtest-stat-label">Sharpe Ratio</div>
              <div className="backtest-stat-value">
                {results.sharpe.toFixed(2)}
              </div>
            </div>
            <div className="backtest-stat-card">
              <div className="backtest-stat-label">Total Trades</div>
              <div className="backtest-stat-value">{results.totalTrades}</div>
            </div>
            <div className="backtest-stat-card">
              <div className="backtest-stat-label">Avg Duration</div>
              <div className="backtest-stat-value">{formatDuration(results.avgDuration)}</div>
            </div>
          </div>

          {/* Equity curve */}
          <div className="backtest-chart" ref={chartContainerRef} />

          {/* Trade log table */}
          <div className="backtest-trades-title">Trade Log</div>
          <div className="backtest-trades-table">
            <table style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Pair</th>
                  <th>Entry</th>
                  <th>Exit</th>
                  <th>P&L</th>
                  <th>Duration</th>
                </tr>
              </thead>
              <tbody>
                {results.trades.slice(0, 50).map((t) => (
                  <tr key={t.id}>
                    <td>{t.id}</td>
                    <td>{t.pair}</td>
                    <td>{formatPrice(t.entryPrice, t.pair)}</td>
                    <td>{formatPrice(t.exitPrice, t.pair)}</td>
                    <td style={{ color: t.pnl >= 0 ? COLORS.bullish : COLORS.bearish, fontWeight: 600 }}>
                      {t.pnl >= 0 ? '+' : ''}{formatUSD(t.pnl)}
                    </td>
                    <td>{formatDuration(t.duration)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Export */}
          <div className="backtest-export-btns">
            <button className="backtest-export-btn" onClick={exportCSV}>Export CSV</button>
            <button className="backtest-export-btn" onClick={exportJSON}>Export JSON</button>
          </div>
        </div>
      )}
    </div>
  );
}
