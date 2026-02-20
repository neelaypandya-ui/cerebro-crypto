# Cerebro Crypto — Full Build Plan for Claude Code

## Overview

Build a standalone React application called **Cerebro Crypto** — a dedicated cryptocurrency trading terminal that operates identically to the Cerebro stock trading app in workflow, aesthetic, and philosophy, but is purpose-built for 24/7 crypto markets using the **Coinbase Advanced Trade API exclusively** for both data and order execution.

- Runs as a **separate application on port 3001**
- Express proxy server on **port 3002** (keeps API keys server-side)
- Paper trading simulator built-in (Coinbase has no native paper environment)
- Long-only trading enforced at the order submission level — no short selling

---

## Performance & Architecture Principles

Apply these throughout the entire build:

- Single WebSocket connection to Coinbase Advanced Trade — no redundant connections
- All WebSocket message handling through a centralized message bus — no per-component subscriptions
- Throttle UI re-renders: price tick updates batched at 250ms intervals via `useRef` + `requestAnimationFrame`, not raw `setState` on every tick
- Memoize all computed values (indicators, regime detection, P&L) with `useMemo` / `useCallback`
- Virtualize long lists (trade log, order history) with `react-window`
- Web Worker for all indicator calculations (EMA, RSI, MACD, Bollinger Bands, ATR, ADX) — never block the main thread with math
- Chart updates via direct canvas mutation (lightweight-charts), not full React re-renders
- Lazy load the backtesting engine — only imported when user opens the backtest panel
- `localStorage` for settings/config, `IndexedDB` for trade history and cached OHLCV data
- No unnecessary dependencies — audit every import

---

## Section 1 — Coinbase Advanced Trade API Connection

### Authentication
- Coinbase Advanced Trade uses API Key + Secret (Ed25519)
- JWT token generation required for each request — handled in the Express proxy
- All REST calls from the client hit `/api/*` on the proxy, which forwards to Coinbase with proper auth headers
- Keys stored in `.env` file only — never in client-side code

### REST API
- **Base URL:** `https://api.coinbase.com/api/v3/brokerage`
- **Key endpoints:**
  - `GET /accounts` — portfolio balances
  - `GET /products` — available trading pairs
  - `GET /products/{product_id}/candles` — historical OHLCV
  - `GET /products/{product_id}/ticker` — current price/stats
  - `GET /orders` — order history
  - `POST /orders` — place order
  - `DELETE /orders` — cancel order
  - `GET /portfolios` — portfolio summary
  - `GET /transactions_summary` — fee tier info

### WebSocket
- **URL:** `wss://advanced-trade-ws.coinbase.com`
- **Channels:**
  - `ticker` — real-time price ticks for watchlist pairs
  - `candles` — live 1m candle updates for charted pair
  - `market_trades` — recent trades feed
  - `level2` — order book depth
  - `user` — order status updates and fills (authenticated)
- Single persistent connection handling all subscriptions
- Auto-reconnect with exponential backoff (1s, 2s, 4s, 8s, max 30s)
- Heartbeat every 30s
- On reconnect: resubscribe to all active channels automatically
- Connection status indicator in top bar: green = connected, yellow = reconnecting, red = disconnected

### Paper Trading Simulator
- Coinbase has no native paper trading environment — implement a built-in simulator
- Simulated orders execute at live Coinbase prices with realistic slippage (0.05%)
- Virtual portfolio with configurable starting balance (default $25,000)
- Full position tracking, P&L, and trade history — identical UX to live mode
- Paper portfolio stored in IndexedDB, persists across sessions
- Reset paper account button in settings
- **PAPER MODE:** yellow badge + subtle yellow border on all panels
- **LIVE MODE:** red badge + subtle red border on all panels
- Switching to LIVE requires typing `LIVE TRADING` in a confirmation modal
- Proxy intercepts `POST /api/orders` in paper mode — nothing forwarded to Coinbase

---

## Section 2 — Supported Trading Pairs

Default pairs (user can add/remove any Coinbase-listed pair):

```
BTC-USD, ETH-USD, SOL-USD, AVAX-USD, LINK-USD, DOGE-USD,
XRP-USD, ADA-USD, DOT-USD, MATIC-USD, LTC-USD, BCH-USD,
SHIB-USD, UNI-USD, ATOM-USD, NEAR-USD, APT-USD, ARB-USD
```

On startup: fetch full list of available pairs from `/products` endpoint and populate a searchable pair picker for the watchlist.

---

## Section 3 — Real-Time Market Data

### Watchlist Panel (left sidebar)
- Live price with directional color flash (green = up tick, red = down tick)
- 24h change %
- 24h high / low
- Bid / ask spread (from ticker channel)
- 24h volume in USD
- Sortable columns: name, price, change %, volume
- Star/favorite system — favorited pairs shown at top
- Add/remove pairs — persisted to `localStorage`

### Mini Order Book (collapsible)
- Top 10 bids and asks from `level2` channel
- Visual depth bar showing relative size at each level
- Spread displayed prominently

### Recent Trades Ticker
- Last 20 trades from `market_trades` channel
- Buy trades green, sell trades red
- Timestamp, price, quantity

---

## Section 4 — Interactive Charts

**Library:** `lightweight-charts` (TradingView) — canvas-based, performant

### Timeframes
- `1m` — live candles from Coinbase `candles` WebSocket channel
- `5m`, `15m` — aggregated from 1m bars in Web Worker
- `1H`, `4H`, `1D`, `1W` — fetched from Coinbase REST candles endpoint
- Cache all fetched OHLCV in IndexedDB — only fetch delta on return visits

### Overlay Indicators (each toggleable individually)
- EMA 9, EMA 21, EMA 50 (on by default)
- SMA 200
- VWAP (daily, resets at midnight UTC)
- Bollinger Bands (20, 2)
- Support/resistance zones (auto-detected from swing highs/lows)

### Lower Panel Indicators (tabbed)
- RSI (14) — overbought at 70, oversold at 30
- MACD (12, 26, 9) with histogram
- ATR (14) — volatility reference
- ADX (14) — trend strength, used in regime detection
- Volume bars (also shown as overlay on main chart)

### Chart Interactions
- Crosshair tooltip showing OHLCV + all active indicator values
- Click to draw horizontal support/resistance lines (right-click to remove)
- Auto-fit button
- Export chart as PNG

---

## Section 5 — Regime Detection Engine

Runs in Web Worker. Evaluated on every completed 1m bar. Result cached until next bar closes.

### BULLISH REGIME 🟢
- Price > SMA 200
- EMA 9 > EMA 21 > EMA 50 (bull stack aligned)
- ADX > 25 (trending)
- RSI between 45 and 75

### CHOPPY/RANGING REGIME 🟡
- ADX < 20 (no directional conviction)
- Price within 1.5% of SMA 200
- Bollinger Band width below its own 20-period average (contracting)

### BEARISH REGIME 🔴
- Price < SMA 200
- EMA 9 < EMA 21 (bearish alignment)
- ADX > 25 (trending down)
- **All bot entries paused** — existing positions managed by stops only
- Display "Capital Preservation Mode" banner

Display regime badge prominently in top bar. Log every regime change with timestamp to the event log.

---

## Section 6 — Trading Strategies

**All strategies are long-only. Short selling is blocked at the order submission level.**

### BULLISH REGIME Strategies

#### A) Crypto Momentum
- **Entry:** EMA9 crosses above EMA21 on 1H chart, confirmed by RSI > 50 and volume on signal bar > 1.5x 20-bar average
- **Exit:** EMA9 crosses below EMA21 OR trailing stop triggered
- **Best for:** BTC, ETH, SOL during strong trends

#### B) Breakout
- **Entry:** 4H candle closes above 20-period high with volume > 2x average
- **Stop:** Below the breakout candle low
- **TP1:** 1.5R — close 50% of position
- **TP2:** 3R — close remainder or trail
- **Best for:** Mid-cap alts building momentum

#### C) VWAP Reclaim
- **Entry:** Price dips below VWAP then closes a 15m candle back above it, RSI recovering from below 45 back toward 50
- **Stop:** Below the VWAP dip wick low
- **Best for:** BTC, ETH during high-volume sessions

### CHOPPY REGIME Strategies

#### D) Mean Reversion
- **Entry:** Price touches lower Bollinger Band, RSI < 35, bullish reversal candle confirmed on close
- **Exit:** Price reaches BB midline (SMA 20)
- **Stop:** 1 ATR below entry candle low
- **Best for:** Sideways markets with well-defined bands

#### E) Range Scalp
- Auto-detect support (recent swing lows) and resistance (recent swing highs) over last 50 bars
- **Entry:** Near support with confirmation candle
- **Exit:** Near resistance
- **Stop:** Below support level by 0.5 ATR
- **Best for:** Stable, ranging pairs

### BEARISH REGIME
- All strategies paused — no new entries

Strategy selections persisted to `localStorage`. User picks one or multiple strategies per regime from the strategy control panel. First valid signal fires.

---

## Section 7 — Risk Management

All settings configurable and saved to `localStorage`:

| Parameter | Default |
|---|---|
| Position size | 5% of portfolio |
| Stop-loss method | 2% below entry or 1.5x ATR14 |
| TP1 | 1.5R (closes 50% of position) |
| TP2 | 3R (closes remainder) |
| Trailing stop | Activates after TP1, trails by 1 ATR |
| Max concurrent positions | 3 |
| Max daily loss (USD) | Bot auto-pauses if breached |
| Max trades per day | 10 (circuit breaker) |
| Per-pair cooldown | 10 minutes after close |

### Pre-Order Validation (runs before every submission)
- Position size does not exceed available balance
- Order would not create a net short position
- Pair is not in cooldown window
- Daily trade and loss limits not exceeded
- Deduplication: pending order ID tracked, duplicate submissions rejected
- Slippage warning: if fill deviates > 0.5% from expected, log alert

---

## Section 8 — Order Execution

### Supported Order Types
- Market order
- Limit order (user-specified or auto-set at best bid/ask)
- Stop-limit order (for stop-loss placement)

### Order Lifecycle (tracked via `user` WebSocket channel)
```
PENDING → OPEN → FILLED / CANCELLED / REJECTED
```
- Partial fills tracked and displayed
- Failed orders: notify user with reason from Coinbase response
- Limit order timeout: if not filled within 60s (configurable), alert user and offer to convert to market order

### Manual Order Panel
- Pair selector
- Side: Buy only (long-only enforced — no sell button for new positions)
- Amount: toggle between crypto quantity and USD notional
- Order type selector
- Limit price (auto-populated from current ask, editable)
- Estimated total cost including Coinbase fee preview
- Confirmation modal in live mode

### Fee Awareness
- Fetch user's fee tier from `/transactions_summary`
- Display estimated fee on every order before submission
- Log actual fees from order fill data to trade log

---

## Section 9 — Position Management

### Active Positions Panel
- Pair, entry price, current price, quantity, entry time
- Unrealized P&L in USD and %
- Stop-loss level (editable inline — sends cancel + new stop order to Coinbase)
- TP1 and TP2 levels displayed
- Time in position counter
- Manual close button (market order, confirmation in live mode)
- Color coding: profitable = green, losing = red, within 0.5% of stop = flashing red

### Portfolio Summary (top bar)
- Total portfolio value (cash + open positions at market)
- Available cash (USD balance from `/accounts`)
- Total unrealized P&L
- Session realized P&L
- Session win rate

---

## Section 10 — Backtesting Engine

Lazy loaded. Runs entirely in Web Worker — UI never freezes during backtest.

**Data source:** Coinbase REST `/products/{product_id}/candles`  
**Cache:** IndexedDB — only fetch delta on return runs

### Inputs
- Pair, timeframe, date range
- Strategy selection
- Starting capital
- All risk parameters (use live settings or override)

### Outputs
- Equity curve chart
- Total return %
- CAGR (if range > 1 year)
- Max drawdown % and duration
- Win rate %
- Profit factor (gross profit / gross loss)
- Average winner / average loser
- Sharpe ratio (annualized)
- Total trades, average trade duration
- Trade-by-trade log

**Export:** Full results as CSV and JSON

---

## Section 11 — AI Market Analyst

Integrated collapsible chat panel (right side):

- Connects to Claude API (Anthropic) or OpenAI — configurable in settings
- System prompt establishes AI as a crypto market analyst familiar with all strategies
- Each message automatically prepends current market context:
  - Active pair and current price
  - Current regime
  - Live indicator values (RSI, MACD, ADX, BB position)
  - Open positions summary
  - Session P&L

### One-Click Prompt Buttons
- "Analyze current [pair] market conditions"
- "Is this a good entry for [active strategy]?"
- "What are key support and resistance levels for [pair]?"
- "Review my open positions"
- "What is the risk/reward for entering [pair] right now?"
- "Which pairs on my watchlist show the strongest setup today?"

Chat history persisted to `localStorage` (last 50 messages).

---

## Section 12 — Alerts & Notifications

### Alert Types
- Price alert: trigger when pair crosses user-defined level (above or below)
- Indicator alert: RSI overbought/oversold, MACD crossover, price crossing any EMA
- Strategy signal: valid entry detected by bot
- Risk alert: position within 0.5% of stop-loss level
- Daily loss limit nearing (warn at 80% of limit)
- Regime change
- WebSocket disconnect / reconnect

### Delivery
- In-app toast (bottom right, 5s auto-dismiss, click to pin)
- Browser push notification (permission requested on first run)
- Optional sound alert (toggle in settings)
- Alert log: full timestamped history for the session

---

## Section 13 — Trade Logging & Export

Every trade (paper and live) logged with:

| Field | Description |
|---|---|
| Timestamps | Open and close |
| Pair | e.g. BTC-USD |
| Strategy | Which strategy triggered the trade |
| Regime | Market regime at entry |
| Entry / Exit price | Exact fill prices |
| Quantity + USD notional | Position size |
| Fees paid | From Coinbase fill data or estimated in paper mode |
| Realized P&L | USD and % |
| Exit reason | TP1, TP2, trailing stop, manual close, stop-loss hit |
| Order IDs | Coinbase order IDs (live mode) |

Stored in IndexedDB — survives page refresh.  
Exportable as CSV and JSON at any time.

### Session Summary Modal (on bot stop)
- Total trades, winners, losers
- Win rate, profit factor
- Net P&L, best trade, worst trade, largest drawdown

---

## Section 14 — Paper vs Live Mode

| | Paper Mode | Live Mode |
|---|---|---|
| Badge | 🟡 Yellow | 🔴 Red |
| Border | Subtle yellow on all panels | Subtle red on all panels |
| Orders | Simulated at live prices | Real orders sent to Coinbase |
| Switch | One click | Must type `LIVE TRADING` to confirm |

- App remembers last used mode via `localStorage`
- Proxy checks mode flag — paper orders are intercepted and never forwarded

---

## Section 15 — Settings Panel

Slide-out panel via gear icon:

### Connection
- Coinbase API Key (masked)
- Coinbase API Secret (masked)
- Test Connection button — hits `/accounts` and confirms auth
- WebSocket status + manual reconnect button

### Paper Trading
- Starting virtual balance input
- Reset paper account button (with confirmation)
- View paper trade history

### Trading Defaults
- Default position size (% or USD)
- Stop-loss method and value
- TP1 and TP2 R multiples
- Trailing stop toggle
- Max positions, max daily loss, cooldown timer
- Auto-start bot on app load

### Display
- Default pair on chart open
- Default chart timeframe
- Sound alerts toggle
- Notification permission button

### AI Assistant
- Provider: Claude or OpenAI
- API key input
- Model selector

### Data Management
- Clear IndexedDB OHLCV cache
- Export all trade history
- Reset all settings to defaults

---

## Section 16 — UI/UX Layout

### Color Palette (match Cerebro exactly)
```
Background:       #0a0a0f
Card surfaces:    #12121a
Borders:          #1e1e2e
Primary accent:   #6c63ff
Bullish green:    #00d4aa
Bearish red:      #ff4560
Text primary:     #e2e2e2
Text secondary:   #8888aa
Font:             Inter or system sans-serif
```

### Layout (1440px+ optimized)

```
┌────────────────────────────────────────────────────────┐
│ TOP BAR: Logo | Regime Badge | P&L | Mode | WS Status  │
├───────┬────────────────────────────┬───────────────────┤
│       │                            │                   │
│ WATCH │       CHART PANEL          │  ORDER ENTRY      │
│ LIST  │  (pair selector + TF bar)  │  OPEN POSITIONS   │
│       │                            │  TRADE LOG        │
│ ORDER │  ──────────────────────    │                   │
│ BOOK  │  STRATEGY CONTROLS         │  AI ASSISTANT     │
│       │  BOT STATUS + SIGNALS      │  (collapsible)    │
└───────┴────────────────────────────┴───────────────────┘
```

### Bottom Tab Bar (modal or slide-up panels)
- Backtesting
- Alert Manager
- Portfolio History (equity curve of account over time)
- Settings

### Responsive Behavior
- Below 1200px: panels stack vertically, AI panel behind tab
- Loading skeletons on all panels during initial data fetch
- Helpful empty states — no blank panels
- All errors surfaced as toast notifications + logged to event log
- Zero silent failures

---

## Section 17 — File Structure

```
cerebro-crypto/
├── server/
│   └── proxy.js                    ← Express proxy on port 3002
├── src/
│   ├── components/
│   │   ├── TopBar/
│   │   ├── Watchlist/
│   │   ├── OrderBook/
│   │   ├── Chart/
│   │   ├── StrategyControls/
│   │   ├── OrderEntry/
│   │   ├── Positions/
│   │   ├── TradeLog/
│   │   ├── Backtest/
│   │   ├── AIAssistant/
│   │   ├── AlertManager/
│   │   └── Settings/
│   ├── hooks/
│   │   ├── useCoinbaseWebSocket.js  ← single WS manager
│   │   ├── useCoinbaseREST.js
│   │   ├── useMarketData.js
│   │   ├── usePositions.js
│   │   ├── useOrders.js
│   │   ├── usePaperTrading.js       ← paper sim engine
│   │   ├── useRegimeDetection.js
│   │   └── useBacktest.js
│   ├── workers/
│   │   ├── indicators.worker.js     ← all TA math
│   │   └── backtest.worker.js       ← full backtest engine
│   ├── services/
│   │   ├── coinbaseWebSocket.js
│   │   ├── coinbaseREST.js
│   │   └── aiService.js
│   ├── store/
│   │   └── index.js                 ← Zustand for global state
│   ├── utils/
│   │   ├── indicators.js
│   │   ├── riskManager.js
│   │   ├── regimeDetector.js
│   │   ├── paperSimulator.js
│   │   └── formatters.js
│   ├── db/
│   │   └── indexedDB.js             ← trade history + OHLCV cache
│   ├── config/
│   │   └── constants.js             ← all configurable defaults
│   └── App.jsx
├── .env.example
├── .env                             ← COINBASE_API_KEY, COINBASE_API_SECRET
├── package.json
└── README.md
```

---

## Section 18 — Express Proxy Server

File: `/server/proxy.js` — runs on port 3002

- Handles Coinbase JWT token generation (required for Advanced Trade auth)
- All REST calls from the React client hit `/api/*` on proxy, forwarded to Coinbase with proper auth headers
- WebSocket auth token also fetched via proxy
- In paper mode: proxy intercepts `POST /api/orders` and returns a simulated fill response — nothing forwarded to Coinbase
- Start both servers with one command:

```json
"dev": "concurrently \"node server/proxy.js\" \"react-scripts start\""
```

---

## Section 19 — Security

- API keys only in `.env` — never in client bundle, never logged to console
- `.env` listed in `.gitignore`
- Proxy validates that paper mode orders are never forwarded live
- Input sanitization on all user fields
- Rate limit tracking: monitor Coinbase API call count, warn if approaching limits
- All error messages scrubbed of sensitive data before display

---

## Section 20 — README Requirements

Include all of the following in `README.md`:

- Prerequisites: Node 18+, Coinbase Advanced Trade account setup
- How to generate Coinbase Advanced Trade API keys (step by step)
- Installation: `npm install`, setting up `.env`, `npm run dev`
- Paper vs Live mode explanation and how the simulator works
- Strategy guide: plain English explanation of each strategy's entry/exit/stop logic
- Backtesting guide
- Fee structure explanation (Coinbase maker/taker tiers)
- Troubleshooting:
  - WebSocket auth failures
  - JWT token errors (most common Coinbase Advanced Trade gotcha)
  - Order rejected errors and what they mean
  - Candle data gaps
  - CORS issues with proxy

### Code Comments
- JSDoc on every non-obvious function
- Every strategy entry condition commented with the reasoning
- Every risk check commented explaining what failure scenario it prevents

---

## Final Instructions for Claude Code

Build this as a complete, production-ready standalone application. Optimize for performance and reliability throughout.

The paper trading simulator must be indistinguishable in UX from live mode — same panels, same flow, same confirmations — only the badge color and border differ.

If any feature creates a performance risk, implement a safe degraded version and leave a clearly marked `// TODO:` comment explaining the tradeoff.

**Start by scaffolding the full file structure and proxy server first, then build components layer by layer: data services → state management → UI components → strategy engine → backtesting.**
