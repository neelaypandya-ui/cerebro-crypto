import { useState, useMemo } from 'react';
import useStore from '../../store';
import { formatPrice, formatCryptoAmount } from '../../utils/formatters';
import './OrderBook.css';

/* ============================================================
   OrderBook — Mini Order Book (Collapsible)
   ============================================================ */

const DISPLAY_LEVELS = 10;

export default function OrderBook() {
  const orderBook = useStore((s) => s.orderBook);
  const activePair = useStore((s) => s.activePair);

  const [collapsed, setCollapsed] = useState(false);

  /* ---- Process asks and bids ------------------------------ */
  const { asks, bids, spread, maxTotal } = useMemo(() => {
    const rawAsks = (orderBook.asks || []).slice();
    const rawBids = (orderBook.bids || []).slice();

    // Asks: sorted low to high, display top DISPLAY_LEVELS, shown high to low
    rawAsks.sort((a, b) => parseFloat(a[0]) - parseFloat(b[0]));
    const topAsks = rawAsks.slice(0, DISPLAY_LEVELS);

    // Running total for asks
    let askRunning = 0;
    const processedAsks = topAsks.map((level) => {
      const price = parseFloat(level[0]);
      const size = parseFloat(level[1]);
      askRunning += size;
      return { price, size, total: askRunning };
    });
    // Display high to low
    processedAsks.reverse();

    // Bids: sorted high to low, display top DISPLAY_LEVELS
    rawBids.sort((a, b) => parseFloat(b[0]) - parseFloat(a[0]));
    const topBids = rawBids.slice(0, DISPLAY_LEVELS);

    // Running total for bids
    let bidRunning = 0;
    const processedBids = topBids.map((level) => {
      const price = parseFloat(level[0]);
      const size = parseFloat(level[1]);
      bidRunning += size;
      return { price, size, total: bidRunning };
    });

    // Max total for depth bars
    const allTotals = [
      ...processedAsks.map((a) => a.total),
      ...processedBids.map((b) => b.total),
    ];
    const maxT = allTotals.length > 0 ? Math.max(...allTotals) : 1;

    // Spread calculation
    const bestAsk = topAsks.length > 0 ? parseFloat(topAsks[0][0]) : 0;
    const bestBid = topBids.length > 0 ? parseFloat(topBids[0][0]) : 0;
    const sp = bestAsk > 0 && bestBid > 0 ? bestAsk - bestBid : 0;
    const spPct = bestBid > 0 ? ((sp / bestBid) * 100).toFixed(3) : '0.000';

    return {
      asks: processedAsks,
      bids: processedBids,
      spread: { value: sp, percent: spPct },
      maxTotal: maxT,
    };
  }, [orderBook]);

  return (
    <div className="orderbook-container">
      {/* Header */}
      <div className="orderbook-header">
        <span className="orderbook-title">Order Book</span>
        <button
          className="orderbook-collapse-btn"
          onClick={() => setCollapsed((c) => !c)}
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          {collapsed ? '\u25BC' : '\u25B2'}
        </button>
      </div>

      {collapsed ? (
        <div className="orderbook-collapsed">Collapsed -- click to expand</div>
      ) : (
        <>
          {/* Column headers */}
          <div className="orderbook-col-headers">
            <span className="orderbook-col-header orderbook-col-price">Price</span>
            <span className="orderbook-col-header orderbook-col-size">Size</span>
            <span className="orderbook-col-header orderbook-col-total">Total</span>
          </div>

          <div className="orderbook-body">
            {/* Asks (displayed high to low) */}
            {asks.map((level, i) => (
              <div key={`ask-${i}`} className="orderbook-row ask">
                <div
                  className="orderbook-row-depth"
                  style={{ width: `${(level.total / maxTotal) * 100}%` }}
                />
                <span className="orderbook-row-price">
                  {formatPrice(level.price, activePair)}
                </span>
                <span className="orderbook-row-size">
                  {formatCryptoAmount(level.size, activePair)}
                </span>
                <span className="orderbook-row-total">
                  {formatCryptoAmount(level.total, activePair)}
                </span>
              </div>
            ))}

            {/* Spread */}
            <div className="orderbook-spread">
              <span className="orderbook-spread-label">Spread:</span>
              <span>
                {formatPrice(spread.value, activePair)} ({spread.percent}%)
              </span>
            </div>

            {/* Bids (displayed high to low) */}
            {bids.map((level, i) => (
              <div key={`bid-${i}`} className="orderbook-row bid">
                <div
                  className="orderbook-row-depth"
                  style={{ width: `${(level.total / maxTotal) * 100}%` }}
                />
                <span className="orderbook-row-price">
                  {formatPrice(level.price, activePair)}
                </span>
                <span className="orderbook-row-size">
                  {formatCryptoAmount(level.size, activePair)}
                </span>
                <span className="orderbook-row-total">
                  {formatCryptoAmount(level.total, activePair)}
                </span>
              </div>
            ))}

            {/* Empty state */}
            {asks.length === 0 && bids.length === 0 && (
              <div className="orderbook-collapsed">No order book data available</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
