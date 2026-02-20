/* ============================================================
   Cerebro Crypto — Formatting Utilities
   ============================================================ */

// ---------------------------------------------------------------------------
// Decimal-place lookup
// ---------------------------------------------------------------------------

const DECIMAL_MAP = {
  'BTC-USD': 2,
  'ETH-USD': 2,
  'SOL-USD': 2,
  'AVAX-USD': 2,
  'LINK-USD': 4,
  'DOGE-USD': 5,
  'XRP-USD': 4,
  'ADA-USD': 4,
  'DOT-USD': 4,
  'MATIC-USD': 4,
  'LTC-USD': 2,
  'BCH-USD': 2,
  'SHIB-USD': 8,
  'UNI-USD': 4,
  'ATOM-USD': 4,
  'NEAR-USD': 4,
  'APT-USD': 4,
  'ARB-USD': 4,
};

/**
 * Return the appropriate number of decimal places for a trading pair.
 */
export function getDecimalPlaces(pair) {
  if (DECIMAL_MAP[pair] !== undefined) return DECIMAL_MAP[pair];
  // Default heuristic: if the pair contains SHIB use 8, otherwise 4
  if (pair && pair.includes('SHIB')) return 8;
  return 4;
}

// ---------------------------------------------------------------------------
// Price formatting
// ---------------------------------------------------------------------------

/**
 * Format a price to the correct number of decimal places for a pair.
 */
export function formatPrice(price, pair = 'BTC-USD') {
  if (price == null || isNaN(price)) return '--';
  const decimals = getDecimalPlaces(pair);
  return Number(price).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Format as USD currency string ($1,234.56).
 */
export function formatUSD(amount) {
  if (amount == null || isNaN(amount)) return '$--';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

// ---------------------------------------------------------------------------
// Percentages
// ---------------------------------------------------------------------------

/**
 * Format a decimal or percentage value as a signed percentage string.
 * e.g. 0.0123 -> +1.23%,  -0.05 -> -5.00%
 * Values > 1 or < -1 are treated as already-percentage values.
 */
export function formatPercent(value) {
  if (value == null || isNaN(value)) return '--';
  const pct = Math.abs(value) < 1 ? value * 100 : value;
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${pct.toFixed(2)}%`;
}

// ---------------------------------------------------------------------------
// Volume / large numbers
// ---------------------------------------------------------------------------

/**
 * Abbreviate a large number: 1,200,000 -> 1.2M
 */
export function abbreviateNumber(num) {
  if (num == null || isNaN(num)) return '--';
  const abs = Math.abs(num);
  if (abs >= 1e12) return (num / 1e12).toFixed(2) + 'T';
  if (abs >= 1e9) return (num / 1e9).toFixed(2) + 'B';
  if (abs >= 1e6) return (num / 1e6).toFixed(2) + 'M';
  if (abs >= 1e3) return (num / 1e3).toFixed(1) + 'K';
  return num.toFixed(2);
}

/**
 * Format trading volume (alias for abbreviateNumber with rounding).
 */
export function formatVolume(volume) {
  return abbreviateNumber(volume);
}

// ---------------------------------------------------------------------------
// Timestamps / Dates
// ---------------------------------------------------------------------------

/**
 * Format a timestamp (ms or seconds) as HH:MM:SS.
 */
export function formatTimestamp(ts) {
  if (!ts) return '--:--:--';
  const d = new Date(ts < 1e12 ? ts * 1000 : ts);
  return d.toLocaleTimeString('en-US', { hour12: false });
}

/**
 * Format a timestamp as MM/DD/YYYY.
 */
export function formatDate(ts) {
  if (!ts) return '--/--/----';
  const d = new Date(ts < 1e12 ? ts * 1000 : ts);
  return d.toLocaleDateString('en-US');
}

/**
 * Format a duration in milliseconds as a human-friendly string.
 * e.g. 7500000 -> "2h 5m", 90000 -> "1m 30s"
 */
export function formatDuration(ms) {
  if (ms == null || isNaN(ms) || ms < 0) return '--';

  const totalSeconds = Math.floor(ms / 1000);

  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }

  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) {
    return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  }
  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

// ---------------------------------------------------------------------------
// Crypto amounts
// ---------------------------------------------------------------------------

/**
 * Format a crypto quantity with appropriate precision.
 */
export function formatCryptoAmount(amount, pair = '') {
  if (amount == null || isNaN(amount)) return '--';

  const base = pair.split('-')[0] || '';
  const abs = Math.abs(Number(amount));

  // Large-cap coins: show fewer decimals for quantities
  if (['BTC'].includes(base)) {
    return abs < 0.001
      ? amount.toFixed(8)
      : abs < 1
        ? amount.toFixed(6)
        : amount.toFixed(4);
  }

  if (['ETH', 'SOL', 'LTC', 'BCH'].includes(base)) {
    return abs < 1 ? amount.toFixed(6) : amount.toFixed(4);
  }

  // Very small unit-price tokens
  if (['SHIB', 'DOGE'].includes(base)) {
    return Math.round(amount).toLocaleString('en-US');
  }

  // Default
  return abs < 1 ? amount.toFixed(6) : amount.toFixed(2);
}
