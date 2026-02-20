/* ============================================================
   Cerebro Crypto — useCoinbaseWebSocket Hook
   ============================================================
   Manages the WebSocket connection lifecycle, subscribes to
   channels, and routes incoming messages to the Zustand store.
   ============================================================ */

import { useEffect, useRef, useCallback } from 'react';
import useStore from '../store';
import coinbaseWS from '../services/coinbaseWebSocket';
import { DEFAULT_PAIRS, RENDER_THROTTLE_MS } from '../config/constants';

/**
 * Custom hook for managing the Coinbase WebSocket connection.
 * Connects on mount, disconnects on unmount, and handles
 * channel subscriptions based on the active pair and watchlist.
 *
 * @returns {{ wsStatus: string, reconnect: Function }}
 */
export default function useCoinbaseWebSocket() {
  const activePair = useStore((s) => s.activePair);
  const tradingMode = useStore((s) => s.tradingMode);

  // Refs for throttling and tracking previous pair
  const prevPairRef = useRef(null);
  const tickerThrottleRef = useRef(null);
  const lastTickerDataRef = useRef(null);
  const rafRef = useRef(null);
  const wsStatusRef = useRef('disconnected');

  // Refs for trade flow tracking (60s rolling window)
  const tradeFlowRef = useRef({ buys: [], sells: [], lastUpdate: 0 });

  // ---- Store status in a ref to avoid re-renders on every status change ----
  const setWsStatus = useCallback((status) => {
    wsStatusRef.current = status;
    // Push to store (only if store has this setter)
    const store = useStore.getState();
    if (typeof store.setWsStatus === 'function') {
      store.setWsStatus(status);
    } else {
      // Fallback: set wsConnected boolean
      useStore.setState({ wsConnected: status === 'connected' });
    }
  }, []);

  // =========================================================================
  //  Ticker message handler (throttled at 250ms via rAF)
  // =========================================================================
  const handleTickerMessage = useCallback((msg) => {
    if (msg.events) {
      for (const event of msg.events) {
        if (event.tickers) {
          for (const ticker of event.tickers) {
            lastTickerDataRef.current = {
              ...(lastTickerDataRef.current || {}),
              [ticker.product_id]: {
                productId: ticker.product_id,
                price: parseFloat(ticker.price),
                volume24h: parseFloat(ticker.volume_24_h),
                low24h: parseFloat(ticker.low_24_h),
                high24h: parseFloat(ticker.high_24_h),
                change24h: parseFloat(ticker.price_percentage_change_24_h),
              },
            };
          }
        }
      }
    }

    // Throttle store updates
    if (!tickerThrottleRef.current) {
      tickerThrottleRef.current = setTimeout(() => {
        tickerThrottleRef.current = null;
        if (lastTickerDataRef.current) {
          rafRef.current = requestAnimationFrame(() => {
            const store = useStore.getState();
            if (typeof store.updateTicker === 'function') {
              store.updateTicker(lastTickerDataRef.current);
            }
          });
        }
      }, RENDER_THROTTLE_MS);
    }
  }, []);

  // =========================================================================
  //  Candle message handler
  // =========================================================================
  const handleCandleMessage = useCallback((msg) => {
    if (msg.events) {
      for (const event of msg.events) {
        if (event.candles) {
          for (const candle of event.candles) {
            const store = useStore.getState();
            if (typeof store.addCandle === 'function') {
              const activeTimeframe = store.activeTimeframe;
              store.addCandle(activeTimeframe, {
                timestamp: parseInt(candle.start, 10),
                open: parseFloat(candle.open),
                high: parseFloat(candle.high),
                low: parseFloat(candle.low),
                close: parseFloat(candle.close),
                volume: parseFloat(candle.volume),
              });
            }
          }
        }
      }
    }
  }, []);

  // =========================================================================
  //  Level2 (Order Book) message handler
  // =========================================================================
  const handleLevel2Message = useCallback((msg) => {
    if (msg.events) {
      for (const event of msg.events) {
        const store = useStore.getState();
        if (typeof store.setOrderBook === 'function') {
          store.setOrderBook({
            productId: event.product_id,
            type: event.type, // 'snapshot' or 'update'
            updates: event.updates || [],
          });
        }

        // Calculate spread from L2 data
        if (event.product_id && typeof store.updateSpread === 'function') {
          const book = store.orderBook;
          if (book.bids && book.bids.length > 0 && book.asks && book.asks.length > 0) {
            const bestBid = parseFloat(book.bids[0]?.[0] || 0);
            const bestAsk = parseFloat(book.asks[0]?.[0] || 0);
            if (bestBid > 0 && bestAsk > 0) {
              const mid = (bestBid + bestAsk) / 2;
              const spreadPct = ((bestAsk - bestBid) / mid) * 100;
              const status = spreadPct < 0.03 ? 'green' : spreadPct < 0.08 ? 'yellow' : 'red';
              store.updateSpread(event.product_id, {
                bestBid, bestAsk, spreadPct, status,
                scalpSafe: status !== 'red',
                message: `${spreadPct.toFixed(4)}%`,
              });
            }
          }
        }
      }
    }
  }, []);

  // =========================================================================
  //  Market trades message handler
  // =========================================================================
  const handleMarketTradesMessage = useCallback((msg) => {
    if (msg.events) {
      for (const event of msg.events) {
        if (event.trades) {
          const store = useStore.getState();
          const now = Date.now();
          const flow = tradeFlowRef.current;

          for (const trade of event.trades) {
            const size = parseFloat(trade.size);
            const entry = { size, timestamp: now };

            // Track buy/sell flow
            if (trade.side === 'BUY') {
              flow.buys.push(entry);
            } else {
              flow.sells.push(entry);
            }

            if (typeof store.addRecentTrade === 'function') {
              store.addRecentTrade({
                tradeId: trade.trade_id,
                productId: trade.product_id,
                price: parseFloat(trade.price),
                size,
                side: trade.side,
                time: trade.time,
              });
            }
          }

          // Update trade flow store every 2 seconds (throttled)
          if (now - flow.lastUpdate > 2000) {
            flow.lastUpdate = now;
            const cutoff = now - 60000; // 60s rolling window
            flow.buys = flow.buys.filter((t) => t.timestamp > cutoff);
            flow.sells = flow.sells.filter((t) => t.timestamp > cutoff);

            const buyVolume = flow.buys.reduce((s, t) => s + t.size, 0);
            const sellVolume = flow.sells.reduce((s, t) => s + t.size, 0);
            const ratio = sellVolume > 0 ? buyVolume / sellVolume : buyVolume > 0 ? 10 : 1;

            if (typeof store.setTradeFlow === 'function') {
              store.setTradeFlow({ buyVolume, sellVolume, ratio });
            }
          }
        }
      }
    }
  }, []);

  // =========================================================================
  //  User channel message handler (order updates)
  // =========================================================================
  const handleUserMessage = useCallback((msg) => {
    if (msg.events) {
      for (const event of msg.events) {
        if (event.orders) {
          const store = useStore.getState();
          for (const order of event.orders) {
            if (typeof store.updateOrderStatus === 'function') {
              store.updateOrderStatus({
                orderId: order.order_id,
                status: order.status,
                filledSize: order.cumulative_quantity ? parseFloat(order.cumulative_quantity) : undefined,
                avgFilledPrice: order.avg_filled_price ? parseFloat(order.avg_filled_price) : undefined,
                totalFees: order.total_fees ? parseFloat(order.total_fees) : undefined,
              });
            }
          }
        }
      }
    }
  }, []);

  // =========================================================================
  //  Subscribe to channels for a given pair
  // =========================================================================
  const subscribePair = useCallback(async (pair) => {
    await coinbaseWS.subscribe('candles', [pair], handleCandleMessage);
    await coinbaseWS.subscribe('level2', [pair], handleLevel2Message);
    await coinbaseWS.subscribe('market_trades', [pair], handleMarketTradesMessage);
  }, [handleCandleMessage, handleLevel2Message, handleMarketTradesMessage]);

  const unsubscribePair = useCallback(async (pair) => {
    await coinbaseWS.unsubscribe('candles', [pair]);
    await coinbaseWS.unsubscribe('level2', [pair]);
    await coinbaseWS.unsubscribe('market_trades', [pair]);
  }, []);

  // =========================================================================
  //  Connection lifecycle
  // =========================================================================
  useEffect(() => {
    // Register status listener
    const unsubStatus = coinbaseWS.onStatusChange(setWsStatus);

    // Connect
    coinbaseWS.connect();

    // Subscribe to ticker for all watchlist pairs
    coinbaseWS.subscribe('ticker', DEFAULT_PAIRS, handleTickerMessage);

    // Subscribe to active pair channels
    if (activePair) {
      subscribePair(activePair);
      prevPairRef.current = activePair;
    }

    // Subscribe to user channel for order updates (authenticated)
    coinbaseWS.subscribe('user', [], handleUserMessage);

    // Cleanup on unmount
    return () => {
      unsubStatus();

      // Clear throttle timers
      if (tickerThrottleRef.current) {
        clearTimeout(tickerThrottleRef.current);
        tickerThrottleRef.current = null;
      }
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }

      coinbaseWS.disconnect();
    };
    // Only run on mount/unmount — pair changes handled below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // =========================================================================
  //  Re-subscribe when activePair changes
  // =========================================================================
  useEffect(() => {
    const prevPair = prevPairRef.current;
    if (prevPair === activePair) return;

    // Unsubscribe from old pair
    if (prevPair) {
      unsubscribePair(prevPair);
    }

    // Subscribe to new pair
    if (activePair) {
      subscribePair(activePair);
    }

    prevPairRef.current = activePair;
  }, [activePair, subscribePair, unsubscribePair]);

  // =========================================================================
  //  Reconnect function
  // =========================================================================
  const reconnect = useCallback(() => {
    coinbaseWS.disconnect();
    // Small delay to ensure clean disconnect
    setTimeout(() => {
      coinbaseWS.connect();
    }, 500);
  }, []);

  return {
    wsStatus: wsStatusRef.current,
    reconnect,
  };
}
