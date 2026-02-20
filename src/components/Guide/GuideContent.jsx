import { useMemo } from 'react';

const CONTENT = {
  'getting-started': {
    title: 'Getting Started',
    content: (
      <>
        <h3>Welcome to Cerebro Crypto</h3>
        <p>Cerebro Crypto is a professional-grade cryptocurrency trading terminal built for active traders. It connects directly to the Coinbase Advanced Trade API for real-time market data and order execution.</p>

        <h4>Initial Setup</h4>
        <ol>
          <li><strong>API Keys:</strong> Navigate to Settings and enter your Coinbase Advanced Trade API key and secret. Cerebro uses Ed25519 JWT authentication for maximum security.</li>
          <li><strong>Paper Mode:</strong> Start in Paper Trading mode (default) to practice without risking real funds. You get $25,000 in virtual capital.</li>
          <li><strong>Watchlist:</strong> Your watchlist comes pre-loaded with 18 popular crypto pairs. Star your favorites for quick access.</li>
          <li><strong>Chart:</strong> Select a pair and timeframe. The chart supports pan (drag), zoom (scroll), and crosshair (hover).</li>
        </ol>

        <h4>Quick Start Workflow</h4>
        <ol>
          <li>Check the regime indicator (top of Strategy Controls) — it shows if the market is bullish, choppy, or bearish.</li>
          <li>Enable strategies suited for the current regime.</li>
          <li>Turn on the Bot toggle to start generating signals.</li>
          <li>Review signals before executing trades, or let the bot execute automatically in paper mode.</li>
        </ol>
      </>
    ),
  },
  'interface': {
    title: 'Interface Overview',
    content: (
      <>
        <h3>Interface Layout</h3>
        <p>Cerebro uses a three-column layout optimized for trading:</p>

        <h4>Left Sidebar</h4>
        <ul>
          <li><strong>Watchlist:</strong> All tracked pairs with live prices, 24h change, and volume. Click to switch pairs. Star to favorite.</li>
          <li><strong>Order Book:</strong> Real-time Level 2 data showing bid/ask depth for the active pair.</li>
        </ul>

        <h4>Center Panel</h4>
        <ul>
          <li><strong>Chart:</strong> Custom HTML5 canvas candlestick chart with overlay indicators (EMA, SMA, BB, VWAP) and lower panel (Volume, RSI, MACD, ATR, ADX).</li>
          <li><strong>Strategy Controls:</strong> Bot toggle, regime badge, strategy cards, and signal log.</li>
        </ul>

        <h4>Right Sidebar</h4>
        <ul>
          <li><strong>Order Entry:</strong> Place market/limit orders with size and risk controls.</li>
          <li><strong>Positions:</strong> Active positions with unrealized P&L, stop-loss, and take-profit levels.</li>
          <li><strong>Trade Log:</strong> History of completed trades with P&L breakdown.</li>
          <li><strong>AI Assistant:</strong> AI-powered market analysis and trade suggestions.</li>
        </ul>

        <h4>Bottom Bar</h4>
        <ul>
          <li><strong>Backtesting:</strong> Test strategies against historical data.</li>
          <li><strong>Alert Manager:</strong> Set price and indicator-based alerts.</li>
          <li><strong>Scalp Dashboard:</strong> Analytics, spread monitoring, and fee calculator for scalp trading.</li>
          <li><strong>User Guide:</strong> This guide.</li>
        </ul>
      </>
    ),
  },
  'paper-vs-live': {
    title: 'Paper vs Live Trading',
    content: (
      <>
        <h3>Trading Modes</h3>

        <h4>Paper Trading (Default)</h4>
        <p>Paper mode simulates trades with virtual capital ($25,000). Orders are executed by the proxy server's paper trading simulator with realistic slippage and fees.</p>
        <ul>
          <li>Yellow border on the app indicates paper mode</li>
          <li>All strategies and signals work identically to live</li>
          <li>Trade history is stored in IndexedDB</li>
          <li>Reset balance anytime in Settings</li>
        </ul>

        <h4>Live Trading</h4>
        <p>Live mode sends real orders to Coinbase. Use with extreme caution.</p>
        <ul>
          <li>Red border on the app indicates live mode</li>
          <li>Requires valid API key with trading permissions</li>
          <li>All risk management rules are enforced</li>
          <li>Switch in Settings — requires confirmation</li>
        </ul>

        <h4>Recommendation</h4>
        <p>Always test new strategies in paper mode for at least 50 trades before going live. Compare paper results with backtest results to validate strategy performance.</p>
      </>
    ),
  },
  'regime': {
    title: 'Regime Detection',
    content: (
      <>
        <h3>Market Regime Detection</h3>
        <p>Cerebro continuously analyzes market conditions and classifies them into three regimes:</p>

        <h4>Bullish Regime</h4>
        <ul>
          <li>Price above SMA 200</li>
          <li>Bullish EMA alignment (9 &gt; 21 &gt; 50)</li>
          <li>ADX &gt; 25 (strong trend)</li>
          <li>RSI &gt; 60</li>
          <li><strong>Active strategies:</strong> Momentum, Breakout, VWAP Reclaim</li>
        </ul>

        <h4>Choppy Regime</h4>
        <ul>
          <li>Mixed EMA alignment</li>
          <li>ADX &lt; 20 (weak trend)</li>
          <li>RSI 40-60 (neutral)</li>
          <li>Narrow Bollinger Bands (volatility squeeze)</li>
          <li><strong>Active strategies:</strong> Mean Reversion, Range Scalp</li>
        </ul>

        <h4>Bearish Regime</h4>
        <ul>
          <li>Price below SMA 200</li>
          <li>Bearish EMA alignment (9 &lt; 21 &lt; 50)</li>
          <li>RSI &lt; 40</li>
          <li><strong>Capital preservation mode:</strong> All strategies pause. No new positions.</li>
        </ul>
      </>
    ),
  },
  'strategies': {
    title: 'Strategy Guide (A-H)',
    content: (
      <>
        <h3>Strategy Guide</h3>

        <h4>A — Crypto Momentum</h4>
        <p><strong>Regime:</strong> Bullish | <strong>Timeframes:</strong> 5m, 15m, 1H</p>
        <p>Enters when EMA 9 crosses above EMA 21 with RSI &gt; 50 and volume &gt; 1.5x average. Classic trend-following approach.</p>

        <h4>B — Breakout</h4>
        <p><strong>Regime:</strong> Bullish | <strong>Timeframes:</strong> 15m, 1H</p>
        <p>Detects price breaking above the 20-bar high with volume &gt; 2x average. Uses ATR-based stops below the breakout level.</p>

        <h4>C — VWAP Reclaim</h4>
        <p><strong>Regime:</strong> Bullish | <strong>Timeframes:</strong> 5m, 15m</p>
        <p>Enters when price reclaims VWAP from below with recovering RSI. Good for intraday mean-reversion to VWAP.</p>

        <h4>D — Mean Reversion</h4>
        <p><strong>Regime:</strong> Choppy | <strong>Timeframes:</strong> 15m, 1H</p>
        <p>Buys at lower Bollinger Band touches with RSI &lt; 35 and a bullish candle. Targets the middle band.</p>

        <h4>E — Range Scalp (Enhanced)</h4>
        <p><strong>Regime:</strong> Choppy | <strong>Timeframes:</strong> 5m, 15m</p>
        <p>Auto-detects support/resistance, validates range width via ATR, requires engulfing/hammer confirmation with RSI + volume filters. Dual take-profit targets.</p>

        <h4>F — Micro VWAP Scalp</h4>
        <p><strong>Regime:</strong> Bullish, Choppy | <strong>Timeframe:</strong> 1m</p>
        <p>Ultra-short scalp on 1-minute VWAP pullbacks. Requires StochRSI oversold + HMA trend confirmation. 5-minute max duration, 2-minute cooldown between trades.</p>

        <h4>G — Momentum Spike Scalp</h4>
        <p><strong>Regime:</strong> Bullish | <strong>Timeframes:</strong> 1m, 5m</p>
        <p>Detects volume spikes (&gt;3x average), waits for 30-60% pullback, enters targeting spike-high retest. 3-minute max duration.</p>

        <h4>H — Order Book Imbalance</h4>
        <p><strong>Regime:</strong> Bullish, Choppy | <strong>Timeframe:</strong> 1m</p>
        <p>Reads Level 2 order book for bid/ask imbalance (&gt;2x ratio). Requires neutral RSI and tight spreads. 2-minute max duration.</p>
      </>
    ),
  },
  'risk': {
    title: 'Risk Management',
    content: (
      <>
        <h3>Risk Management</h3>

        <h4>Position Sizing</h4>
        <p>Default: 5% of capital per position. Adjustable in Settings. Never risk more than you can afford to lose.</p>

        <h4>Stop-Loss Methods</h4>
        <ul>
          <li><strong>Percentage:</strong> Fixed % below entry (default 2%)</li>
          <li><strong>ATR-based:</strong> 2x ATR below entry — adapts to volatility</li>
        </ul>

        <h4>Take-Profit Levels</h4>
        <ul>
          <li><strong>TP1:</strong> 1.5R — close 50% of position</li>
          <li><strong>TP2:</strong> 3R — close remainder</li>
          <li><strong>Trailing stop:</strong> Activates after TP1, trails by 1x ATR</li>
        </ul>

        <h4>Safety Limits</h4>
        <ul>
          <li>Max 3 concurrent positions</li>
          <li>Max $500 daily loss limit</li>
          <li>Max 10 trades per day</li>
          <li>10-minute cooldown per pair after closing</li>
        </ul>

        <h4>Scalp-Specific Safeguards</h4>
        <ul>
          <li><strong>Circuit Breaker:</strong> 3 consecutive losses = 15min pause; 5 = 1hr pause</li>
          <li><strong>Session Kill Switch:</strong> -1% session P&L = disable scalping</li>
          <li><strong>Spread Monitor:</strong> Auto-disables scalps when spread &gt; 0.08%</li>
          <li><strong>Slippage Guard:</strong> Blocks orders when estimated slippage &gt; 0.15%</li>
          <li><strong>Correlation Guard:</strong> Reduces size 50% for correlated pairs</li>
          <li><strong>Fee Check:</strong> Warns when fees &gt; 50% of gross profit</li>
        </ul>
      </>
    ),
  },
  'charts': {
    title: 'Reading Charts',
    content: (
      <>
        <h3>Chart Guide</h3>

        <h4>Candlestick Basics</h4>
        <p>Green candles = close &gt; open (bullish). Red candles = close &lt; open (bearish). Wicks show the high/low range.</p>

        <h4>Overlay Indicators</h4>
        <ul>
          <li><strong>EMA 9/21/50:</strong> Exponential moving averages for trend direction</li>
          <li><strong>SMA 200:</strong> Long-term trend (dashed white line)</li>
          <li><strong>Bollinger Bands:</strong> Volatility envelope around 20-period SMA</li>
          <li><strong>VWAP:</strong> Volume-weighted average price (dashed yellow)</li>
          <li><strong>Ichimoku Cloud:</strong> Multi-component trend system</li>
          <li><strong>Parabolic SAR:</strong> Dots above/below price for trend reversal</li>
          <li><strong>Supertrend:</strong> ATR-based trend line</li>
        </ul>

        <h4>Lower Panel Indicators</h4>
        <ul>
          <li><strong>Volume:</strong> Bar chart of trading volume per candle</li>
          <li><strong>RSI:</strong> Momentum oscillator (0-100). Overbought &gt;70, Oversold &lt;30</li>
          <li><strong>MACD:</strong> Trend momentum with signal line and histogram</li>
          <li><strong>ATR:</strong> Volatility measurement in price units</li>
          <li><strong>ADX:</strong> Trend strength (0-100). Strong trend &gt;25</li>
        </ul>

        <h4>Interaction</h4>
        <ul>
          <li><strong>Pan:</strong> Click and drag to scroll through history</li>
          <li><strong>Zoom:</strong> Mouse wheel to zoom in/out on candles</li>
          <li><strong>Crosshair:</strong> Hover to see OHLCV data for any candle</li>
        </ul>
      </>
    ),
  },
  'ai': {
    title: 'AI Analyst',
    content: (
      <>
        <h3>AI Market Analyst</h3>
        <p>The AI Assistant panel provides intelligent market analysis powered by large language models.</p>

        <h4>Features</h4>
        <ul>
          <li><strong>Market Analysis:</strong> Ask about current market conditions, support/resistance levels, or trade ideas</li>
          <li><strong>Strategy Suggestions:</strong> Get recommendations based on current regime and indicators</li>
          <li><strong>Risk Assessment:</strong> Ask the AI to evaluate a potential trade setup</li>
          <li><strong>Education:</strong> Ask questions about technical analysis concepts</li>
        </ul>

        <h4>Tips</h4>
        <ul>
          <li>Be specific: "What do the indicators say about BTC on the 1H chart?" works better than "What should I trade?"</li>
          <li>The AI sees your current indicators and regime data</li>
          <li>Always validate AI suggestions with your own analysis</li>
          <li>The AI does not execute trades — it only provides analysis</li>
        </ul>
      </>
    ),
  },
  'backtesting': {
    title: 'Backtesting',
    content: (
      <>
        <h3>Backtesting Engine</h3>
        <p>Test any strategy against historical candle data to evaluate performance before risking real capital.</p>

        <h4>How to Backtest</h4>
        <ol>
          <li>Open Backtesting from the bottom tab bar</li>
          <li>Select a strategy, pair, and timeframe</li>
          <li>Set starting capital and risk parameters</li>
          <li>Click "Run Backtest" — processing happens in a Web Worker (won't freeze UI)</li>
          <li>Review results: equity curve, trade list, and performance metrics</li>
        </ol>

        <h4>Key Metrics</h4>
        <ul>
          <li><strong>Total Return:</strong> % gain/loss from starting capital</li>
          <li><strong>Win Rate:</strong> % of profitable trades</li>
          <li><strong>Profit Factor:</strong> Gross profits / gross losses. &gt;1.5 is good</li>
          <li><strong>Max Drawdown:</strong> Largest peak-to-trough decline. &lt;15% is acceptable</li>
          <li><strong>Sharpe Ratio:</strong> Risk-adjusted return. &gt;1.0 is good, &gt;2.0 is excellent</li>
          <li><strong>Average Duration:</strong> How long positions are held</li>
        </ul>

        <h4>Caveats</h4>
        <ul>
          <li>Backtests use historical data — past performance doesn't guarantee future results</li>
          <li>Slippage and fees are simulated but may differ from live execution</li>
          <li>Order book dynamics (L2 data) are not available in backtests</li>
        </ul>
      </>
    ),
  },
  'scalping': {
    title: 'Scalping Best Practices',
    content: (
      <>
        <h3>Scalping Best Practices</h3>
        <p>Scalping involves taking many small profits from tiny price movements. It requires discipline, tight risk management, and awareness of trading costs.</p>

        <h4>Prerequisites</h4>
        <ul>
          <li>Only scalp liquid pairs (BTC, ETH, SOL) with tight spreads</li>
          <li>Use 1-minute or 5-minute timeframes</li>
          <li>Monitor spread status — green only (use Scalp Dashboard)</li>
          <li>Understand your fee tier and minimum profitable move</li>
        </ul>

        <h4>Key Rules</h4>
        <ol>
          <li><strong>Respect the circuit breaker.</strong> If you hit 3 losses in a row, the system pauses you for 15 minutes. Use this time to reassess.</li>
          <li><strong>Check fee impact first.</strong> Use the Fee Calculator to ensure your target covers round-trip fees.</li>
          <li><strong>Time stops are critical.</strong> Scalp strategies have 2-5 minute max durations. If the trade hasn't worked by then, exit.</li>
          <li><strong>Watch correlations.</strong> Don't scalp BTC and ETH simultaneously — they're highly correlated.</li>
          <li><strong>Session limits.</strong> Set a daily P&L target and loss limit. Walk away when either is hit.</li>
        </ol>

        <h4>Common Mistakes</h4>
        <ul>
          <li>Scalping during high-spread periods (red spread status)</li>
          <li>Ignoring fees — a 0.15% target with 0.12% round-trip fees leaves almost nothing</li>
          <li>Revenge trading after losses — let the circuit breaker do its job</li>
          <li>Scalping low-volume altcoins with wide spreads</li>
          <li>Not using time stops — holding a scalp for 30 minutes defeats the purpose</li>
        </ul>
      </>
    ),
  },
  'troubleshooting': {
    title: 'Troubleshooting',
    content: (
      <>
        <h3>Troubleshooting</h3>

        <h4>WebSocket Disconnects</h4>
        <p>The connection automatically reconnects with exponential backoff. If stuck, click the connection status indicator in the top bar to force reconnect.</p>

        <h4>No Candle Data</h4>
        <ul>
          <li>Check that the proxy server is running on port 3002</li>
          <li>Verify your API key is valid in Settings</li>
          <li>Try switching timeframes or pairs</li>
        </ul>

        <h4>Orders Not Executing</h4>
        <ul>
          <li>Ensure you're in the correct mode (Paper vs Live)</li>
          <li>Check that you have sufficient balance</li>
          <li>Verify the bot is turned ON and strategies are enabled</li>
          <li>Check the signal log for generated but unexecuted signals</li>
        </ul>

        <h4>Indicators Not Showing</h4>
        <ul>
          <li>Some indicators need a minimum number of candles (e.g., SMA 200 needs 200 bars)</li>
          <li>Check that the indicator is enabled in the Indicator Picker or toolbar pills</li>
          <li>Try refreshing the page if indicators appear stuck</li>
        </ul>

        <h4>Performance Issues</h4>
        <ul>
          <li>Indicator calculations run in Web Workers and shouldn't block the UI</li>
          <li>If the chart is laggy, try reducing the number of enabled overlay indicators</li>
          <li>Clear IndexedDB cache in Settings if the app feels slow</li>
        </ul>
      </>
    ),
  },
};

export default function GuideContent({ activeSection, searchQuery }) {
  const filteredSections = useMemo(() => {
    if (!searchQuery) return [activeSection];
    const q = searchQuery.toLowerCase();
    return Object.entries(CONTENT)
      .filter(([, sec]) => {
        const text = sec.title.toLowerCase();
        return text.includes(q);
      })
      .map(([id]) => id);
  }, [activeSection, searchQuery]);

  const sectionsToShow = searchQuery ? filteredSections : [activeSection];

  return (
    <div className="guide-content">
      {sectionsToShow.map((sectionId) => {
        const sec = CONTENT[sectionId];
        if (!sec) return null;
        return (
          <div key={sectionId} className="guide-section" id={`guide-${sectionId}`}>
            {sec.content}
          </div>
        );
      })}
      {sectionsToShow.length === 0 && (
        <div className="guide-no-results">No results found for "{searchQuery}"</div>
      )}
    </div>
  );
}
