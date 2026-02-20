# Claude Code Prompt — Cerebro Crypto: Bot UI Overhaul, User Guide, Scalping Strategy Engine

## Context

You are working on Cerebro Crypto, a standalone React cryptocurrency trading terminal using the Coinbase Advanced Trade API. The full build spec is in `CEREBRO_CRYPTO_BUILD_PLAN.md`. This prompt covers four targeted enhancements to the existing plan.

---

## Task 1 — Reformat the Bot / Strategy Controls Section UI

The current Strategy Controls panel (Section 6 in the build plan) has a layout problem: strategies are cramped and the Range Scalp strategy gets cut off. Completely redesign the Bot / Strategy Controls panel with the following requirements:

### Layout Requirements
- **Each strategy gets its own full-width card** — no truncation, no overflow hidden
- Cards should be collapsible/expandable (accordion style) — collapsed shows: strategy name, regime badge (🟢/🟡), enabled toggle, and a one-line summary
- Expanded view shows ALL fields clearly:
  - Entry conditions (each condition on its own line with a checkbox showing if currently met)
  - Exit conditions
  - Stop-loss logic
  - Take-profit levels (TP1, TP2)
  - Trailing stop behavior
  - "Best for" ticker recommendations
  - Current signal status: "Scanning" / "Signal Detected" / "Entry Triggered" / "No Signal"
- **Scrollable container** with max-height so the panel never pushes other UI elements off screen
- **Strategy grouping by regime** — clear section headers: "🟢 Bullish Strategies", "🟡 Choppy/Ranging Strategies", "🔴 Bearish (Capital Preservation)"
- Each strategy card has:
  - Enable/disable toggle
  - "Backtest This Strategy" shortcut button
  - Last signal timestamp
  - Win rate badge (from historical trades if available)

### Range Scalp (Strategy E) — Full Specification (currently truncated)
Make sure this is fully visible and implemented:

```
Strategy E: Range Scalp
Regime: Choppy/Ranging 🟡

Detection:
- Auto-detect support (lowest swing lows) and resistance (highest swing highs) over last 50 bars on the active timeframe
- Range is valid only if width is > 1 ATR(14) and < 5 ATR(14) — filters out noise and breakouts
- Require at least 2 touches of both support and resistance zones to confirm the range

Entry:
- Price approaches support zone (within 0.3% of detected support level)
- Confirmation: bullish engulfing OR hammer candle closes at/near support
- RSI < 40 and turning up (current RSI > previous RSI)
- Volume on signal bar > 1.2x 10-bar average (participation confirmation)

Exit:
- Price reaches resistance zone (within 0.3% of detected resistance)
- OR RSI > 65 (momentum fading near top of range)

Stop-Loss:
- 0.5 ATR(14) below the support zone
- Hard stop: if price closes a full candle below support, immediate market exit

Take Profit:
- TP1: 60% of range width — close 50% of position
- TP2: 90% of range width — close remaining 50%
- No trailing stop (range-bound, not trending)

Position Sizing Override:
- Use 3% of portfolio (reduced from default 5%) — range scalps have tighter R:R
- Max 2 concurrent range scalps across all pairs

Best For: DOGE-USD, SHIB-USD, ADA-USD, XRP-USD during low-volatility consolidation phases
Timeframe: 5m and 15m charts preferred

Invalidation:
- If price breaks above resistance by > 1 ATR, cancel all range scalp entries (regime may be shifting)
- If ADX rises above 25 while in a range scalp, tighten stop to breakeven
```

### Bot Master Controls (always visible at top of strategy panel)
- **Bot Status Toggle**: ON / OFF with large clear indicator
- **Current Regime Badge**: 🟢 BULLISH / 🟡 CHOPPY / 🔴 BEARISH with timestamp of last regime change
- **Active Strategies Count**: "3 of 5 strategies enabled"
- **Open Signals**: count of pairs currently showing valid entry signals
- **Bot Activity Log**: last 5 bot actions in a mini scrollable list (e.g., "14:23:05 — BTC-USD: Momentum entry signal detected", "14:22:01 — Regime changed to BULLISH")
- **Emergency Stop All**: big red button — immediately cancels all open orders and disables bot

---

## Task 2 — Add Comprehensive User Guide Section

Create a `src/components/Guide/` component that is accessible from the bottom tab bar (add "Guide" tab next to Backtesting, Alert Manager, Portfolio History, Settings). This should be a full in-app guide rendered as a scrollable, searchable document with a table of contents sidebar.

### Guide Content — Write All of This:

#### 1. Getting Started
- What Cerebro Crypto is and its philosophy (long-only, regime-adaptive, risk-first)
- First-time setup checklist:
  1. Generate Coinbase Advanced Trade API keys (link to Coinbase docs)
  2. Enter keys in Settings → Connection
  3. Click "Test Connection" to verify
  4. Start in Paper Mode (default) — do NOT switch to live until comfortable
  5. Add pairs to your watchlist
  6. Select a chart timeframe and familiarize yourself with the chart tools
  7. Enable at least one strategy per regime
  8. Set your risk parameters in Settings → Trading Defaults
  9. Turn on the bot and monitor

#### 2. Understanding the Interface
- Annotated screenshot descriptions of each panel (Watchlist, Chart, Order Book, Order Entry, Positions, Trade Log, Strategy Controls, AI Assistant)
- What every badge, color, and indicator means
- How to read the Top Bar (regime badge, P&L, mode, WebSocket status)

#### 3. Paper vs Live Trading
- Paper mode uses real Coinbase prices but simulated execution with 0.05% slippage
- Paper portfolio starts at $25,000 (configurable)
- All paper trades are logged identically to live trades
- To switch to live: Settings → type "LIVE TRADING" in confirmation modal
- Recommendation: Run paper for at least 2 weeks and review backtest results before going live

#### 4. Regime Detection Explained
- What each regime means in plain English
- How the system detects each regime (SMA 200, EMA stack, ADX, RSI, Bollinger width)
- Why the bot pauses in bearish regime ("capital preservation" — the best trade is no trade)
- How regime transitions work and what to expect (regime changes are logged with timestamps)
- Common regime patterns in crypto (weekend chop, news-driven regime shifts, etc.)

#### 5. Strategy Guide (Plain English for Each Strategy)
For each of the 5 strategies (A through E), write:
- **What it does** in one sentence
- **When it works best** (regime + market condition + best tickers)
- **How it enters** — step by step, no jargon
- **How it exits** — each exit path explained
- **What the stop-loss does** and why
- **Example scenario** — walk through a hypothetical BTC-USD trade from signal to close
- **What to watch out for** — common failure modes and false signals

#### 6. Risk Management Guide
- Why position sizing matters more than win rate
- How the R-multiple system works (1R = your risk, 1.5R TP1 = 1.5x your risk as profit)
- Max concurrent positions and why 3 is the default
- Daily loss limits — what happens when breached (bot auto-pauses, manual override available)
- Per-pair cooldown — prevents revenge trading the same pair
- How to adjust risk settings for your comfort level (conservative, moderate, aggressive presets)

#### 7. Reading the Charts
- How to switch timeframes and what each is best for
- Indicator cheat sheet:
  - EMA 9/21/50 — trend direction and momentum
  - SMA 200 — long-term trend (bull/bear dividing line)
  - VWAP — institutional fair value for the day
  - Bollinger Bands — volatility and mean reversion zones
  - RSI — momentum / overbought / oversold
  - MACD — trend changes and momentum shifts
  - ATR — how volatile the asset is (used for stop placement)
  - ADX — how strong the current trend is (not direction, just strength)
- How to draw support/resistance lines
- How to use the crosshair for data reading

#### 8. Using the AI Market Analyst
- What context is automatically sent with each message
- Best prompts for different situations
- Limitations: AI does not execute trades or modify settings — it's advisory only

#### 9. Backtesting Guide
- How to set up a backtest (pair, timeframe, date range, strategy, capital)
- How to interpret results (equity curve, drawdown, Sharpe, profit factor)
- Common pitfalls: overfitting, survivorship bias, ignoring fees/slippage
- Recommended: test each strategy on at least 6 months of data across multiple pairs

#### 10. Scalping Best Practices (NEW — critical for this user's workflow)
- What scalping is: high-frequency, small-profit trades exploiting micro price movements
- Why crypto is uniquely suited for scalping (24/7 markets, high volatility, deep liquidity on top pairs)
- Ideal scalping conditions: high volume sessions (US market open overlap ~9:30-11:30 AM ET, London open ~3-5 AM ET), tight spreads, clear micro-structure
- Scalping risk rules:
  - Tighter stops (0.5-1% max)
  - Smaller position sizes (2-3% of portfolio)
  - Higher trade frequency but lower per-trade risk
  - Exit quickly — don't let scalps turn into swing trades
  - Fees matter enormously at this frequency — always factor in Coinbase maker/taker rates
- Which strategies are best for scalping:
  - VWAP Reclaim on 1m/5m for BTC and ETH
  - Range Scalp on 5m for sideways altcoins
  - Mean Reversion on 1m when Bollinger Bands are tight
- Time-of-day heatmap: when each pair tends to have the most scalp-friendly conditions

#### 11. Troubleshooting
- WebSocket disconnects and what to do
- Orders rejected — common reasons (insufficient balance, pair delisted, rate limited)
- Candle data gaps
- JWT token expiration issues
- Bot not entering trades (check: is regime bearish? are strategies enabled? is daily limit hit?)

---

## Task 3 — Add Common Technical Indicators as a Configurable Feature

Expand the indicator engine (Section 4 and the Web Worker) to include these additional commonly-used technical indicators. All should be toggleable from a new "Indicators" dropdown/panel on the chart toolbar.

### New Overlay Indicators (on main price chart)
- **Ichimoku Cloud** (Tenkan 9, Kijun 26, Senkou Span A/B 52) — plot cloud shading between Span A and Span B, green when bullish, red when bearish
- **Parabolic SAR** (acceleration 0.02, max 0.2) — dots above/below price showing trend direction and dynamic stop levels
- **Supertrend** (period 10, multiplier 3) — single line that flips between support (green below price) and resistance (red above price)
- **Keltner Channels** (EMA 20, ATR multiplier 1.5) — similar to Bollinger but ATR-based, useful for breakout detection
- **Pivot Points** (Standard, daily) — S1/S2/S3, R1/R2/R3, and pivot line. Auto-calculate from previous day's high/low/close
- **Anchored VWAP** — user can click a candle to anchor VWAP from that specific point (in addition to the daily VWAP that already resets at midnight)
- **Hull Moving Average (HMA 20)** — faster and smoother than EMA, good for scalping trend detection
- **TEMA (Triple EMA, period 14)** — even more responsive than HMA for ultra-short timeframes

### New Lower Panel Indicators (tabbed, below chart)
- **Stochastic RSI** (14, 14, 3, 3) — K and D lines, overbought > 80, oversold < 20. More sensitive than standard RSI for scalping
- **Williams %R** (14) — momentum oscillator, overbought < -20, oversold > -80
- **CCI (Commodity Channel Index, 20)** — identifies cyclical turns, overbought > 100, oversold < -100
- **OBV (On-Balance Volume)** — cumulative volume flow, divergence from price = potential reversal
- **MFI (Money Flow Index, 14)** — volume-weighted RSI, overbought > 80, oversold < 20
- **Chaikin Money Flow (CMF, 20)** — buying/selling pressure, positive = accumulation, negative = distribution
- **Rate of Change (ROC, 12)** — percentage change in price over N periods, useful for momentum confirmation
- **TRIX (15)** — triple-smoothed EMA rate of change, signal line crossovers = trend changes
- **Volume Profile** (fixed range over visible chart) — horizontal histogram showing volume at each price level. Highlights high-volume nodes (HVN) as support/resistance and low-volume nodes (LVN) as potential breakout zones

### Indicator Management UI
- **Indicator Picker Panel**: searchable dropdown organized by category (Trend, Momentum, Volume, Volatility)
- Each indicator has:
  - Enable/disable toggle
  - Configurable parameters (period, multiplier, etc.) with sensible defaults
  - Color picker for the indicator line/fill
  - "Reset to defaults" button
- **Indicator Presets**: save/load indicator combinations
  - Built-in presets: "Scalping" (HMA, Stoch RSI, VWAP, Volume Profile), "Swing" (EMA 9/21/50, MACD, RSI, Ichimoku), "Mean Reversion" (Bollinger, RSI, MFI, CCI)
  - User can create and name custom presets, saved to localStorage
- **Max active indicators**: warn if > 8 active simultaneously (performance). Web Worker handles all calculations.

### Integration with Strategy Engine
- Strategies can now reference any enabled indicator in their conditions
- Add to each strategy config: `requiredIndicators[]` — auto-enable these when strategy is activated
- If a strategy requires an indicator that's disabled, show a warning: "Strategy X requires Stochastic RSI — enable it?"

---

## Task 4 — Determine Optimal Scalping Strategies for Top 5 Tickers

### Objective
Research and define the best scalping approach for each of the top 5 most popular/liquid crypto tickers on Coinbase. The user intends to actively scalp these. The strategies should be concrete, implementable, and tuned for the specific behavior of each asset.

### Top 5 Tickers to Analyze
1. **BTC-USD** — highest liquidity, tightest spreads, macro-driven
2. **ETH-USD** — second most liquid, correlates with BTC but has its own catalysts (L2 activity, ETF flows, staking yields)
3. **SOL-USD** — high beta, very volatile, tends to make sharp moves with momentum
4. **DOGE-USD** — meme-driven, high retail volume, prone to sudden spikes and dumps
5. **XRP-USD** — news-driven (regulatory catalysts), tends to range then spike violently

### For Each Ticker, Define:

#### A. Ticker Profile
- Average daily volume (USD)
- Typical spread on Coinbase
- Average True Range (14) on 1m, 5m, 15m timeframes
- Volatility classification: Low / Medium / High / Extreme
- Correlation with BTC (does it lead, lag, or move independently?)
- Best scalping sessions (time of day in ET/UTC)
- Known behavioral patterns (e.g., "SOL tends to trend sharply then consolidate", "DOGE spikes on social media volume surges")

#### B. Recommended Primary Scalping Strategy
Pick from existing strategies (A-E) or define a **new custom scalp strategy** optimized for this specific ticker. For each:
- **Timeframe**: which chart TF to use (1m, 5m, or 15m)
- **Entry Logic**: exact conditions, referencing specific indicators
- **Exit Logic**: targets and trailing behavior
- **Stop Logic**: ATR-based or fixed %, with specific values
- **Position Size**: % of portfolio (may differ from default 5%)
- **Max Trades Per Session**: recommended cap for this ticker
- **Expected Win Rate**: realistic estimate based on the strategy characteristics
- **Expected R:R Ratio**: risk-to-reward per trade
- **Edge**: what specifically gives this strategy an advantage on this ticker

#### C. Custom Scalp Strategies to Add (implement these as new strategies F, G, H)

##### F) Micro VWAP Scalp (optimized for BTC-USD, ETH-USD)
- **Timeframe:** 1m
- **Entry:** Price pulls back to VWAP on 1m chart. Stochastic RSI crosses up from below 20. Volume on signal bar > 1.5x 5-bar average. Price is above HMA(20) — confirming micro uptrend.
- **Exit:** +0.15% to +0.25% gain (BTC) or +0.2% to +0.35% gain (ETH) — these are tight scalp targets calibrated to typical spread + fees
- **Stop:** 0.1% below VWAP (BTC) or 0.15% below VWAP (ETH)
- **Trailing:** After +0.1% profit, trail stop at VWAP level
- **Max duration:** 5 minutes — if target not hit, exit at market (scalps should not age)
- **Cooldown:** 2 minutes between trades on same pair
- **Position size:** 3% of portfolio
- **Best during:** US market hours (9:30 AM - 4:00 PM ET) when volume is highest

##### G) Momentum Spike Scalp (optimized for SOL-USD, DOGE-USD)
- **Timeframe:** 1m
- **Detection:** Volume spike > 3x 20-bar average on a single 1m bar. Price move > 0.5% in that bar.
- **Entry:** On the first pullback candle (close below previous bar's close but above the 50% retracement of the spike), enter long IF RSI < 75 and OBV is still rising
- **Exit:** Target the spike high (retest). TP1: 60% of spike range (close half). TP2: 90% of spike range.
- **Stop:** Below the pullback candle low, minimum 0.3%
- **Max duration:** 3 minutes
- **Position size:** 2% of portfolio (higher risk due to volatility)
- **Invalidation:** If the pullback retraces > 70% of the spike, skip the trade (momentum is gone)
- **Best during:** Any time — these are event-driven, not session-dependent

##### H) Order Book Imbalance Scalp (optimized for XRP-USD, any ranging pair)
- **Timeframe:** 1m, using Level 2 order book data
- **Detection:** Bid-side volume in top 5 levels > 2x ask-side volume (buying pressure imbalance)
- **Entry:** Price at or near bid support with imbalance confirmed. RSI < 50 (not overbought). Confirmation: a green 1m candle closes.
- **Exit:** Target: midpoint between current price and nearest resistance. Usually +0.1% to +0.2%.
- **Stop:** If imbalance flips (ask volume > bid volume by 1.5x), exit immediately regardless of P&L
- **Max duration:** 2 minutes — order book conditions change rapidly
- **Position size:** 2% of portfolio
- **Cooldown:** 3 minutes
- **Best for:** Ranging markets, works across all sessions but best when spread is tight

### D. Critical Scalping Insights the User May Have Overlooked

Include all of the following in the implementation and guide:

1. **Fee Drag is the #1 Scalping Killer**
   - At Coinbase's standard taker fee (~0.06% for high-volume tiers, up to 0.60% for low-volume tiers), a round-trip scalp costs 0.12% to 1.2% in fees alone
   - For scalping to be viable, the user MUST be on a competitive fee tier. Display current fee tier prominently in the Scalping Dashboard.
   - Add a **Fee Impact Calculator**: before every scalp entry, show "Target profit: $X | Estimated fees: $Y | Net profit: $Z". If net profit < $1 or fees > 50% of gross profit, flash a warning.
   - Consider using limit orders instead of market orders for entries (maker fees are lower or zero). Add a "Limit at Best Bid" scalp entry mode.

2. **Slippage on Low-Liquidity Pairs**
   - DOGE and SHIB can have wide spreads during low-volume hours. The paper trading simulator uses 0.05% slippage, but real slippage on these pairs can be 0.1-0.3% during off-peak.
   - Add a **dynamic slippage estimator**: use Level 2 book depth to estimate realistic slippage before entry. If estimated slippage > 0.15% on a scalp, block the trade or warn.

3. **Overtrading / Death by a Thousand Cuts**
   - Scalpers are prone to overtrading. Implement a **scalp-specific circuit breaker**:
     - If 3 consecutive scalp losses → pause scalp strategies for 15 minutes
     - If 5 losing scalps in a session → pause for 1 hour
     - If net session P&L from scalps goes negative by > 1% of portfolio → disable scalp strategies until manual re-enable
   - Show a **Scalp Session Scorecard** widget: current streak, session W/L, net P&L, avg trade duration, fee total

4. **Time Decay of Scalp Signals**
   - Scalp entries are only valid for seconds, not minutes. Implement **signal expiry**: if a scalp entry signal is detected but execution hasn't happened within 15 seconds (for 1m TF) or 30 seconds (for 5m TF), expire the signal and do NOT enter. Stale scalp entries are a major source of losses.

5. **Correlation Risk on Simultaneous Scalps**
   - If the bot is scalping BTC-USD and ETH-USD simultaneously, they are ~85% correlated. A sudden BTC drop will likely hit both positions. Implement a **correlation guard**: if 2+ open scalp positions are in BTC+ETH (or any pair with > 70% correlation), reduce position size by 50% on the second entry, or block it entirely.

6. **Spread Monitoring**
   - Add a real-time **Spread Monitor** widget showing current bid-ask spread for each watched pair. Color code: green (< 0.03% spread, ideal for scalping), yellow (0.03-0.08%, acceptable), red (> 0.08%, avoid scalping). Auto-disable scalp strategies on a pair if spread exceeds the red threshold.

7. **Scalp-Specific Timeframe: Tick Chart or 15-Second Bars**
   - Consider adding a synthetic 15-second bar chart aggregated from the `market_trades` WebSocket channel. For scalpers, 1m candles are actually slow — many scalp opportunities exist within a single 1m bar. Even if not implemented initially, leave a `// TODO: 15s synthetic bars from trade stream` placeholder.

8. **Partial Fill Risk**
   - On limit order scalps, partial fills are common. If only 30% of a scalp order fills, the risk/reward math changes. Implement **minimum fill threshold**: if less than 50% of a limit scalp order fills within 10 seconds, cancel the remainder and manage the partial position with tighter stops.

9. **Market Microstructure Awareness**
   - Add **trade flow analysis**: track the ratio of market buy vs market sell volume over the last 60 seconds from the `market_trades` channel. Display as a buy/sell pressure bar. This is essentially a real-time order flow tool. When buy flow > 60% of total, bias is bullish for scalps. When sell flow > 60%, skip long scalps.

10. **Session Performance Tracking**
    - Scalping requires honest performance review. Add a **Scalp Analytics Dashboard** (new tab or section):
      - P&L curve by hour of day (heatmap showing which hours are profitable)
      - Win rate by ticker
      - Win rate by strategy
      - Average hold time for winners vs losers
      - Fee drag percentage (total fees / total gross profit)
      - Expectancy per trade: (win rate × avg win) - (loss rate × avg loss) - avg fees
      - "Should you be scalping?" verdict: if expectancy is negative over 50+ trades, display a recommendation to switch to swing strategies

---

## Implementation Order

1. **Reformat Strategy Controls panel** — accordion cards, full Range Scalp spec, bot master controls
2. **Add new indicators** to the Web Worker and chart — Ichimoku, Parabolic SAR, Supertrend, Keltner, Pivots, Stoch RSI, Williams %R, CCI, OBV, MFI, CMF, ROC, TRIX, Volume Profile, HMA, TEMA, Anchored VWAP
3. **Add indicator picker UI** with presets and parameter configuration
4. **Implement new scalp strategies F, G, H** with all the specified entry/exit/stop logic
5. **Add scalp-specific safeguards** — fee calculator, slippage estimator, circuit breakers, signal expiry, correlation guard, spread monitor
6. **Add ticker profiles** for BTC, ETH, SOL, DOGE, XRP with recommended strategies
7. **Build the Guide component** with all sections written out as specified above
8. **Add Scalp Analytics Dashboard** and Session Scorecard widget
9. **Wire indicator presets** — "Scalping" preset auto-enables HMA, Stoch RSI, VWAP, Volume Profile
10. **Test everything in paper mode** — verify all new strategies generate signals correctly, indicators render without lag, and the guide is fully navigable

---

## File Structure Additions

```
src/
├── components/
│   ├── StrategyControls/
│   │   ├── StrategyCard.jsx          ← accordion card per strategy
│   │   ├── BotMasterControls.jsx     ← top-level bot status/controls
│   │   ├── ScalpSessionScorecard.jsx ← live scalp performance widget
│   │   └── index.jsx
│   ├── Guide/
│   │   ├── GuideContent.jsx          ← all guide text/sections
│   │   ├── GuideSidebar.jsx          ← table of contents navigation
│   │   ├── GuideSearch.jsx           ← full-text search within guide
│   │   └── index.jsx
│   ├── IndicatorPicker/
│   │   ├── IndicatorList.jsx         ← searchable categorized list
│   │   ├── IndicatorConfig.jsx       ← parameter editor per indicator
│   │   ├── PresetManager.jsx         ← save/load indicator presets
│   │   └── index.jsx
│   ├── ScalpDashboard/
│   │   ├── ScalpAnalytics.jsx        ← P&L heatmap, win rates, expectancy
│   │   ├── SpreadMonitor.jsx         ← real-time bid-ask spread display
│   │   ├── TradeFlowBar.jsx          ← buy/sell pressure visualization
│   │   ├── FeeImpactCalculator.jsx   ← pre-trade fee/net profit display
│   │   └── index.jsx
│   └── ...existing components
├── strategies/
│   ├── cryptoMomentum.js             ← Strategy A
│   ├── breakout.js                   ← Strategy B
│   ├── vwapReclaim.js                ← Strategy C
│   ├── meanReversion.js              ← Strategy D
│   ├── rangeScalp.js                 ← Strategy E (full implementation)
│   ├── microVwapScalp.js             ← Strategy F (NEW)
│   ├── momentumSpikeScalp.js         ← Strategy G (NEW)
│   ├── orderBookImbalanceScalp.js    ← Strategy H (NEW)
│   └── index.js                      ← strategy registry
├── config/
│   ├── constants.js
│   ├── tickerProfiles.js             ← BTC/ETH/SOL/DOGE/XRP profiles
│   └── indicatorDefaults.js          ← default params for all indicators
└── utils/
    ├── indicators.js                 ← expanded with all new indicators
    ├── correlationGuard.js           ← cross-pair correlation check
    ├── slippageEstimator.js          ← Level 2 based slippage calc
    ├── scalpCircuitBreaker.js        ← overtrading protection
    └── ...existing utils
```

---

## Key Reminders

- All new indicator math runs in the Web Worker — never on the main thread
- All new strategies follow the same long-only enforcement
- Scalp strategies have TIGHTER risk params than swing strategies — do not use the global defaults without override
- Every new strategy must be backtestable through the existing backtest engine
- The Guide component should be plain React (no external CMS) — all content is hardcoded JSX/markdown
- Performance: with potentially 15+ indicators active, ensure the Web Worker batches calculations efficiently. Profile and add throttling if needed.
