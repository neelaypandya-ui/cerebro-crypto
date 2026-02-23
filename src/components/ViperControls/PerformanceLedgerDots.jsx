export default function PerformanceLedgerDots({ ledger = [] }) {
  // Show last 10 days as colored dots
  const dots = [];
  for (let i = 0; i < 10; i++) {
    const day = ledger[i];
    let color = '#333'; // gray = no data
    let title = 'No data';

    if (day) {
      if (day.pnlPct < 0) {
        color = '#ff4560'; // red = loss day
        title = `${day.date}: ${day.pnlPct.toFixed(2)}% (loss)`;
      } else if (day.metBenchmark) {
        color = '#00d4aa'; // green = met benchmark
        title = `${day.date}: +${day.pnlPct.toFixed(2)}% (benchmark met)`;
      } else {
        color = '#f0b429'; // yellow = positive but below benchmark
        title = `${day.date}: +${day.pnlPct.toFixed(2)}% (below target)`;
      }
    }

    dots.push(
      <span
        key={i}
        className="viper-ledger-dot"
        title={title}
        style={{
          background: color,
          boxShadow: day ? `0 0 4px ${color}60` : 'none',
        }}
      />
    );
  }

  return <div className="viper-ledger-dots">{dots}</div>;
}
