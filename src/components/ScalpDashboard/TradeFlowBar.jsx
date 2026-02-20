import useStore from '../../store';

export default function TradeFlowBar() {
  const tradeFlow = useStore((s) => s.tradeFlow);
  const activePair = useStore((s) => s.activePair);

  const total = tradeFlow.buyVolume + tradeFlow.sellVolume;
  const buyPct = total > 0 ? (tradeFlow.buyVolume / total) * 100 : 50;
  const sellPct = 100 - buyPct;
  const ratio = tradeFlow.ratio || 1;

  const pressure = ratio > 1.5 ? 'Strong Buy Pressure' : ratio < 0.67 ? 'Strong Sell Pressure' : 'Balanced';
  const pressureClass = ratio > 1.5 ? 'bullish' : ratio < 0.67 ? 'bearish' : 'neutral';

  return (
    <div className="scalp-flow">
      <div className="scalp-flow-title">Trade Flow — {activePair} (60s rolling)</div>

      <div className="scalp-flow-bar-container">
        <div className="scalp-flow-bar">
          <div className="scalp-flow-buy" style={{ width: `${buyPct}%` }}>
            {buyPct > 15 && <span>{buyPct.toFixed(0)}%</span>}
          </div>
          <div className="scalp-flow-sell" style={{ width: `${sellPct}%` }}>
            {sellPct > 15 && <span>{sellPct.toFixed(0)}%</span>}
          </div>
        </div>
        <div className="scalp-flow-labels">
          <span className="scalp-flow-label buy">Buy</span>
          <span className="scalp-flow-label sell">Sell</span>
        </div>
      </div>

      <div className="scalp-flow-stats">
        <div className="scalp-flow-stat">
          <span className="scalp-flow-stat-label">Buy Volume</span>
          <span className="scalp-flow-stat-value bullish">{tradeFlow.buyVolume.toFixed(2)}</span>
        </div>
        <div className="scalp-flow-stat">
          <span className="scalp-flow-stat-label">Sell Volume</span>
          <span className="scalp-flow-stat-value bearish">{tradeFlow.sellVolume.toFixed(2)}</span>
        </div>
        <div className="scalp-flow-stat">
          <span className="scalp-flow-stat-label">Buy/Sell Ratio</span>
          <span className={`scalp-flow-stat-value ${pressureClass}`}>{ratio.toFixed(2)}</span>
        </div>
      </div>

      <div className={`scalp-flow-pressure ${pressureClass}`}>{pressure}</div>
    </div>
  );
}
