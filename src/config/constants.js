/* ============================================================
   Cerebro Crypto — Application Constants
   ============================================================ */

export const APP_VERSION = '0.2.0';

// ---------------------------------------------------------------------------
// Default trading pairs (Coinbase Advanced Trade format)
// ---------------------------------------------------------------------------
export const DEFAULT_PAIRS = [
  'BTC-USD',
  'ETH-USD',
  'SOL-USD',
  'AVAX-USD',
  'LINK-USD',
  'DOGE-USD',
  'XRP-USD',
  'ADA-USD',
  'DOT-USD',
  'MATIC-USD',
  'LTC-USD',
  'BCH-USD',
  'SHIB-USD',
  'UNI-USD',
  'ATOM-USD',
  'NEAR-USD',
  'APT-USD',
  'ARB-USD',
];

// ---------------------------------------------------------------------------
// Candlestick timeframes
// ---------------------------------------------------------------------------
export const TIMEFRAMES = [
  { label: '1m',  value: 'ONE_MINUTE'      },
  { label: '5m',  value: 'FIVE_MINUTE'     },
  { label: '15m', value: 'FIFTEEN_MINUTE'  },
  { label: '1H',  value: 'ONE_HOUR'        },
  { label: '4H',  value: 'FOUR_HOUR'       },
  { label: '1D',  value: 'ONE_DAY'         },
  { label: '1W',  value: 'ONE_WEEK'        },
];

// ---------------------------------------------------------------------------
// Risk / position-sizing defaults
// ---------------------------------------------------------------------------
export const RISK_DEFAULTS = {
  positionSizePct:      5,
  stopLossMethod:       'percentage',
  stopLossPct:          2,
  tp1R:                 1.5,
  tp2R:                 3,
  trailingStopATR:      1,
  maxPositions:         3,
  maxDailyLossUSD:      500,
  maxTradesPerDay:      10,
  pairCooldownMinutes:  10,
};

// ---------------------------------------------------------------------------
// Color palette
// ---------------------------------------------------------------------------
export const COLORS = {
  background:     '#0a0a0f',
  cardSurface:    '#12121a',
  border:         '#1e1e2e',
  accent:         '#6c63ff',
  bullish:        '#00d4aa',
  bearish:        '#ff4560',
  textPrimary:    '#e2e2e2',
  textSecondary:  '#8888aa',
  warningYellow:  '#f0b429',
};

// ---------------------------------------------------------------------------
// WebSocket
// ---------------------------------------------------------------------------
export const WS_URL = 'wss://advanced-trade-ws.coinbase.com';

export const WS_RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000, 30000];

// ---------------------------------------------------------------------------
// Paper-trading defaults
// ---------------------------------------------------------------------------
export const PAPER_STARTING_BALANCE = 25000;

// ---------------------------------------------------------------------------
// Execution simulation
// ---------------------------------------------------------------------------
export const SLIPPAGE_PCT   = 0.05;
export const TAKER_FEE_PCT  = 0.6;

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
export const RENDER_THROTTLE_MS = 250;

// ---------------------------------------------------------------------------
// Market regimes
// ---------------------------------------------------------------------------
export const REGIMES = {
  BULLISH: 'bullish',
  CHOPPY:  'choppy',
  BEARISH: 'bearish',
};

// ---------------------------------------------------------------------------
// Strategy identifiers
// ---------------------------------------------------------------------------
export const STRATEGIES = {
  MOMENTUM:              'momentum',
  BREAKOUT:              'breakout',
  VWAP_RECLAIM:          'vwap_reclaim',
  MEAN_REVERSION:        'mean_reversion',
  RANGE_SCALP:           'range_scalp',
  MICRO_VWAP_SCALP:      'micro_vwap_scalp',
  MOMENTUM_SPIKE_SCALP:  'momentum_spike_scalp',
  ORDER_BOOK_IMBALANCE:  'order_book_imbalance',
};

// ---------------------------------------------------------------------------
// Indicator categories
// ---------------------------------------------------------------------------
export const INDICATOR_CATEGORIES = {
  TREND:      'Trend',
  MOMENTUM:   'Momentum',
  VOLUME:     'Volume',
  VOLATILITY: 'Volatility',
};

// ---------------------------------------------------------------------------
// Timeframe durations (ms) — for signal expiry, cooldowns, etc.
// ---------------------------------------------------------------------------
export const TIMEFRAME_MS = {
  ONE_MINUTE:      60000,
  FIVE_MINUTE:     300000,
  FIFTEEN_MINUTE:  900000,
  ONE_HOUR:        3600000,
  FOUR_HOUR:       14400000,
  ONE_DAY:         86400000,
  ONE_WEEK:        604800000,
};

// ---------------------------------------------------------------------------
// Fee tier data (Coinbase Advanced Trade)
// ---------------------------------------------------------------------------
export const FEE_TIERS = {
  starter:      { maker: 0.40, taker: 0.60 },
  intermediate: { maker: 0.25, taker: 0.40 },
  advanced:     { maker: 0.15, taker: 0.25 },
};
