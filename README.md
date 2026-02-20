# Cerebro Crypto

A real-time cryptocurrency trading terminal with automated strategy execution, built with React and the Coinbase Advanced Trade API.

![React](https://img.shields.io/badge/React-18-blue) ![Vite](https://img.shields.io/badge/Vite-5-purple) ![License](https://img.shields.io/badge/License-MIT-green)

## Overview

Cerebro Crypto is a full-featured trading terminal that connects to Coinbase Advanced Trade for live market data and order execution. It includes 8 built-in trading strategies, 27 technical indicators, regime detection, and a live strategy execution engine that automates the entire signal-to-order pipeline with multi-layered risk management.

### Key Features

- **Live Market Data** — Real-time price tickers, order book (L2), and candlestick charts via Coinbase WebSocket
- **8 Trading Strategies** — Momentum, breakout, mean reversion, VWAP reclaim, range scalp, micro VWAP scalp, momentum spike scalp, and order book imbalance
- **Strategy Execution Engine** — Candle-close driven evaluation with signal confluence, weighted scoring, and automated order submission
- **27 Technical Indicators** — EMA, SMA, RSI, MACD, Bollinger Bands, ATR, ADX, VWAP, Ichimoku, Supertrend, Stochastic RSI, and more, all computed off-thread in Web Workers
- **Regime Detection** — Automatic market classification (bullish/bearish/choppy) to filter strategy signals
- **6-Step Risk Pipeline** — Spread guard, correlation guard, position sizing, slippage estimation, fee impact analysis, and rate limiting
- **Circuit Breaker** — Automatic pause after consecutive losses or session drawdown threshold
- **Paper Trading** — Full simulation with slippage, fees, and position tracking against a virtual balance
- **Backtesting** — Run strategies against historical data in a dedicated Web Worker
- **TradingView Charts** — Interactive candlestick charts via lightweight-charts with indicator overlays
- **Persistent Storage** — Trade history, signals, and candle cache stored in IndexedDB

## Architecture

```
Frontend (React + Vite, port 3001)
  |
  |-- Zustand Store (global state)
  |-- Web Workers (indicators, backtesting)
  |-- IndexedDB (trade history, signal persistence)
  |
  v
Express Proxy (port 3002)
  |
  |-- Ed25519 JWT signing (EdDSA)
  |-- Paper mode order interception
  |
  v
Coinbase Advanced Trade API
  |-- REST (candles, orders, accounts)
  |-- WebSocket (tickers, order book, trades)
```

## Getting Started

### Prerequisites

- Node.js 18+
- A [Coinbase Advanced Trade](https://www.coinbase.com/advanced-trade) API key (Ed25519 format)

### Installation

```bash
git clone https://github.com/neelaypandya-ui/cerebro-crypto.git
cd cerebro-crypto
npm install
```

### Configuration

Copy the example environment file and add your API credentials:

```bash
cp .env.example .env
```

Edit `.env`:

```
COINBASE_API_KEY=your_api_key_here
COINBASE_API_SECRET=your_base64_encoded_ed25519_private_key
PORT=3001
PROXY_PORT=3002
```

> Your API secret should be the base64-encoded 64-byte Ed25519 private key provided by Coinbase.

### Running

```bash
npm run dev
```

This starts both the Express proxy (port 3002) and the Vite dev server (port 3001) concurrently. Open [http://localhost:3001](http://localhost:3001) in your browser.

## Usage

### Paper Trading (Safe Mode)

The app starts in **paper mode** by default with a $25,000 virtual balance. All orders are simulated locally with realistic slippage and fee modeling. No real money is involved.

### Automated Trading

1. Enable one or more strategies in the Strategy Controls panel
2. Click the **Bot** toggle to ON
3. The engine evaluates strategies on every new candle close (+ a 2-second fallback interval)
4. Watch the **Engine Log** for real-time decisions:
   - **SIGNAL** (green) — Strategy fired an entry/exit signal
   - **EXECUTE** (blue) — Order submitted
   - **BLOCKED** (red) — Risk guard prevented execution
   - **SKIP** (yellow) — Confluence score too low or system paused
5. Use **STOP ALL** for emergency shutdown

### Live Trading

Switch to live mode in the top bar. The same strategies and risk pipeline apply, with additional protections:

- 5-second minimum between orders
- All existing risk guards enforced (spread, slippage, fees, correlation, position limits)
- Circuit breaker active (3 consecutive losses = 15min pause, 5 = 1hr, -1% session = disabled)

## Strategies

| Strategy | Regime | Description |
|----------|--------|-------------|
| Crypto Momentum | Bullish | EMA 9/21 crossover with RSI > 50 and volume surge |
| Breakout | Bullish | 20-bar high breakout with volume confirmation |
| VWAP Reclaim | Bullish | Price reclaims VWAP from below with momentum |
| Mean Reversion | Choppy | Bollinger Band lower band touch with RSI < 35 |
| Range Scalp | Choppy | Support/resistance detection with candlestick patterns |
| Micro VWAP Scalp | Choppy | Tight VWAP scalps on low-timeframe charts |
| Momentum Spike Scalp | Bullish | Volume spike pullback entries, 3-minute max hold |
| Order Book Imbalance | All | Bid/ask imbalance detection from L2 data |

## Risk Management

Every order passes through the full risk pipeline:

1. **Spread Guard** — Blocks scalp strategies when bid-ask spread > 0.08%
2. **Correlation Guard** — Reduces position size 50% for correlated pairs (e.g., BTC-ETH at 0.85)
3. **Position Sizing** — Calculates size based on portfolio percentage from risk settings
4. **Slippage Estimator** — Blocks orders when estimated slippage from order book depth > 0.15%
5. **Fee Impact** — Blocks orders when expected net profit after round-trip fees is negative
6. **Risk Validator** — Enforces max positions, daily trade count, daily loss limit, and pair cooldown

## Project Structure

```
src/
  components/       # 12 UI component directories
  config/           # Constants, defaults, ticker profiles
  db/               # IndexedDB persistence layer
  hooks/            # 9 custom hooks (WS, REST, orders, engine, etc.)
  services/         # Coinbase REST/WS clients, AI service
  store/            # Zustand global store
  strategies/       # 8 strategy definitions with checkEntry/checkExit
  utils/            # Risk manager, indicators, formatters, guards
  workers/          # Web Workers for indicators and backtesting
server/
  proxy.js          # Express proxy with JWT auth and paper trade interception
```

## Tech Stack

- **Frontend**: React 18, Vite 5, Zustand, lightweight-charts (TradingView), react-window
- **Backend**: Express, Ed25519 JWT signing (jsonwebtoken)
- **Data**: IndexedDB (via idb), Web Workers
- **API**: Coinbase Advanced Trade (REST + WebSocket)

## Color Palette

| Element | Color |
|---------|-------|
| Background | `#0a0a0f` |
| Card Surface | `#12121a` |
| Border | `#1e1e2e` |
| Accent | `#6c63ff` |
| Bullish | `#00d4aa` |
| Bearish | `#ff4560` |
| Warning | `#f0b429` |
