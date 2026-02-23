/* ============================================================
   Cerebro Crypto — Slippage Estimator
   ============================================================ */

/**
 * Estimate slippage for a given order size using L2 book depth.
 * @param {Array} bookSide - Array of [price, qty] levels (bids for sell, asks for buy)
 * @param {number} orderSize - Size of order in base currency
 * @param {string} side - 'buy' or 'sell'
 * @returns {{ estimatedSlippage: number, slippagePct: number, avgFillPrice: number, blocked: boolean, reason: string|null }}
 */
export function estimateSlippage(bookSide, orderSize, side = 'buy') {
  if (!bookSide || bookSide.length === 0) {
    return { estimatedSlippage: 0, slippagePct: 0, avgFillPrice: 0, blocked: true, reason: 'No order book data' };
  }

  const levels = bookSide.map(([price, qty]) => ({
    price: parseFloat(price),
    qty: parseFloat(qty),
  }));

  // Sort: asks ascending (buy), bids descending (sell)
  if (side === 'buy') {
    levels.sort((a, b) => a.price - b.price);
  } else {
    levels.sort((a, b) => b.price - a.price);
  }

  const bestPrice = levels[0].price;
  let remaining = orderSize;
  let totalCost = 0;

  for (const level of levels) {
    const fillQty = Math.min(remaining, level.qty);
    totalCost += fillQty * level.price;
    remaining -= fillQty;
    if (remaining <= 0) break;
  }

  if (remaining > 0) {
    return { estimatedSlippage: Infinity, slippagePct: Infinity, avgFillPrice: 0, blocked: true, reason: 'Insufficient book depth for order size' };
  }

  const avgFillPrice = totalCost / orderSize;
  const estimatedSlippage = Math.abs(avgFillPrice - bestPrice);
  const slippagePct = (estimatedSlippage / bestPrice) * 100;

  return {
    estimatedSlippage,
    slippagePct,
    avgFillPrice,
    blocked: slippagePct > 0.30,
    reason: slippagePct > 0.30 ? `Estimated slippage ${slippagePct.toFixed(3)}% exceeds 0.30% threshold` : null,
  };
}
