// =============================================================================
// Indicator Defaults Configuration
// Cerebro Crypto - Default parameters for all 26 technical indicators
// =============================================================================

export const INDICATOR_CATEGORIES = {
  TREND: 'Trend',
  MOMENTUM: 'Momentum',
  VOLUME: 'Volume',
  VOLATILITY: 'Volatility',
};

export const INDICATOR_DEFAULTS = {
  // ---------------------------------------------------------------------------
  // TREND INDICATORS
  // ---------------------------------------------------------------------------
  sma: {
    key: 'sma',
    name: 'SMA',
    category: 'Trend',
    enabled: false,
    params: { period: 200 },
    color: '#2196F3',
    description: 'Simple Moving Average - arithmetic mean of price over N periods.',
  },
  ema9: {
    key: 'ema9',
    name: 'EMA 9',
    category: 'Trend',
    enabled: false,
    params: { period: 9 },
    color: '#6c63ff',
    description: 'Exponential Moving Average (9) - fast-reacting trend line for scalping.',
  },
  ema21: {
    key: 'ema21',
    name: 'EMA 21',
    category: 'Trend',
    enabled: false,
    params: { period: 21 },
    color: '#7c74ff',
    description: 'Exponential Moving Average (21) - medium-term trend direction.',
  },
  ema50: {
    key: 'ema50',
    name: 'EMA 50',
    category: 'Trend',
    enabled: false,
    params: { period: 50 },
    color: '#8b85ff',
    description: 'Exponential Moving Average (50) - intermediate trend filter.',
  },
  adx: {
    key: 'adx',
    name: 'ADX',
    category: 'Trend',
    enabled: false,
    params: { period: 14 },
    color: '#FF9800',
    description: 'Average Directional Index - measures trend strength from 0-100.',
  },
  ichimoku: {
    key: 'ichimoku',
    name: 'Ichimoku Cloud',
    category: 'Trend',
    enabled: false,
    params: { tenkan: 9, kijun: 26, senkouB: 52 },
    color: '#9C27B0',
    description: 'Ichimoku Kinko Hyo - multi-component trend, momentum, and support/resistance system.',
  },
  parabolicSar: {
    key: 'parabolicSar',
    name: 'Parabolic SAR',
    category: 'Trend',
    enabled: false,
    params: { step: 0.02, max: 0.2 },
    color: '#E91E63',
    description: 'Parabolic Stop and Reverse - trailing stop dots that flip on trend reversal.',
  },
  supertrend: {
    key: 'supertrend',
    name: 'Supertrend',
    category: 'Trend',
    enabled: false,
    params: { period: 10, multiplier: 3 },
    color: '#00d4aa',
    description: 'Supertrend - ATR-based trend-following overlay that signals direction changes.',
  },
  pivotPoints: {
    key: 'pivotPoints',
    name: 'Pivot Points',
    category: 'Trend',
    enabled: false,
    params: { type: 'standard' },
    color: '#607D8B',
    description: 'Pivot Points - classic support/resistance levels derived from prior period HLC.',
  },
  hma: {
    key: 'hma',
    name: 'HMA',
    category: 'Trend',
    enabled: false,
    params: { period: 9 },
    color: '#00BCD4',
    description: 'Hull Moving Average - fast, smooth MA that reduces lag using weighted calculations.',
  },
  tema: {
    key: 'tema',
    name: 'TEMA',
    category: 'Trend',
    enabled: false,
    params: { period: 9 },
    color: '#3F51B5',
    description: 'Triple Exponential Moving Average - triple-smoothed EMA for minimal lag trend tracking.',
  },

  // ---------------------------------------------------------------------------
  // MOMENTUM INDICATORS
  // ---------------------------------------------------------------------------
  rsi: {
    key: 'rsi',
    name: 'RSI',
    category: 'Momentum',
    enabled: false,
    params: { period: 14 },
    color: '#f0b429',
    description: 'Relative Strength Index - oscillator measuring overbought/oversold (0-100).',
  },
  macd: {
    key: 'macd',
    name: 'MACD',
    category: 'Momentum',
    enabled: false,
    params: { fast: 12, slow: 26, signal: 9 },
    color: '#ff4560',
    description: 'Moving Average Convergence Divergence - trend momentum via EMA crossover and histogram.',
  },
  stochRsi: {
    key: 'stochRsi',
    name: 'Stochastic RSI',
    category: 'Momentum',
    enabled: false,
    params: { rsiPeriod: 14, stochPeriod: 14, kPeriod: 3, dPeriod: 3 },
    color: '#FF5722',
    description: 'Stochastic RSI - applies stochastic oscillator formula to RSI for higher sensitivity.',
  },
  williamsR: {
    key: 'williamsR',
    name: 'Williams %R',
    category: 'Momentum',
    enabled: false,
    params: { period: 14 },
    color: '#8BC34A',
    description: 'Williams Percent Range - momentum oscillator measuring overbought/oversold (-100 to 0).',
  },
  cci: {
    key: 'cci',
    name: 'CCI',
    category: 'Momentum',
    enabled: false,
    params: { period: 20 },
    color: '#CDDC39',
    description: 'Commodity Channel Index - measures deviation from statistical mean for cycle detection.',
  },
  roc: {
    key: 'roc',
    name: 'ROC',
    category: 'Momentum',
    enabled: false,
    params: { period: 12 },
    color: '#009688',
    description: 'Rate of Change - percentage change between current price and N periods ago.',
  },
  trix: {
    key: 'trix',
    name: 'TRIX',
    category: 'Momentum',
    enabled: false,
    params: { period: 15 },
    color: '#795548',
    description: 'Triple Exponential Average - rate of change of a triple-smoothed EMA, filters noise.',
  },

  // ---------------------------------------------------------------------------
  // VOLUME INDICATORS
  // ---------------------------------------------------------------------------
  vwap: {
    key: 'vwap',
    name: 'VWAP',
    category: 'Volume',
    enabled: false,
    params: {},
    color: '#9C27B0',
    description: 'Volume Weighted Average Price - intraday fair value benchmark used by institutions.',
  },
  anchoredVwap: {
    key: 'anchoredVwap',
    name: 'Anchored VWAP',
    category: 'Volume',
    enabled: false,
    params: { anchorTimestamp: null },
    color: '#AB47BC',
    description: 'Anchored VWAP - cumulative VWAP from a user-defined anchor point in time.',
  },
  obv: {
    key: 'obv',
    name: 'OBV',
    category: 'Volume',
    enabled: false,
    params: {},
    color: '#26A69A',
    description: 'On Balance Volume - running total of volume added/subtracted by price direction.',
  },
  mfi: {
    key: 'mfi',
    name: 'MFI',
    category: 'Volume',
    enabled: false,
    params: { period: 14 },
    color: '#42A5F5',
    description: 'Money Flow Index - volume-weighted RSI measuring buying and selling pressure.',
  },
  cmf: {
    key: 'cmf',
    name: 'CMF',
    category: 'Volume',
    enabled: false,
    params: { period: 20 },
    color: '#5C6BC0',
    description: 'Chaikin Money Flow - measures accumulation/distribution over N periods.',
  },
  volumeProfile: {
    key: 'volumeProfile',
    name: 'Volume Profile',
    category: 'Volume',
    enabled: false,
    params: { rowSize: 24 },
    color: '#78909C',
    description: 'Volume Profile - horizontal histogram showing volume traded at each price level.',
  },

  // ---------------------------------------------------------------------------
  // VOLATILITY INDICATORS
  // ---------------------------------------------------------------------------
  bollingerBands: {
    key: 'bollingerBands',
    name: 'Bollinger Bands',
    category: 'Volatility',
    enabled: false,
    params: { period: 20, stdDev: 2 },
    color: '#2196F3',
    description: 'Bollinger Bands - volatility envelope using standard deviations around an SMA.',
  },
  atr: {
    key: 'atr',
    name: 'ATR',
    category: 'Volatility',
    enabled: false,
    params: { period: 14 },
    color: '#FF9800',
    description: 'Average True Range - measures market volatility using highs, lows, and closes.',
  },
  keltnerChannels: {
    key: 'keltnerChannels',
    name: 'Keltner Channels',
    category: 'Volatility',
    enabled: false,
    params: { period: 20, multiplier: 1.5 },
    color: '#4CAF50',
    description: 'Keltner Channels - ATR-based volatility envelope around an EMA midline.',
  },
};

// =============================================================================
// Built-in Presets
// Pre-configured indicator combinations for common trading strategies
// =============================================================================

export const BUILTIN_PRESETS = {
  scalping: {
    name: 'Scalping',
    indicators: {
      ema9: { enabled: true, params: { period: 9 } },
      ema21: { enabled: true, params: { period: 21 } },
      rsi: { enabled: true, params: { period: 14 } },
      vwap: { enabled: true, params: {} },
      bollingerBands: { enabled: true, params: { period: 20, stdDev: 2 } },
      stochRsi: { enabled: true, params: { rsiPeriod: 14, stochPeriod: 14, kPeriod: 3, dPeriod: 3 } },
      atr: { enabled: true, params: { period: 14 } },
    },
  },
  swing: {
    name: 'Swing Trading',
    indicators: {
      sma: { enabled: true, params: { period: 200 } },
      ema50: { enabled: true, params: { period: 50 } },
      macd: { enabled: true, params: { fast: 12, slow: 26, signal: 9 } },
      adx: { enabled: true, params: { period: 14 } },
      rsi: { enabled: true, params: { period: 14 } },
      ichimoku: { enabled: true, params: { tenkan: 9, kijun: 26, senkouB: 52 } },
      supertrend: { enabled: true, params: { period: 10, multiplier: 3 } },
      atr: { enabled: true, params: { period: 14 } },
    },
  },
  meanReversion: {
    name: 'Mean Reversion',
    indicators: {
      bollingerBands: { enabled: true, params: { period: 20, stdDev: 2 } },
      rsi: { enabled: true, params: { period: 14 } },
      cci: { enabled: true, params: { period: 20 } },
      keltnerChannels: { enabled: true, params: { period: 20, multiplier: 1.5 } },
      vwap: { enabled: true, params: {} },
      mfi: { enabled: true, params: { period: 14 } },
      williamsR: { enabled: true, params: { period: 14 } },
    },
  },
};
