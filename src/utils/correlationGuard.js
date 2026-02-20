/* ============================================================
   Cerebro Crypto — Correlation Guard
   ============================================================ */

// Approximate correlation matrix for major pairs (with BTC)
const CORRELATION_MATRIX = {
  'BTC-USD': { 'ETH-USD': 0.85, 'SOL-USD': 0.75, 'DOGE-USD': 0.60, 'XRP-USD': 0.65, 'ADA-USD': 0.70, 'AVAX-USD': 0.72, 'LINK-USD': 0.70, 'DOT-USD': 0.68, 'MATIC-USD': 0.72, 'LTC-USD': 0.80, 'BCH-USD': 0.75 },
  'ETH-USD': { 'BTC-USD': 0.85, 'SOL-USD': 0.78, 'DOGE-USD': 0.55, 'XRP-USD': 0.60, 'ADA-USD': 0.72, 'AVAX-USD': 0.75, 'LINK-USD': 0.75, 'DOT-USD': 0.70, 'MATIC-USD': 0.78, 'LTC-USD': 0.70, 'BCH-USD': 0.65 },
};

/**
 * Check if a new position would create excessive correlated exposure.
 * @param {string} newPair - The pair being considered
 * @param {Array} openPositions - Array of { pair, size, direction }
 * @param {number} correlationThreshold - Block if correlation > this (default 0.70)
 * @returns {{ allowed: boolean, reducedSize: number|null, reason: string|null, correlatedPairs: string[] }}
 */
export function checkCorrelation(newPair, openPositions, correlationThreshold = 0.70) {
  if (!openPositions || openPositions.length === 0) {
    return { allowed: true, reducedSize: null, reason: null, correlatedPairs: [] };
  }

  const correlatedPairs = [];

  for (const pos of openPositions) {
    const corr = getCorrelation(newPair, pos.pair);
    if (corr >= correlationThreshold) {
      correlatedPairs.push(pos.pair);
    }
  }

  if (correlatedPairs.length === 0) {
    return { allowed: true, reducedSize: null, reason: null, correlatedPairs: [] };
  }

  // If highly correlated positions exist, reduce size by 50%
  return {
    allowed: true,
    reducedSize: 0.5, // multiply position size by this factor
    reason: `Correlated with open positions: ${correlatedPairs.join(', ')}. Size reduced 50%.`,
    correlatedPairs,
  };
}

/**
 * Get correlation between two pairs.
 */
export function getCorrelation(pairA, pairB) {
  if (pairA === pairB) return 1.0;
  const matrixA = CORRELATION_MATRIX[pairA];
  if (matrixA && matrixA[pairB] != null) return matrixA[pairB];
  const matrixB = CORRELATION_MATRIX[pairB];
  if (matrixB && matrixB[pairA] != null) return matrixB[pairA];
  return 0.3; // default low correlation for unknown pairs
}
