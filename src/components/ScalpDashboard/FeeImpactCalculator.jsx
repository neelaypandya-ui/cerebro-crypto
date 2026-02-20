import { useState, useMemo } from 'react';
import useStore from '../../store';

export default function FeeImpactCalculator() {
  const activePair = useStore((s) => s.activePair);
  const tickers = useStore((s) => s.tickers);
  const currentPrice = tickers[activePair]?.price || 0;

  const [posSize, setPosSize] = useState(0.01);
  const [targetPct, setTargetPct] = useState(0.15);
  const [feePct, setFeePct] = useState(0.6);

  const calc = useMemo(() => {
    if (!currentPrice || posSize <= 0) return null;
    const entryNotional = currentPrice * posSize;
    const exitPrice = currentPrice * (1 + targetPct / 100);
    const exitNotional = exitPrice * posSize;
    const entryFee = entryNotional * (feePct / 100);
    const exitFee = exitNotional * (feePct / 100);
    const totalFees = entryFee + exitFee;
    const grossProfit = (exitPrice - currentPrice) * posSize;
    const netProfit = grossProfit - totalFees;
    const feeToGross = grossProfit > 0 ? (totalFees / grossProfit) * 100 : 100;
    const minMovePct = (feePct / 100) * 2 * 100;

    return { entryNotional, entryFee, exitFee, totalFees, grossProfit, netProfit, feeToGross, minMovePct };
  }, [currentPrice, posSize, targetPct, feePct]);

  return (
    <div className="scalp-fee-calc">
      <div className="scalp-fee-title">Fee Impact Calculator — {activePair}</div>
      <div className="scalp-fee-price">Current: ${currentPrice.toLocaleString()}</div>

      <div className="scalp-fee-inputs">
        <div className="scalp-fee-input-row">
          <label>Position Size</label>
          <input type="number" value={posSize} onChange={(e) => setPosSize(parseFloat(e.target.value) || 0)} step="0.001" />
        </div>
        <div className="scalp-fee-input-row">
          <label>Target Move (%)</label>
          <input type="number" value={targetPct} onChange={(e) => setTargetPct(parseFloat(e.target.value) || 0)} step="0.01" />
        </div>
        <div className="scalp-fee-input-row">
          <label>Fee Rate (%)</label>
          <input type="number" value={feePct} onChange={(e) => setFeePct(parseFloat(e.target.value) || 0)} step="0.1" />
        </div>
      </div>

      {calc && (
        <div className="scalp-fee-results">
          <div className="scalp-fee-row">
            <span>Position Value</span>
            <span>${calc.entryNotional.toFixed(2)}</span>
          </div>
          <div className="scalp-fee-row">
            <span>Entry Fee</span>
            <span className="bearish">${calc.entryFee.toFixed(2)}</span>
          </div>
          <div className="scalp-fee-row">
            <span>Exit Fee</span>
            <span className="bearish">${calc.exitFee.toFixed(2)}</span>
          </div>
          <div className="scalp-fee-row">
            <span>Total Fees</span>
            <span className="bearish">${calc.totalFees.toFixed(2)}</span>
          </div>
          <div className="scalp-fee-row divider">
            <span>Gross Profit</span>
            <span className={calc.grossProfit >= 0 ? 'bullish' : 'bearish'}>${calc.grossProfit.toFixed(2)}</span>
          </div>
          <div className="scalp-fee-row highlight">
            <span>Net Profit</span>
            <span className={calc.netProfit >= 0 ? 'bullish' : 'bearish'}>${calc.netProfit.toFixed(2)}</span>
          </div>
          <div className="scalp-fee-row">
            <span>Fee / Gross</span>
            <span className={calc.feeToGross > 50 ? 'bearish' : ''}>{calc.feeToGross.toFixed(1)}%</span>
          </div>
          <div className="scalp-fee-row">
            <span>Min Profitable Move</span>
            <span>{calc.minMovePct.toFixed(3)}%</span>
          </div>

          {calc.feeToGross > 50 && (
            <div className="scalp-fee-warning">Fees consume &gt;50% of gross profit</div>
          )}
          {calc.netProfit < 1 && calc.netProfit >= 0 && (
            <div className="scalp-fee-warning">Net profit &lt; $1.00 — consider larger size or target</div>
          )}
        </div>
      )}
    </div>
  );
}
