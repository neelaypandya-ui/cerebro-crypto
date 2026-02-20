import useStore from '../../store';
import { DEFAULT_PAIRS } from '../../config/constants';

export default function SpreadMonitor() {
  const spreads = useStore((s) => s.spreads);
  const activePair = useStore((s) => s.activePair);

  const pairs = DEFAULT_PAIRS.slice(0, 10); // top 10

  return (
    <div className="scalp-spread-monitor">
      <div className="scalp-spread-header">
        <span className="scalp-spread-hcol">Pair</span>
        <span className="scalp-spread-hcol">Spread</span>
        <span className="scalp-spread-hcol">Status</span>
        <span className="scalp-spread-hcol">Scalp Safe</span>
      </div>
      {pairs.map((pair) => {
        const data = spreads[pair] || {};
        const status = data.status || 'unknown';
        const spreadPct = data.spreadPct != null ? data.spreadPct.toFixed(4) + '%' : '\u2014';
        const isActive = pair === activePair;

        return (
          <div key={pair} className={`scalp-spread-row ${isActive ? 'active' : ''}`}>
            <span className="scalp-spread-pair">{pair.replace('-USD', '')}</span>
            <span className="scalp-spread-value">{spreadPct}</span>
            <span className={`scalp-spread-status ${status}`}>
              <span className="scalp-spread-dot" />
              {status}
            </span>
            <span className={`scalp-spread-safe ${data.scalpSafe === false ? 'no' : data.scalpSafe ? 'yes' : ''}`}>
              {data.scalpSafe === false ? 'NO' : data.scalpSafe ? 'YES' : '\u2014'}
            </span>
          </div>
        );
      })}
    </div>
  );
}
