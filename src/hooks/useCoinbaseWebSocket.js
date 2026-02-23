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
  const scannerPairs = useStore((s) => s.scannerPairs);
  const scannerEnabled = useStore((s) => s.scannerEnabled);

  // Refs for throttling and tracking previous pair
  const prevPairRef = useRef(null);
  const tickerThrottleRef = useRef(null);
  const lastTickerDataRef = useRef(null);
  const rafRef = useRef(null);
  const wsStatusRef = useRef('disconnected');

  // Refs for trade flow tracking (60s rolling window) — now per-pair
  const tradeFlowRef = useRef({ buys: [], sells: [], lastUpdate: 0 });
  const scannerTradeFlowRef = useRef({}); // { 'ETH-USD': { buys: [], sells: [], lastUpdate: 0 } }

  // Track currently subscribed scanner pairs
  const subscribedScannerPairsRef = useRef(new Set());

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
  //  Candle message handler — routes by product_id for scanner pairs
  // =========================================================================
  const handleCandleMessage = useCallback((msg) => {
    if (msg.events) {
      for (const event of msg.events) {
        if (event.candles) {
          for (const candle of event.candles) {
            const store = useStore.getState();
            const productId = candle.product_id || event.product_id;
            const currentActivePair = store.activePair;
            const parsedCandle = {
              timestamp: parseInt(candle.start, 10),
              open: parseFloat(candle.open),
              high: parseFloat(candle.high),
              low: parseFloat(candle.low),
              close: parseFloat(candle.close),
              volume: parseFloat(candle.volume),
            };

            if (!productId || productId === currentActivePair) {
              // Active pair → write to global store as before
              if (typeof store.addCandle === 'function') {
                store.addCandle(store.activeTimeframe, parsedCandle);
              }
              // Also mirror to scanner store if this pair is in scanner list
              if (store.scannerEnabled && store.scannerPairs?.includes(currentActivePair)) {
                store.addScannerCandle(currentActivePair, 'ONE_MINUTE', parsedCandle);
              }
            } else if (store.scannerEnabled && store.scannerPairs?.includes(productId)) {
              // Scanner pair → write to scanner store only
              store.addScannerCandle(productId, 'ONE_MINUTE', parsedCandle);
            }
          }
        }
      }
    }
  }, []);

  // =========================================================================
  //  Level2 (Order Book) message handler — active pair only (scanner pairs
  //  don't subscribe to level2 to avoid 500+ msgs/sec/pair freezing the UI)
  // =========================================================================
  // Throttle L2 updates — accumulate incremental updates in a ref, flush to store periodically
  const l2ThrottleRef = useRef(null);
  const l2PendingUpdatesRef = useRef([]); // queue of { productId, type, updates }
  const l2SnapshotReceivedRef = useRef(false);

  const handleLevel2Message = useCallback((msg) => {
    if (msg.events) {
      for (const event of msg.events) {
        const productId = event.product_id;
        const currentActivePair = useStore.getState().activePair;
        const isActivePair = !productId || productId === currentActivePair;

        if (!isActivePair) continue; // Only process active pair L2

        // Snapshots must be applied immediately (they replace the entire book)
        if (event.type === 'snapshot') {
          l2SnapshotReceivedRef.current = true;
          l2PendingUpdatesRef.current = []; // clear any queued incremental updates
          useStore.getState().setOrderBook({
            productId,
            type: event.type,
            updates: event.updates || [],
          });
          continue;
        }

        // Queue incremental updates and flush every 250ms
        if (l2SnapshotReceivedRef.current) {
          l2PendingUpdatesRef.current.push({
            productId,
            type: event.type,
            updates: event.updates || [],
          });
        }

        if (!l2ThrottleRef.current) {
          l2ThrottleRef.current = setTimeout(() => {
            l2ThrottleRef.current = null;
            const pending = l2PendingUpdatesRef.current;
            l2PendingUpdatesRef.current = [];
            if (pending.length === 0) return;

            const store = useStore.getState();

            // Merge all pending incremental updates into one batch
            const allUpdates = [];
            for (const batch of pending) {
              if (batch.updates) allUpdates.push(...batch.updates);
            }
            if (allUpdates.length > 0) {
              store.setOrderBook({
                productId: pending[0].productId,
                type: 'update',
                updates: allUpdates,
              });
            }

            // Update spread from current book state
            const book = store.orderBook;
            if (book.bids?.length > 0 && book.asks?.length > 0 && typeof store.updateSpread === 'function') {
              const bestBid = parseFloat(book.bids[0]?.[0] || 0);
              const bestAsk = parseFloat(book.asks[0]?.[0] || 0);
              if (bestBid > 0 && bestAsk > 0) {
                const mid = (bestBid + bestAsk) / 2;
                const spreadPct = ((bestAsk - bestBid) / mid) * 100;
                const status = spreadPct < 0.03 ? 'green' : spreadPct < 0.08 ? 'yellow' : 'red';
                store.updateSpread(pending[0].productId, {
                  bestBid, bestAsk, spreadPct, status,
                  scalpSafe: status !== 'red',
                  message: `${spreadPct.toFixed(4)}%`,
                });
              }
            }
          }, 250);
        }
      }
    }
  }, []);

  // =========================================================================
  //  Market trades message handler — per-pair trade flow for scanner
  // =========================================================================
  const handleMarketTradesMessage = useCallback((msg) => {
    if (msg.events) {
      for (const event of msg.events) {
        if (event.trades) {
          const store = useStore.getState();
          const now = Date.now();
          const currentActivePair = store.activePair;

          for (const trade of event.trades) {
            const size = parseFloat(trade.size);
            const entry = { size, timestamp: now };
            const productId = trade.product_id;
            const isActivePair = !productId || productId === currentActivePair;
            const isScannerPair = store.scannerEnabled && store.scannerPairs?.includes(productId);

            if (isActivePair) {
              // Active pair → global flow tracking
              const flow = tradeFlowRef.current;
              if (trade.side === 'BUY') flow.buys.push(entry);
              else flow.sells.push(entry);

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

            // Scanner pair flow tracking
            if (isScannerPair && productId) {
              if (!scannerTradeFlowRef.current[productId]) {
                scannerTradeFlowRef.current[productId] = { buys: [], sells: [], lastUpdate: 0 };
              }
              const pairFlow = scannerTradeFlowRef.current[productId];
              if (trade.side === 'BUY') pairFlow.buys.push(entry);
              else pairFlow.sells.push(entry);
            }
          }

          // Update global trade flow store every 2 seconds (throttled)
          const flow = tradeFlowRef.current;
          if (now - flow.lastUpdate > 2000) {
            flow.lastUpdate = now;
            const cutoff = now - 60000;
            flow.buys = flow.buys.filter((t) => t.timestamp > cutoff);
            flow.sells = flow.sells.filter((t) => t.timestamp > cutoff);

            const buyVolume = flow.buys.reduce((s, t) => s + t.size, 0);
            const sellVolume = flow.sells.reduce((s, t) => s + t.size, 0);
            const ratio = sellVolume > 0 ? buyVolume / sellVolume : buyVolume > 0 ? 10 : 1;

            if (typeof store.setTradeFlow === 'function') {
              store.setTradeFlow({ buyVolume, sellVolume, ratio });
            }
          }

          // Update scanner trade flows every 2 seconds per pair
          for (const [pairId, pairFlow] of Object.entries(scannerTradeFlowRef.current)) {
            if (now - pairFlow.lastUpdate > 2000) {
              pairFlow.lastUpdate = now;
              const cutoff = now - 60000;
              pairFlow.buys = pairFlow.buys.filter((t) => t.timestamp > cutoff);
              pairFlow.sells = pairFlow.sells.filter((t) => t.timestamp > cutoff);

              const buyVol = pairFlow.buys.reduce((s, t) => s + t.size, 0);
              const sellVol = pairFlow.sells.reduce((s, t) => s + t.size, 0);
              const r = sellVol > 0 ? buyVol / sellVol : buyVol > 0 ? 10 : 1;

              store.setScannerTradeFlow(pairId, { buyVolume: buyVol, sellVolume: sellVol, ratio: r });
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
  // Full subscription (candles + level2 + market_trades) — for active pair only
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

  // Lightweight subscription (candles + market_trades only) — for scanner pairs
  // Level2 is excluded because it generates 200-500+ msgs/sec/pair and would freeze the UI
  const subscribeScannerPair = useCallback(async (pair) => {
    await coinbaseWS.subscribe('candles', [pair], handleCandleMessage);
    await coinbaseWS.subscribe('market_trades', [pair], handleMarketTradesMessage);
  }, [handleCandleMessage, handleMarketTradesMessage]);

  const unsubscribeScannerPair = useCallback(async (pair) => {
    await coinbaseWS.unsubscribe('candles', [pair]);
    await coinbaseWS.unsubscribe('market_trades', [pair]);
  }, []);

  // =========================================================================
  //  Subscribe/unsubscribe scanner pairs
  // =========================================================================
  const subscribeScannerPairs = useCallback(async (pairs, currentActivePair) => {
    const toSubscribe = pairs.filter((p) => p !== currentActivePair && !subscribedScannerPairsRef.current.has(p));
    for (const pair of toSubscribe) {
      await subscribeScannerPair(pair);
      subscribedScannerPairsRef.current.add(pair);
    }
  }, [subscribeScannerPair]);

  const unsubscribeScannerPairs = useCallback(async (pairs) => {
    for (const pair of pairs) {
      if (subscribedScannerPairsRef.current.has(pair)) {
        await unsubscribeScannerPair(pair);
        subscribedScannerPairsRef.current.delete(pair);
      }
    }
  }, [unsubscribeScannerPair]);

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

    // Subscribe to scanner pairs (after a brief delay to let WS connect)
    const scannerTimer = setTimeout(() => {
      const state = useStore.getState();
      if (state.scannerEnabled && state.scannerPairs?.length > 0) {
        subscribeScannerPairs(state.scannerPairs, state.activePair);
      }
    }, 1500);

    // Cleanup on unmount
    return () => {
      unsubStatus();
      clearTimeout(scannerTimer);

      // Clear throttle timers
      if (tickerThrottleRef.current) {
        clearTimeout(tickerThrottleRef.current);
        tickerThrottleRef.current = null;
      }
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (l2ThrottleRef.current) {
        clearTimeout(l2ThrottleRef.current);
        l2ThrottleRef.current = null;
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

    // Reset L2 state for new pair — must receive fresh snapshot before processing updates
    l2SnapshotReceivedRef.current = false;
    l2PendingUpdatesRef.current = [];

    // Unsubscribe old active pair from full "active" channels (includes level2)
    if (prevPair) {
      unsubscribePair(prevPair);
      // If old active pair is in scanner list, re-subscribe as lightweight scanner pair
      const state = useStore.getState();
      if (state.scannerEnabled && state.scannerPairs?.includes(prevPair)) {
        subscribeScannerPair(prevPair);
        subscribedScannerPairsRef.current.add(prevPair);
      }
    }

    // Subscribe new active pair with full channels (includes level2)
    if (activePair) {
      // If new active pair was subscribed as scanner, unsubscribe lightweight first
      if (subscribedScannerPairsRef.current.has(activePair)) {
        unsubscribeScannerPair(activePair);
        subscribedScannerPairsRef.current.delete(activePair);
      }
      subscribePair(activePair);
    }

    prevPairRef.current = activePair;
  }, [activePair, subscribePair, unsubscribePair, subscribeScannerPair, unsubscribeScannerPair]);

  // =========================================================================
  //  Re-subscribe when scanner pairs or scanner enabled changes
  // =========================================================================
  useEffect(() => {
    if (!scannerEnabled) {
      // Unsubscribe all scanner pairs
      const toUnsub = [...subscribedScannerPairsRef.current];
      if (toUnsub.length > 0) {
        unsubscribeScannerPairs(toUnsub);
      }
      return;
    }

    const currentSubscribed = subscribedScannerPairsRef.current;
    const desiredPairs = new Set((scannerPairs || []).filter((p) => p !== activePair));

    // Unsubscribe pairs no longer in scanner list
    const toUnsub = [...currentSubscribed].filter((p) => !desiredPairs.has(p));
    if (toUnsub.length > 0) {
      unsubscribeScannerPairs(toUnsub);
    }

    // Subscribe new scanner pairs
    subscribeScannerPairs([...desiredPairs], activePair);
  }, [scannerPairs, scannerEnabled, activePair, subscribeScannerPairs, unsubscribeScannerPairs]);

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
