export const TICKER_PROFILES = {
  'BTC-USD': {
    name: 'Bitcoin',
    symbol: 'BTC',
    volatilityClass: 'medium',       // low, medium, high
    avgDailyVolume: 25000000000,      // approximate
    avgSpreadPct: 0.01,               // typical spread %
    avgATRPct: 2.5,                   // typical ATR as % of price
    btcCorrelation: 1.0,
    bestSessions: ['US', 'EU'],       // when most liquid
    behavioralPatterns: [
      'Tends to lead market moves',
      'Strong support/resistance at round numbers',
      'Weekend volatility often lower',
    ],
    recommendedStrategies: ['momentum', 'breakout', 'vwap_reclaim'],
    scalpFriendly: true,
    notes: 'Most liquid crypto asset. Good for all strategies.',
  },
  'ETH-USD': {
    name: 'Ethereum',
    symbol: 'ETH',
    volatilityClass: 'medium',
    avgDailyVolume: 12000000000,
    avgSpreadPct: 0.02,
    avgATRPct: 3.0,
    btcCorrelation: 0.85,
    bestSessions: ['US', 'EU'],
    behavioralPatterns: [
      'Often follows BTC with 1-2 candle delay',
      'DeFi events can cause divergence from BTC',
      'Gas fee spikes affect on-chain activity',
    ],
    recommendedStrategies: ['momentum', 'vwap_reclaim', 'mean_reversion'],
    scalpFriendly: true,
    notes: 'Second most liquid. High BTC correlation — watch for divergence signals.',
  },
  'SOL-USD': {
    name: 'Solana',
    symbol: 'SOL',
    volatilityClass: 'high',
    avgDailyVolume: 3000000000,
    avgSpreadPct: 0.03,
    avgATRPct: 5.0,
    btcCorrelation: 0.75,
    bestSessions: ['US'],
    behavioralPatterns: [
      'Higher beta than BTC — amplified moves',
      'NFT/DeFi narratives drive independent moves',
      'Wider spreads during off-hours',
    ],
    recommendedStrategies: ['momentum', 'breakout', 'range_scalp'],
    scalpFriendly: true,
    notes: 'High beta asset. Wider spreads — adjust slippage assumptions.',
  },
  'DOGE-USD': {
    name: 'Dogecoin',
    symbol: 'DOGE',
    volatilityClass: 'high',
    avgDailyVolume: 1500000000,
    avgSpreadPct: 0.05,
    avgATRPct: 6.0,
    btcCorrelation: 0.60,
    bestSessions: ['US'],
    behavioralPatterns: [
      'Social media driven — can spike unpredictably',
      'Often range-bound between narrative events',
      'Lower liquidity can cause slippage on larger orders',
    ],
    recommendedStrategies: ['range_scalp', 'mean_reversion'],
    scalpFriendly: false,
    notes: 'Meme coin — higher spread and slippage risk. Avoid scalping.',
  },
  'XRP-USD': {
    name: 'XRP',
    symbol: 'XRP',
    volatilityClass: 'medium',
    avgDailyVolume: 2000000000,
    avgSpreadPct: 0.03,
    avgATRPct: 3.5,
    btcCorrelation: 0.65,
    bestSessions: ['ASIA', 'EU'],
    behavioralPatterns: [
      'Legal/regulatory news causes sharp moves',
      'Often decouples from BTC during XRP-specific events',
      'Strong round-number support/resistance',
    ],
    recommendedStrategies: ['momentum', 'mean_reversion', 'vwap_reclaim'],
    scalpFriendly: true,
    notes: 'Moderate liquidity. Watch for legal news catalysts.',
  },
};

// Fee tiers for Coinbase Advanced Trade (as of 2024)
export const FEE_TIERS = {
  starter:     { maker: 0.40, taker: 0.60 },
  intermediate:{ maker: 0.25, taker: 0.40 },
  advanced:    { maker: 0.15, taker: 0.25 },
  // Users can set their tier in settings; default to starter
};

export const SESSION_HOURS = {
  ASIA: { start: 0, end: 8 },    // UTC
  EU:   { start: 7, end: 16 },   // UTC
  US:   { start: 13, end: 22 },  // UTC
};
