import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { FixedSizeList } from 'react-window';
import useStore from '../../store';
import { formatPrice, formatUSD, formatDuration, formatTimestamp, formatDate } from '../../utils/formatters';
import './TradeLog.css';

/* ============================================================
   TradeLog — Trade History Log (Right Sidebar)
   ============================================================ */

const ROW_HEIGHT = 54; // collapsed row height
const EXPANDED_HEIGHT = 120;

export default function TradeLog() {
  const tradingMode = useStore((s) => s.tradingMode);
  const orderHistory = useStore((s) => s.orderHistory);
  const paperPortfolio = useStore((s) => s.paperPortfolio);

  const [filter, setFilter] = useState('all'); // 'all' | 'winners' | 'losers'
  const [expandedId, setExpandedId] = useState(null);

  /* Merge trade sources */
  const allTrades = useMemo(() => {
    const paperTrades = (paperPortfolio.trades || []).map((t) => ({
      ...t,
      id: t.id || `pt-${t.closedAt}`,
      source: 'paper',
    }));
    const liveTrades = (orderHistory || []).map((t) => ({
      ...t,
      id: t.id || `lt-${t.closedAt || t.timestamp}`,
      source: 'live',
    }));

    const combined = tradingMode === 'paper' ? paperTrades : [...liveTrades, ...paperTrades];
    combined.sort((a, b) => {
      const ta = new Date(a.closedAt || a.timestamp || 0).getTime();
      const tb = new Date(b.closedAt || b.timestamp || 0).getTime();
      return tb - ta;
    });

    return combined;
  }, [tradingMode, orderHistory, paperPortfolio.trades]);

  /* Filter trades */
  const filteredTrades = useMemo(() => {
    if (filter === 'all') return allTrades;
    return allTrades.filter((t) => {
      const pnl = t.pnl || 0;
      return filter === 'winners' ? pnl > 0 : pnl < 0;
    });
  }, [allTrades, filter]);

  /* ---- Export handlers ------------------------------------- */
  const exportCSV = useCallback(() => {
    const headers = 'Pair,Strategy,Entry Price,Exit Price,P&L,Duration,Closed At\n';
    const rows = filteredTrades.map((t) => {
      const dur = t.entryTime && t.closedAt
        ? formatDuration(new Date(t.closedAt).getTime() - new Date(t.entryTime).getTime())
        : '--';
      return `${t.pair},${t.strategy || '--'},${t.entryPrice},${t.exitPrice || '--'},${(t.pnl || 0).toFixed(2)},${dur},${t.closedAt || '--'}`;
    }).join('\n');

    const blob = new Blob([headers + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cerebro-trades-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filteredTrades]);

  const exportJSON = useCallback(() => {
    const blob = new Blob([JSON.stringify(filteredTrades, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cerebro-trades-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filteredTrades]);

  /* ---- Virtualized list ------------------------------------ */
  const containerRef = useRef(null);
  const [listHeight, setListHeight] = useState(200);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      try {
        for (const entry of entries) {
          const h = entry.contentRect.height;
          if (h > 0) setListHeight(h);
        }
      } catch (_e) { /* ignore resize errors */ }
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const Row = useCallback(
    ({ index, style }) => {
      const trade = filteredTrades[index];
      if (!trade) return null;

      const pnl = trade.pnl || 0;
      const isExpanded = expandedId === trade.id;
      const dur = trade.entryTime && trade.closedAt
        ? formatDuration(new Date(trade.closedAt).getTime() - new Date(trade.entryTime).getTime())
        : '--';

      return (
        <div
          style={style}
          className="tradelog-row"
          onClick={() => setExpandedId(isExpanded ? null : trade.id)}
        >
          <div className="tradelog-row-summary">
            <span className="tradelog-row-pair">{trade.pair}</span>
            <span className="tradelog-row-strategy">{trade.strategy || 'manual'}</span>
            <span className="tradelog-row-prices">
              {formatPrice(trade.entryPrice, trade.pair)} &rarr; {trade.exitPrice ? formatPrice(trade.exitPrice, trade.pair) : '--'}
            </span>
            <span className={`tradelog-row-pnl ${pnl >= 0 ? 'positive' : 'negative'}`}>
              {pnl >= 0 ? '+' : ''}{formatUSD(pnl)}
            </span>
          </div>
          <div className="tradelog-row-meta">
            <span>{dur}</span>
            <span>{trade.closedAt ? formatDate(trade.closedAt) : '--'}</span>
            <span>{trade.source || ''}</span>
          </div>

          {isExpanded && (
            <div className="tradelog-details">
              <div className="tradelog-detail">
                <span className="tradelog-detail-label">Entry Time</span>
                <span className="tradelog-detail-value">{trade.entryTime ? formatTimestamp(trade.entryTime) : '--'}</span>
              </div>
              <div className="tradelog-detail">
                <span className="tradelog-detail-label">Exit Time</span>
                <span className="tradelog-detail-value">{trade.closedAt ? formatTimestamp(trade.closedAt) : '--'}</span>
              </div>
              <div className="tradelog-detail">
                <span className="tradelog-detail-label">Quantity</span>
                <span className="tradelog-detail-value">{trade.quantity?.toFixed(6) || '--'}</span>
              </div>
              <div className="tradelog-detail">
                <span className="tradelog-detail-label">Cost</span>
                <span className="tradelog-detail-value">{trade.cost ? formatUSD(trade.cost) : '--'}</span>
              </div>
              <div className="tradelog-detail">
                <span className="tradelog-detail-label">Order ID</span>
                <span className="tradelog-detail-value">{trade.orderId || trade.id}</span>
              </div>
              <div className="tradelog-detail">
                <span className="tradelog-detail-label">Exit Reason</span>
                <span className="tradelog-detail-value">{trade.exitReason || 'manual'}</span>
              </div>
            </div>
          )}
        </div>
      );
    },
    [filteredTrades, expandedId]
  );

  return (
    <div className="tradelog-container">
      {/* Header */}
      <div className="tradelog-header">
        <span className="tradelog-title">Trade Log</span>
        <div className="tradelog-actions">
          <select
            className="tradelog-filter"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="all">All</option>
            <option value="winners">Winners</option>
            <option value="losers">Losers</option>
          </select>
          <button className="tradelog-export-btn" onClick={exportCSV} title="Export CSV">CSV</button>
          <button className="tradelog-export-btn" onClick={exportJSON} title="Export JSON">JSON</button>
        </div>
      </div>

      {/* List */}
      <div className="tradelog-list" ref={containerRef}>
        {filteredTrades.length === 0 ? (
          <div className="tradelog-empty">No trades yet</div>
        ) : (
          <FixedSizeList
            height={listHeight}
            width="100%"
            itemCount={filteredTrades.length}
            itemSize={ROW_HEIGHT}
          >
            {Row}
          </FixedSizeList>
        )}
      </div>
    </div>
  );
}
