# Cerebro Crypto

A real-time cryptocurrency trading terminal with automated strategy execution, built with React and the Coinbase Advanced Trade API.

![React](https://img.shields.io/badge/React-18-blue) ![Vite](https://img.shields.io/badge/Vite-5-purple) ![License](https://img.shields.io/badge/License-MIT-green)

## Overview

Cerebro Crypto is a full-featured trading terminal that connects to Coinbase Advanced Trade for live market data and order execution. It is powered by **HYDRA**, a 5-dimensional confluence scoring engine that evaluates market state across trend, momentum, volume, microstructure, and session intelligence to produce a single 0-100 entry score. Combined with 27 technical indicators, regime detection, and ATR-based position sizing, HYDRA automates the entire signal-to-order pipeline with multi-layered risk management.

### Key Features

- **Live Market Data** — Real-time price tickers, order book (L2), and candlestick charts via Coinbase WebSocket
- **HYDRA Strategy Engine** — 5-dimensional confluence scoring (0-100) with self-calibrating entry threshold and session learning
- **ATR-Based Position Sizing** — Dynamic size calculation from ATR volatility with score-based multiplier, replacing fixed-percentage sizing
- **27 Technical Indicators** — EMA, SMA, RSI, MACD, Bollinger Bands, ATR, ADX, VWAP, Ichimoku, Supertrend, Stochastic RSI, and more, all computed off-thread in Web Workers
- **Regime Detection** — Automatic market classification (bullish/bearish/choppy); HYDRA blocks all entries during bearish regime
- **6-Step Risk Pipeline** — Spread guard, correlation guard, position sizing, slippage estimation, fee impact analysis, and rate limiting
- **Circuit Breaker** — Automatic pause after consecutive losses or session drawdown threshold
- **Paper Trading** — Full simulation with slippage, fees, and position tracking against a virtual balance
- **Backtesting** — Run HYDRA against historical data in a dedicated Web Worker
- **TradingView Charts** — Interactive candlestick charts via lightweight-charts with indicator overlays
- **Persistent Storage** — Trade history, signals, and candle cache stored in IndexedDB

## Architecture

```
Frontend (React + Vite, port 3001)
  |
  |-- Zustand Store (global state)
  |-- HYDRA Engine (5-dimension scoring + exit monitor)
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

1. Open the **HYDRA Controls** panel to view the live confluence score and dimension breakdown
2. Adjust the entry threshold and risk settings in **Settings** (defaults work well out of the box)
3. Click the **Bot** toggle to ON
4. HYDRA evaluates all 5 dimensions on every new candle close (+ a 2-second fallback interval):
   - **SIGNAL** (green) — Score >= threshold, entry fired
   - **EXECUTE** (blue) — Order submitted with ATR-based sizing
   - **BLOCKED** (red) — Regime override, spread block, or risk guard prevented execution
   - **EXIT** (yellow) — Exit score dropped below exit threshold, position closed
5. The **Score Gauge** shows the current 0-100 score with per-dimension breakdown
6. Use **STOP ALL** for emergency shutdown

### Live Trading

Switch to live mode in the top bar. The same HYDRA engine and risk pipeline apply, with additional protections:

- 5-second minimum between orders
- All existing risk guards enforced (spread, slippage, fees, correlation, position limits)
- Circuit breaker active (3 consecutive losses = 15min pause, 5 = 1hr, -1% session = disabled)

## HYDRA Strategy Engine

HYDRA is a 5-dimensional confluence scoring engine that replaces the prior individual strategy approach. It scores market state across 5 independent dimensions (0-20 points each, total 0-100) and only enters when the combined score meets the configurable threshold.

### Dimensions

| Dimension | Range | Signals |
|-----------|-------|---------|
| **D1: Trend Alignment** | 0-20 | Multi-timeframe EMA alignment across 1m, 5m, and 15m candles |
| **D2: Momentum Quality** | 0-20 | RSI shape, MACD structure, Stochastic RSI, divergence detection |
| **D3: Volume Conviction** | 0-20 | Raw volume vs 20-bar average, OBV trend, buy/sell flow ratio |
| **D4: Microstructure** | 0-20 | Order book imbalance, spread quality, VWAP location |
| **D5: Session Intelligence** | 0-20 | Per-pair UTC hour scoring, ATR volatility state |

### Entry and Exit Logic

- **Entry**: Total score >= 80/100 (configurable 65-95)
- **Exit Score Monitor**: Recalculates D1 + D2 + D3 every bar; closes position if score drops below 40
- **Dynamic Targets**: TP1 = ATR x 1.2, TP2 = ATR x 2.5, Stop = ATR x 1.5
- **Signal Expiry**: Signals expire after 20 seconds (configurable 5-60s)

### Adaptive Behavior

- **Self-Calibrating Threshold**: Adjusts entry threshold based on win rate after every 10 trades
- **Session Learning**: Per-pair UTC hour profiles that update from live trade data
- **Regime Override**: No entries during bearish regime regardless of score
- **Spread Block**: Spread > 0.10% blocks trade regardless of score

### HYDRA Settings

| Setting | Range | Default |
|---------|-------|---------|
| Entry Score Threshold | 65-95 | 80 |
| Risk Per Trade | 0.25%-3% | 1% |
| Max Position Size | 2%-15% | 8% |
| Exit Score Threshold | 20-60 | 40 |
| Signal Expiry | 5-60s | 20s |
| Auto-Calibrate Threshold | On/Off | On |
| Consecutive Loss Pause | 1-5 trades | 3 |
| Session Score Weight | 0.5-2.0 | 1.0 |

## Risk Management

Every order passes through the full risk pipeline:

1. **Spread Block** — Blocks all trades when bid-ask spread > 0.10%
2. **Regime Override** — Blocks entries during bearish regime regardless of HYDRA score
3. **ATR-Based Position Sizing** — Calculates position size from ATR volatility and risk-per-trade percentage, scaled by HYDRA score
4. **Correlation Guard** — Reduces position size 50% for correlated pairs (e.g., BTC-ETH at 0.85)
5. **Slippage Estimator** — Blocks orders when estimated slippage from order book depth > 0.15%
6. **Fee Impact** — Blocks orders when expected net profit after round-trip fees is negative
7. **Risk Validator** — Enforces max positions, daily trade count, daily loss limit, and pair cooldown
8. **Circuit Breaker** — Consecutive loss pause (default 3), session drawdown halt

## Project Structure

```
src/
  components/
    HydraControls/      # HYDRA controls panel
      index.jsx           # Main panel layout
      ScoreGauge.jsx      # Circular 0-100 score gauge
      DimensionBreakdown.jsx  # 5-dimension progress bars
      ActivityLog.jsx     # Last 8 HYDRA events
      SessionHeatmap.jsx  # 24-hour session heatmap
      HydraControls.css   # Styles
    ...                   # 12+ UI component directories
  config/               # Constants, defaults, ticker profiles
  db/                   # IndexedDB persistence layer
  hooks/                # 9 custom hooks (WS, REST, orders, engine, etc.)
  services/             # Coinbase REST/WS clients, AI service
  store/                # Zustand global store
  strategies/
    index.js              # Strategy registry (HYDRA only)
    hydra/
      index.js            # Main HYDRA strategy interface
      dimensions/
        trendAlignment.js     # D1: Multi-timeframe trend
        momentumQuality.js    # D2: RSI, MACD, StochRSI
        volumeConviction.js   # D3: Volume and OBV analysis
        microstructure.js     # D4: Order book and spread
        sessionIntelligence.js # D5: Time-of-day scoring
      scoring.js          # Aggregates all 5 dimensions
      sizing.js           # ATR-based position sizing
      exitMonitor.js      # Post-entry exit score monitor
      selfCalibration.js  # Auto-adjusting threshold
      sessionProfiles.js  # Per-pair time-of-day baselines
  utils/                # Risk manager, indicators, formatters, guards
  workers/              # Web Workers for indicators and backtesting
server/
  proxy.js              # Express proxy with JWT auth and paper trade interception
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
