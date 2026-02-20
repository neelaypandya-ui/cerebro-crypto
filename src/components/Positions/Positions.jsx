import { useState, useMemo, useCallback } from 'react';
import useStore from '../../store';
import { formatPrice, formatUSD, formatPercent, formatDuration } from '../../utils/formatters';
import './Positions.css';

/* ============================================================
   Positions — Open Positions Panel (Right Sidebar)
   ============================================================ */

export default function Positions() {
  const positions = useStore((s) => s.positions);
  const tickers = useStore((s) => s.tickers);
  const tradingMode = useStore((s) => s.tradingMode);
  const paperPortfolio = useStore((s) => s.paperPortfolio);
  const removePosition = useStore((s) => s.removePosition);
  const updatePosition = useStore((s) => s.updatePosition);
  const updatePaperPortfolio = useStore((s) => s.updatePaperPortfolio);
  const addToast = useStore((s) => s.addToast);

  /* Combine positions from both modes */
  const activePositions = useMemo(() => {
    if (tradingMode === 'paper') {
      return paperPortfolio.positions || [];
    }
    return positions;
  }, [tradingMode, positions, paperPortfolio.positions]);

  /* ---- Close position handler ----------------------------- */
  const handleClose = useCallback(
    (pos) => {
      const ticker = tickers[pos.pair] || {};
      const exitPrice = ticker.price || pos.entryPrice;
      const pnl = (exitPrice - pos.entryPrice) * pos.quantity;

      if (tradingMode === 'paper') {
        const newBalance = paperPortfolio.balance + (pos.quantity * exitPrice);
        updatePaperPortfolio({
          balance: newBalance,
          positions: (paperPortfolio.positions || []).filter((p) => p.id !== pos.id),
          trades: [
            ...(paperPortfolio.trades || []),
            {
              ...pos,
              exitPrice,
              pnl,
              closedAt: new Date().toISOString(),
            },
          ],
        });
      }

      removePosition(pos.id);
      addToast({
        type: pnl >= 0 ? 'success' : 'warning',
        message: `Closed ${pos.pair}: ${pnl >= 0 ? '+' : ''}${formatUSD(pnl)}`,
      });
    },
    [tickers, tradingMode, paperPortfolio, removePosition, updatePaperPortfolio, addToast]
  );

  /* ---- Stop-loss inline edit ------------------------------- */
  const handleStopChange = useCallback(
    (posId, newStop) => {
      const val = parseFloat(newStop);
      if (!isNaN(val) && val > 0) {
        updatePosition(posId, { stopLoss: val });
        if (tradingMode === 'paper') {
          updatePaperPortfolio({
            positions: (paperPortfolio.positions || []).map((p) =>
              p.id === posId ? { ...p, stopLoss: val } : p
            ),
          });
        }
      }
    },
    [updatePosition, tradingMode, paperPortfolio, updatePaperPortfolio]
  );

  return (
    <div className="positions-container">
      {/* Header */}
      <div className="positions-header">
        <span className="positions-title">Open Positions</span>
        {activePositions.length > 0 && (
          <span className="positions-count">{activePositions.length}</span>
        )}
      </div>

      {/* Position cards */}
      {activePositions.length === 0 ? (
        <div className="positions-empty">No open positions</div>
      ) : (
        activePositions.map((pos) => (
          <PositionCard
            key={pos.id}
            pos={pos}
            ticker={tickers[pos.pair] || {}}
            onClose={handleClose}
            onStopChange={handleStopChange}
          />
        ))
      )}
    </div>
  );
}

/* ---- Individual Position Card -------------------------------- */
function PositionCard({ pos, ticker, onClose, onStopChange }) {
  const currentPrice = ticker.price || pos.entryPrice;
  const unrealizedPnl = (currentPrice - pos.entryPrice) * (pos.quantity || 0);
  const unrealizedPct = pos.entryPrice > 0 ? ((currentPrice - pos.entryPrice) / pos.entryPrice) : 0;

  const entryTime = pos.entryTime ? new Date(pos.entryTime).getTime() : Date.now();
  const duration = Date.now() - entryTime;

  /* Near stop-loss warning (within 0.5%) */
  const nearStop = pos.stopLoss && currentPrice > 0
    ? ((currentPrice - pos.stopLoss) / currentPrice) < 0.005
    : false;

  const [editingSl, setEditingSl] = useState(false);
  const [slValue, setSlValue] = useState(String(pos.stopLoss || ''));

  const handleSlBlur = () => {
    setEditingSl(false);
    onStopChange(pos.id, slValue);
  };

  return (
    <div className={`position-card ${nearStop ? 'near-stop' : ''}`}>
      <div className="position-card-top">
        <div>
          <span className="position-pair">{pos.pair}</span>
          <span className="position-side">LONG</span>
        </div>
        <button
          className="position-close-btn"
          onClick={() => onClose(pos)}
          title="Close position (market order)"
        >
          &times;
        </button>
      </div>

      <div className="position-details">
        <div className="position-detail">
          <span className="position-detail-label">Entry</span>
          <span className="position-detail-value">{formatPrice(pos.entryPrice, pos.pair)}</span>
        </div>
        <div className="position-detail">
          <span className="position-detail-label">Current</span>
          <span className="position-detail-value">{formatPrice(currentPrice, pos.pair)}</span>
        </div>
        <div className="position-detail">
          <span className="position-detail-label">Qty</span>
          <span className="position-detail-value">{pos.quantity?.toFixed(6)}</span>
        </div>
        <div className="position-detail">
          <span className="position-detail-label">P&L</span>
          <span className={`position-detail-value ${unrealizedPnl >= 0 ? 'positive' : 'negative'}`}>
            {formatUSD(unrealizedPnl)} ({formatPercent(unrealizedPct)})
          </span>
        </div>
        <div className="position-detail">
          <span className="position-detail-label">Duration</span>
          <span className="position-detail-value">{formatDuration(duration)}</span>
        </div>
        <div className="position-detail">
          <span className="position-detail-label">Stop</span>
          {editingSl ? (
            <input
              className="position-sl-input"
              type="number"
              value={slValue}
              onChange={(e) => setSlValue(e.target.value)}
              onBlur={handleSlBlur}
              onKeyDown={(e) => e.key === 'Enter' && handleSlBlur()}
              autoFocus
            />
          ) : (
            <span
              className="position-detail-value"
              style={{ cursor: 'pointer', color: 'var(--bearish)' }}
              onClick={() => {
                setSlValue(String(pos.stopLoss || ''));
                setEditingSl(true);
              }}
              title="Click to edit"
            >
              {pos.stopLoss ? formatPrice(pos.stopLoss, pos.pair) : '--'}
            </span>
          )}
        </div>
      </div>

      {/* TP/SL levels */}
      <div className="position-levels">
        <div className="position-level">
          <span className="position-level-label">SL:</span>
          <span className="position-level-value sl">
            {pos.stopLoss ? formatPrice(pos.stopLoss, pos.pair) : '--'}
          </span>
        </div>
        <div className="position-level">
          <span className="position-level-label">TP1:</span>
          <span className="position-level-value tp">
            {pos.tp1 ? formatPrice(pos.tp1, pos.pair) : '--'}
          </span>
        </div>
        <div className="position-level">
          <span className="position-level-label">TP2:</span>
          <span className="position-level-value tp">
            {pos.tp2 ? formatPrice(pos.tp2, pos.pair) : '--'}
          </span>
        </div>
      </div>
    </div>
  );
}
