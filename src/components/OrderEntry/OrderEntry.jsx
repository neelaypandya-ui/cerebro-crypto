import { useState, useMemo, useCallback } from 'react';
import useStore from '../../store';
import { formatPrice, formatUSD } from '../../utils/formatters';
import { TAKER_FEE_PCT } from '../../config/constants';
import coinbaseREST from '../../services/coinbaseREST';
import './OrderEntry.css';

/* ============================================================
   OrderEntry — Order Entry Form (Right Sidebar)
   ============================================================ */

const ORDER_TYPES = ['market', 'limit', 'stop-limit'];

export default function OrderEntry() {
  const activePair = useStore((s) => s.activePair);
  const tickers = useStore((s) => s.tickers);
  const tradingMode = useStore((s) => s.tradingMode);
  const addPosition = useStore((s) => s.addPosition);
  const updatePaperPortfolio = useStore((s) => s.updatePaperPortfolio);
  const paperPortfolio = useStore((s) => s.paperPortfolio);
  const addToast = useStore((s) => s.addToast);

  const [orderType, setOrderType] = useState('market');
  const [amountMode, setAmountMode] = useState('usd'); // 'crypto' | 'usd'
  const [amount, setAmount] = useState('');
  const [limitPrice, setLimitPrice] = useState('');
  const [stopPrice, setStopPrice] = useState('');
  const [error, setError] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const ticker = tickers[activePair] || {};
  const currentPrice = ticker.price || ticker.ask || 0;

  /* ---- Calculations --------------------------------------- */
  const calcEstimate = useMemo(() => {
    const amt = parseFloat(amount) || 0;
    if (amt <= 0) return { quantity: 0, total: 0, fee: 0, netTotal: 0 };

    const price = orderType === 'market' ? currentPrice : (parseFloat(limitPrice) || currentPrice);
    let quantity, total;

    if (amountMode === 'usd') {
      total = amt;
      quantity = price > 0 ? amt / price : 0;
    } else {
      quantity = amt;
      total = amt * price;
    }

    const fee = total * (TAKER_FEE_PCT / 100);
    return { quantity, total, fee, netTotal: total + fee };
  }, [amount, amountMode, orderType, limitPrice, currentPrice]);

  /* ---- Validation ----------------------------------------- */
  const validate = useCallback(() => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return 'Please enter a valid amount';
    if (orderType !== 'market' && (!limitPrice || parseFloat(limitPrice) <= 0))
      return 'Please enter a valid limit price';
    if (orderType === 'stop-limit' && (!stopPrice || parseFloat(stopPrice) <= 0))
      return 'Please enter a valid stop price';
    if (currentPrice <= 0) return 'Waiting for price data...';

    const avail = tradingMode === 'paper' ? paperPortfolio.balance : Infinity;
    if (calcEstimate.netTotal > avail)
      return `Insufficient funds. Need ${formatUSD(calcEstimate.netTotal)}, have ${formatUSD(avail)}`;

    return '';
  }, [amount, orderType, limitPrice, stopPrice, currentPrice, tradingMode, paperPortfolio.balance, calcEstimate]);

  /* ---- Submit order ---------------------------------------- */
  const handleSubmit = useCallback(async () => {
    const err = validate();
    if (err) {
      setError(err);
      return;
    }
    setError('');

    if (tradingMode === 'live' && !showConfirm) {
      setShowConfirm(true);
      return;
    }

    setSubmitting(true);
    setShowConfirm(false);

    try {
      if (tradingMode === 'paper') {
        /* Paper trade simulation */
        const entryPrice = orderType === 'market' ? currentPrice : parseFloat(limitPrice);
        const pos = {
          id: `paper-${Date.now()}`,
          pair: activePair,
          side: 'long',
          entryPrice,
          quantity: calcEstimate.quantity,
          cost: calcEstimate.netTotal,
          stopLoss: entryPrice * 0.98,
          tp1: entryPrice * 1.015,
          tp2: entryPrice * 1.03,
          entryTime: new Date().toISOString(),
          strategy: 'manual',
        };

        addPosition(pos);
        updatePaperPortfolio({
          balance: paperPortfolio.balance - calcEstimate.netTotal,
          positions: [...paperPortfolio.positions, pos],
        });

        addToast({ type: 'success', message: `Paper BUY ${activePair} @ ${formatPrice(entryPrice, activePair)}` });
      } else {
        /* Live order via Coinbase REST */
        const orderData = {
          product_id: activePair,
          side: 'BUY',
          order_configuration: {},
        };

        if (orderType === 'market') {
          orderData.order_configuration.market_market_ioc = {
            quote_size: String(calcEstimate.total.toFixed(2)),
          };
        } else if (orderType === 'limit') {
          orderData.order_configuration.limit_limit_gtc = {
            base_size: String(calcEstimate.quantity),
            limit_price: String(parseFloat(limitPrice)),
          };
        } else if (orderType === 'stop-limit') {
          orderData.order_configuration.stop_limit_stop_limit_gtc = {
            base_size: String(calcEstimate.quantity),
            limit_price: String(parseFloat(limitPrice)),
            stop_price: String(parseFloat(stopPrice)),
          };
        }

        await coinbaseREST.createOrder(orderData);
        addToast({ type: 'success', message: `Order placed: BUY ${activePair}` });
      }

      setAmount('');
      setLimitPrice('');
      setStopPrice('');
    } catch (err) {
      setError(err.message || 'Order failed');
      addToast({ type: 'error', message: `Order failed: ${err.message}` });
    } finally {
      setSubmitting(false);
    }
  }, [
    validate, tradingMode, showConfirm, orderType, currentPrice, limitPrice, stopPrice,
    activePair, calcEstimate, addPosition, updatePaperPortfolio, paperPortfolio, addToast,
  ]);

  return (
    <div className="order-entry">
      {/* Header */}
      <div className="order-entry-header">
        <span className="order-entry-pair">{activePair}</span>
        <span className="order-entry-price">
          {currentPrice > 0 ? formatPrice(currentPrice, activePair) : '--'}
        </span>
      </div>

      {/* Order type tabs */}
      <div className="order-type-tabs">
        {ORDER_TYPES.map((type) => (
          <button
            key={type}
            className={`order-type-tab ${orderType === type ? 'active' : ''}`}
            onClick={() => setOrderType(type)}
          >
            {type === 'stop-limit' ? 'Stop-Limit' : type.charAt(0).toUpperCase() + type.slice(1)}
          </button>
        ))}
      </div>

      {/* Side note */}
      <div className="order-side-note">
        <span className="order-side-label">BUY</span>
        <span className="order-side-subtext">Long-only trading</span>
      </div>

      {/* Amount */}
      <div className="order-field">
        <span className="order-field-label">Amount</span>
        <div className="order-field-input-wrap">
          <input
            className="order-field-input"
            type="number"
            min="0"
            step="any"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={amountMode === 'usd' ? '0.00' : '0.000000'}
          />
          <span
            className="order-field-suffix"
            onClick={() => setAmountMode(amountMode === 'usd' ? 'crypto' : 'usd')}
            title="Toggle between USD and crypto"
          >
            {amountMode === 'usd' ? 'USD' : activePair.split('-')[0]}
          </span>
        </div>
        <div className="order-amount-toggle">
          <button
            className={`order-amount-toggle-btn ${amountMode === 'usd' ? 'active' : ''}`}
            onClick={() => setAmountMode('usd')}
          >
            USD
          </button>
          <button
            className={`order-amount-toggle-btn ${amountMode === 'crypto' ? 'active' : ''}`}
            onClick={() => setAmountMode('crypto')}
          >
            {activePair.split('-')[0]}
          </button>
        </div>
      </div>

      {/* Limit price */}
      {(orderType === 'limit' || orderType === 'stop-limit') && (
        <div className="order-field">
          <span className="order-field-label">Limit Price</span>
          <div className="order-field-input-wrap">
            <input
              className="order-field-input"
              type="number"
              min="0"
              step="any"
              value={limitPrice}
              onChange={(e) => setLimitPrice(e.target.value)}
              placeholder={currentPrice > 0 ? formatPrice(currentPrice, activePair) : '0.00'}
            />
            <span className="order-field-suffix">USD</span>
          </div>
        </div>
      )}

      {/* Stop price */}
      {orderType === 'stop-limit' && (
        <div className="order-field">
          <span className="order-field-label">Stop Price</span>
          <div className="order-field-input-wrap">
            <input
              className="order-field-input"
              type="number"
              min="0"
              step="any"
              value={stopPrice}
              onChange={(e) => setStopPrice(e.target.value)}
              placeholder="0.00"
            />
            <span className="order-field-suffix">USD</span>
          </div>
        </div>
      )}

      {/* Estimate */}
      {parseFloat(amount) > 0 && (
        <div className="order-estimate">
          <div className="order-estimate-row">
            <span className="order-estimate-label">Quantity</span>
            <span className="order-estimate-value">
              {calcEstimate.quantity.toFixed(6)} {activePair.split('-')[0]}
            </span>
          </div>
          <div className="order-estimate-row">
            <span className="order-estimate-label">Subtotal</span>
            <span className="order-estimate-value">{formatUSD(calcEstimate.total)}</span>
          </div>
          <div className="order-estimate-row">
            <span className="order-estimate-label">Fee ({TAKER_FEE_PCT}%)</span>
            <span className="order-estimate-value">{formatUSD(calcEstimate.fee)}</span>
          </div>
          <div className="order-estimate-row" style={{ borderTop: '1px solid var(--border)', paddingTop: 4, marginTop: 2 }}>
            <span className="order-estimate-label" style={{ fontWeight: 600 }}>Total Cost</span>
            <span className="order-estimate-value" style={{ color: 'var(--bullish)' }}>
              {formatUSD(calcEstimate.netTotal)}
            </span>
          </div>
        </div>
      )}

      {/* Validation error */}
      {error && <div className="order-error">{error}</div>}

      {/* Submit */}
      <button
        className="order-submit-btn"
        onClick={handleSubmit}
        disabled={submitting || !amount}
      >
        {submitting ? 'Placing...' : 'Place Order'}
      </button>

      {/* Live confirmation modal */}
      {showConfirm && (
        <div className="order-confirm-overlay" onClick={() => setShowConfirm(false)}>
          <div className="order-confirm-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Confirm Live Order</h3>
            <div className="order-confirm-details">
              <div className="order-confirm-detail-row">
                <span className="order-confirm-detail-label">Pair</span>
                <span className="order-confirm-detail-value">{activePair}</span>
              </div>
              <div className="order-confirm-detail-row">
                <span className="order-confirm-detail-label">Type</span>
                <span className="order-confirm-detail-value">{orderType.toUpperCase()}</span>
              </div>
              <div className="order-confirm-detail-row">
                <span className="order-confirm-detail-label">Quantity</span>
                <span className="order-confirm-detail-value">{calcEstimate.quantity.toFixed(6)}</span>
              </div>
              <div className="order-confirm-detail-row">
                <span className="order-confirm-detail-label">Total Cost</span>
                <span className="order-confirm-detail-value">{formatUSD(calcEstimate.netTotal)}</span>
              </div>
            </div>
            <div className="order-confirm-actions">
              <button className="order-confirm-cancel" onClick={() => setShowConfirm(false)}>Cancel</button>
              <button className="order-confirm-submit" onClick={handleSubmit}>Confirm BUY</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
