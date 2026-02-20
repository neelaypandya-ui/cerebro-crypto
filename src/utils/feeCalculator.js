/* ============================================================
   Cerebro Crypto — Fee Calculator
   ============================================================ */

const DEFAULT_TAKER_FEE = 0.006; // 0.6% — Coinbase starter tier
const DEFAULT_MAKER_FEE = 0.004; // 0.4%

/**
 * Calculate round-trip fee impact for a trade.
 * @param {number} entryPrice
 * @param {number} exitPrice - expected exit (TP target)
 * @param {number} positionSize - in base currency
 * @param {Object} options
 * @returns {{ entryFee, exitFee, totalFees, grossProfit, netProfit, feeToGrossRatio, warnings: string[] }}
 */
export function calculateFeeImpact(entryPrice, exitPrice, positionSize, options = {}) {
  const {
    takerFee = DEFAULT_TAKER_FEE,
    makerFee = DEFAULT_MAKER_FEE,
    entryType = 'taker', // 'taker' or 'maker'
    exitType = 'taker',
  } = options;

  const entryFeeRate = entryType === 'maker' ? makerFee : takerFee;
  const exitFeeRate = exitType === 'maker' ? makerFee : takerFee;

  const entryNotional = entryPrice * positionSize;
  const exitNotional = exitPrice * positionSize;

  const entryFee = entryNotional * entryFeeRate;
  const exitFee = exitNotional * exitFeeRate;
  const totalFees = entryFee + exitFee;

  const grossProfit = (exitPrice - entryPrice) * positionSize;
  const netProfit = grossProfit - totalFees;

  const feeToGrossRatio = grossProfit > 0 ? totalFees / grossProfit : Infinity;

  const warnings = [];
  if (feeToGrossRatio > 0.5) {
    warnings.push(`Fees consume ${(feeToGrossRatio * 100).toFixed(0)}% of gross profit`);
  }
  if (netProfit < 1) {
    warnings.push(`Net profit < $1.00 ($${netProfit.toFixed(2)})`);
  }

  return { entryFee, exitFee, totalFees, grossProfit, netProfit, feeToGrossRatio, warnings };
}

/**
 * Calculate minimum profitable move given fees.
 */
export function minProfitableMove(price, positionSize, options = {}) {
  const { takerFee = DEFAULT_TAKER_FEE } = options;
  const roundTripFeeRate = takerFee * 2;
  const minMove = price * roundTripFeeRate;
  const minMovePct = roundTripFeeRate * 100;
  return { minMove, minMovePct, minMoveForDollar: minMove + (1 / positionSize) };
}
