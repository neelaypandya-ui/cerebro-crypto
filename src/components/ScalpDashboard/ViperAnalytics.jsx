/* ============================================================
   ViperAnalytics — VIPER Performance Analytics Tab
   ============================================================
   Mode distribution, per-mode win rate, replacement risk gauge,
   and VIPER verdict summary.
   ============================================================ */

import useStore from '../../store';
import ThreatBadge from '../ViperControls/ThreatBadge';

const MODE_COLORS = {
  STRIKE: '#ff8c00',
  COIL:   '#00bcd4',
  LUNGE:  '#9c27b0',
};

export default function ViperAnalytics() {
  const viperPerformanceLedger = useStore((s) => s.viperPerformanceLedger);
  const viperReplacementThreat = useStore((s) => s.viperReplacementThreat);
  const viperDailyPnL = useStore((s) => s.viperDailyPnL);
  const viperDailyTrades = useStore((s) => s.viperDailyTrades);
  const viperActivity = useStore((s) => s.viperActivity);
  const viperActiveMode = useStore((s) => s.viperActiveMode);

  // Calculate mode distribution from ledger
  const modeDistribution = { STRIKE: 0, COIL: 0, LUNGE: 0 };
  for (const day of viperPerformanceLedger) {
    if (day.dominantMode && modeDistribution[day.dominantMode] != null) {
      modeDistribution[day.dominantMode]++;
    }
  }
  const totalDays = viperPerformanceLedger.length || 1;

  // Calculate per-mode stats from activity log (approximate from recent activity)
  const modeTrades = { STRIKE: { wins: 0, losses: 0, pnl: 0 }, COIL: { wins: 0, losses: 0, pnl: 0 }, LUNGE: { wins: 0, losses: 0, pnl: 0 } };
  for (const entry of viperActivity) {
    const msg = entry.message || '';
    if (msg.includes('trade closed')) {
      const mode = msg.startsWith('STRIKE') ? 'STRIKE' : msg.startsWith('COIL') ? 'COIL' : msg.startsWith('LUNGE') ? 'LUNGE' : null;
      if (mode) {
        const pnlMatch = msg.match(/([+-]?\$[\d.]+)/);
        const pnlValue = pnlMatch ? parseFloat(pnlMatch[1].replace('$', '')) : 0;
        if (pnlValue > 0) {
          modeTrades[mode].wins++;
          modeTrades[mode].pnl += pnlValue;
        } else {
          modeTrades[mode].losses++;
          modeTrades[mode].pnl += pnlValue;
        }
      }
    }
  }

  // Verdict
  const getVerdict = () => {
    if (viperPerformanceLedger.length === 0) return 'Insufficient data — VIPER needs more trading days to evaluate.';

    const recent5 = viperPerformanceLedger.slice(0, 5);
    const avgPnl = recent5.reduce((s, d) => s + (d.pnlPct || 0), 0) / recent5.length;
    const benchmarkDays = recent5.filter(d => d.metBenchmark).length;

    if (viperReplacementThreat === 'DOMINANT') {
      return `VIPER is outperforming. ${benchmarkDays}/5 recent days met benchmark. Avg: +${avgPnl.toFixed(2)}%.`;
    }
    if (viperReplacementThreat === 'CRITICAL') {
      return `VIPER is underperforming critically. Capital reduced to 13%. Consider reviewing mode parameters.`;
    }
    if (viperReplacementThreat === 'WARNING') {
      return `VIPER performance is below target. Capital reduced to 25%. Monitor closely.`;
    }
    return `VIPER is performing within normal range. Avg recent: ${avgPnl >= 0 ? '+' : ''}${avgPnl.toFixed(2)}%.`;
  };

  return (
    <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Mode Distribution */}
      <div>
        <div style={{ fontSize: '11px', fontWeight: 600, color: '#8888aa', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
          Mode Distribution ({totalDays} days)
        </div>
        <div style={{ display: 'flex', gap: '4px', height: '24px' }}>
          {Object.entries(modeDistribution).map(([mode, count]) => {
            const pct = (count / totalDays) * 100;
            return (
              <div
                key={mode}
                style={{
                  flex: Math.max(pct, 5),
                  background: MODE_COLORS[mode],
                  borderRadius: '3px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '9px',
                  fontWeight: 700,
                  color: '#fff',
                  opacity: pct > 0 ? 1 : 0.2,
                }}
                title={`${mode}: ${count} days (${pct.toFixed(0)}%)`}
              >
                {pct >= 15 ? `${mode} ${pct.toFixed(0)}%` : ''}
              </div>
            );
          })}
        </div>
      </div>

      {/* Per-mode Win Rate Table */}
      <div>
        <div style={{ fontSize: '11px', fontWeight: 600, color: '#8888aa', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>
          Per-Mode Performance (Session)
        </div>
        <table style={{ width: '100%', fontSize: '11px', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ color: '#8888aa', borderBottom: '1px solid #1e1e2e' }}>
              <th style={{ textAlign: 'left', padding: '4px 8px', fontWeight: 600 }}>Mode</th>
              <th style={{ textAlign: 'right', padding: '4px 8px', fontWeight: 600 }}>Wins</th>
              <th style={{ textAlign: 'right', padding: '4px 8px', fontWeight: 600 }}>Losses</th>
              <th style={{ textAlign: 'right', padding: '4px 8px', fontWeight: 600 }}>Win%</th>
              <th style={{ textAlign: 'right', padding: '4px 8px', fontWeight: 600 }}>P&L</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(modeTrades).map(([mode, data]) => {
              const total = data.wins + data.losses;
              const winRate = total > 0 ? ((data.wins / total) * 100).toFixed(0) : '-';
              return (
                <tr key={mode} style={{ borderBottom: '1px solid #1e1e2e10' }}>
                  <td style={{ padding: '4px 8px', color: MODE_COLORS[mode], fontWeight: 600 }}>{mode}</td>
                  <td style={{ padding: '4px 8px', textAlign: 'right', color: '#00d4aa' }}>{data.wins}</td>
                  <td style={{ padding: '4px 8px', textAlign: 'right', color: '#ff4560' }}>{data.losses}</td>
                  <td style={{ padding: '4px 8px', textAlign: 'right', color: '#e2e2e2' }}>{winRate}{winRate !== '-' ? '%' : ''}</td>
                  <td style={{
                    padding: '4px 8px',
                    textAlign: 'right',
                    color: data.pnl >= 0 ? '#00d4aa' : '#ff4560',
                    fontWeight: 600,
                  }}>
                    {data.pnl >= 0 ? '+' : ''}${data.pnl.toFixed(2)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Replacement Risk Gauge */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
          <span style={{ fontSize: '11px', fontWeight: 600, color: '#8888aa', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Replacement Risk
          </span>
          <ThreatBadge status={viperReplacementThreat} />
        </div>
        <div style={{
          height: '8px',
          background: '#1e1e2e',
          borderRadius: '4px',
          overflow: 'hidden',
        }}>
          <div style={{
            height: '100%',
            width: viperReplacementThreat === 'DOMINANT' ? '15%' :
                   viperReplacementThreat === 'ACTIVE' ? '40%' :
                   viperReplacementThreat === 'WARNING' ? '70%' : '95%',
            background: viperReplacementThreat === 'DOMINANT' ? '#00d4aa' :
                        viperReplacementThreat === 'ACTIVE' ? '#6c63ff' :
                        viperReplacementThreat === 'WARNING' ? '#f0b429' : '#ff4560',
            borderRadius: '4px',
            transition: 'width 0.3s ease',
          }} />
        </div>
      </div>

      {/* VIPER Verdict */}
      <div style={{
        padding: '10px 12px',
        background: 'rgba(0, 188, 212, 0.05)',
        border: '1px solid rgba(0, 188, 212, 0.12)',
        borderRadius: '6px',
      }}>
        <div style={{ fontSize: '10px', fontWeight: 600, color: '#00bcd4', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>
          VIPER Verdict
        </div>
        <div style={{ fontSize: '11px', color: '#8888aa', lineHeight: 1.4 }}>
          {getVerdict()}
        </div>
      </div>
    </div>
  );
}
