import { useRef, useEffect, useMemo, useState, useCallback } from 'react';
import useStore from '../../store';
import { TIMEFRAMES, COLORS } from '../../config/constants';
import { formatPrice, formatTimestamp, abbreviateNumber } from '../../utils/formatters';
import IndicatorPicker from '../IndicatorPicker';
import './Chart.css';

/* ============================================================
   Chart — Custom HTML5 Canvas Candlestick Chart
   ============================================================
   Canvas elements are created via DOM (not JSX) so that canvas
   errors can never propagate into React's error handling.
   ============================================================ */

const LOWER_INDICATORS = ['volume', 'rsi', 'macd', 'atr', 'adx', 'stochRsi', 'cci', 'mfi', 'obv', 'williamsR', 'roc', 'trix', 'cmf'];

const INDICATOR_PILL_DEFS = [
  { key: 'ema9', label: 'EMA 9', color: '#2196F3' },
  { key: 'ema21', label: 'EMA 21', color: '#FF9800' },
  { key: 'ema50', label: 'EMA 50', color: '#9C27B0' },
  { key: 'sma200', label: 'SMA 200', color: '#FFFFFF' },
  { key: 'bbands', label: 'BB', color: 'rgba(136,136,170,0.6)' },
  { key: 'vwap', label: 'VWAP', color: '#f0b429' },
];

// ---- Safe canvas context helper -------------------------------------------
function safeGetCtx(canvas) {
  try {
    if (!canvas || canvas.width <= 0 || canvas.height <= 0) return null;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    // Test with a draw op — throws if canvas is in error state
    ctx.clearRect(0, 0, 1, 1);
    return ctx;
  } catch (_e) {
    // Canvas in error state — reset
    try {
      const w = canvas.width;
      const h = canvas.height;
      canvas.width = 0;
      canvas.height = 0;
      canvas.width = w;
      canvas.height = h;
      return canvas.getContext('2d');
    } catch (_e2) {
      return null;
    }
  }
}

// ---- Drawing helpers -------------------------------------------------------

const CANDLE_GAP = 2;
const PRICE_AXIS_WIDTH = 70;
const TIME_AXIS_HEIGHT = 24;
const VOLUME_HEIGHT_RATIO = 0.18;

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

function niceStep(range, targetTicks = 6) {
  const raw = range / targetTicks;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  let step;
  if (norm <= 1.5) step = 1;
  else if (norm <= 3) step = 2;
  else if (norm <= 7) step = 5;
  else step = 10;
  return step * mag;
}

// ============================================================================
//  Main Chart Component
// ============================================================================

export default function Chart() {
  const activePair = useStore((s) => s.activePair);
  const setActivePair = useStore((s) => s.setActivePair);
  const activeTimeframe = useStore((s) => s.activeTimeframe);
  const setActiveTimeframe = useStore((s) => s.setActiveTimeframe);
  const candles = useStore((s) => s.candles);
  const indicators = useStore((s) => s.indicators);
  const chartIndicators = useStore((s) => s.chartIndicators);
  const setChartIndicators = useStore((s) => s.setChartIndicators);
  const activeLowerIndicator = useStore((s) => s.activeLowerIndicator);
  const recentTrades = useStore((s) => s.recentTrades);
  const watchlist = useStore((s) => s.watchlist);

  const candleData = useMemo(() => candles[activeTimeframe] || [], [candles, activeTimeframe]);

  // -- Refs (canvas elements are created via DOM, not JSX) ---
  const mainCanvasRef = useRef(null);
  const lowerCanvasRef = useRef(null);
  const mainContainerRef = useRef(null);
  const lowerContainerRef = useRef(null);

  // -- Interaction state (refs for performance, no re-renders) ---
  const viewRef = useRef({
    offset: 0,
    candleWidth: 8,
    isDragging: false,
    dragStartX: 0,
    dragStartOffset: 0,
  });
  const crosshairRef = useRef({ x: -1, y: -1, visible: false });
  const [showIndicatorPicker, setShowIndicatorPicker] = useState(false);

  const handleToggleIndicator = (key) => {
    setChartIndicators({ [key]: !chartIndicators[key] });
  };

  const handleLowerTab = (ind) => {
    useStore.setState({ activeLowerIndicator: ind });
  };

  // =========================================================================
  //  Create canvas elements via DOM (outside React's tree)
  // =========================================================================
  useEffect(() => {
    const mc = mainContainerRef.current;
    const lc = lowerContainerRef.current;
    if (!mc || !lc) return;

    const mainCanvas = document.createElement('canvas');
    mainCanvas.style.cssText = 'width:100%;height:100%;display:block;cursor:crosshair';
    mc.appendChild(mainCanvas);
    mainCanvasRef.current = mainCanvas;

    const lowerCanvas = document.createElement('canvas');
    lowerCanvas.style.cssText = 'width:100%;height:100%;display:block';
    lc.appendChild(lowerCanvas);
    lowerCanvasRef.current = lowerCanvas;

    return () => {
      mainCanvasRef.current = null;
      lowerCanvasRef.current = null;
      try { mc.removeChild(mainCanvas); } catch (_e) { /* already removed */ }
      try { lc.removeChild(lowerCanvas); } catch (_e) { /* already removed */ }
    };
  }, []);

  // =========================================================================
  //  Auto-scroll to latest candle when data loads
  // =========================================================================
  useEffect(() => {
    viewRef.current.offset = 0;
  }, [activePair, activeTimeframe]);

  // =========================================================================
  //  Main canvas drawing  (all canvas ops wrapped — errors stay here)
  // =========================================================================
  const drawMainChart = useCallback(() => {
    try {
      const canvas = mainCanvasRef.current;
      if (!canvas) return;
      const ctx = safeGetCtx(canvas);
      if (!ctx) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 4);
      const W = canvas.width / dpr;
      const H = canvas.height / dpr;
      if (W <= 0 || H <= 0 || !isFinite(W) || !isFinite(H)) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.scale(dpr, dpr);

      const data = candleData;
      if (data.length === 0) {
        ctx.fillStyle = COLORS.textSecondary;
        ctx.font = '13px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`Waiting for candle data for ${activePair}...`, W / 2, H / 2);
        ctx.restore();
        return;
      }

      const view = viewRef.current;
      const chartW = W - PRICE_AXIS_WIDTH;
      const chartH = H - TIME_AXIS_HEIGHT;
      const volumeH = chartH * VOLUME_HEIGHT_RATIO;
      const priceH = chartH - volumeH;

      const totalCandleW = view.candleWidth + CANDLE_GAP;
      const visibleCount = Math.floor(chartW / totalCandleW);
      const endIdx = data.length - view.offset;
      const startIdx = Math.max(0, endIdx - visibleCount);
      const visible = data.slice(startIdx, Math.max(startIdx, endIdx));

      if (visible.length === 0) { ctx.restore(); return; }

      // -- Price range ---
      let priceMin = Infinity, priceMax = -Infinity;
      let volMax = 0;
      for (const c of visible) {
        if (c.low < priceMin) priceMin = c.low;
        if (c.high > priceMax) priceMax = c.high;
        if (c.volume > volMax) volMax = c.volume;
      }
      const priceRange = priceMax - priceMin || 1;
      const pricePad = priceRange * 0.06;
      priceMin -= pricePad;
      priceMax += pricePad;
      const finalPriceRange = priceMax - priceMin;

      const priceToY = (p) => priceH * (1 - (p - priceMin) / finalPriceRange);
      const volToY = (v) => chartH - (v / (volMax || 1)) * volumeH;

      // -- Grid lines ---
      ctx.strokeStyle = 'rgba(30, 30, 46, 0.5)';
      ctx.lineWidth = 0.5;
      const pStep = niceStep(finalPriceRange, 6);
      const pStart = Math.ceil(priceMin / pStep) * pStep;
      for (let p = pStart; p <= priceMax; p += pStep) {
        const y = priceToY(p);
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(chartW, y); ctx.stroke();
      }

      // -- Volume bars ---
      for (let i = 0; i < visible.length; i++) {
        const c = visible[i];
        const x = i * totalCandleW;
        const isBull = c.close >= c.open;
        ctx.fillStyle = isBull ? 'rgba(0,212,170,0.25)' : 'rgba(255,69,96,0.25)';
        ctx.fillRect(x, volToY(c.volume), view.candleWidth, chartH - volToY(c.volume));
      }

      // -- Candles ---
      for (let i = 0; i < visible.length; i++) {
        const c = visible[i];
        const x = i * totalCandleW;
        const barW = view.candleWidth;
        const isBull = c.close >= c.open;
        const color = isBull ? COLORS.bullish : COLORS.bearish;

        const wickX = x + barW / 2;
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(wickX, priceToY(c.high));
        ctx.lineTo(wickX, priceToY(c.low));
        ctx.stroke();

        const bodyTop = priceToY(Math.max(c.open, c.close));
        const bodyBot = priceToY(Math.min(c.open, c.close));
        ctx.fillStyle = color;
        ctx.fillRect(x, bodyTop, barW, Math.max(bodyBot - bodyTop, 1));
      }

      // -- Overlay indicators ---
      const drawLine = (dataArr, color, dashed = false) => {
        if (!dataArr || dataArr.length === 0) return;
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        if (dashed) ctx.setLineDash([4, 3]); else ctx.setLineDash([]);
        ctx.beginPath();
        let started = false;
        for (let i = 0; i < visible.length; i++) {
          const ts = visible[i].timestamp;
          const pt = dataArr.find((d) => d && (d.time === ts || d.time === ts / 1000));
          if (pt && pt.value != null) {
            const y = priceToY(pt.value);
            if (!started) { ctx.moveTo(i * totalCandleW + view.candleWidth / 2, y); started = true; }
            else ctx.lineTo(i * totalCandleW + view.candleWidth / 2, y);
          }
        }
        ctx.stroke();
        ctx.setLineDash([]);
      };

      if (chartIndicators.ema9) drawLine(indicators.ema9, '#2196F3');
      if (chartIndicators.ema21) drawLine(indicators.ema21, '#FF9800');
      if (chartIndicators.ema50) drawLine(indicators.ema50, '#9C27B0');
      if (chartIndicators.sma200) drawLine(indicators.sma200, '#FFFFFF', true);
      if (chartIndicators.vwap) drawLine(indicators.vwap, '#f0b429', true);
      if (chartIndicators.bbands) {
        drawLine(indicators.bollingerUpper || indicators.bbUpper, 'rgba(136,136,170,0.5)');
        drawLine(indicators.bollingerLower || indicators.bbLower, 'rgba(136,136,170,0.5)');
        drawLine(indicators.bollingerMiddle || indicators.bbMiddle, 'rgba(136,136,170,0.3)', true);
      }

      // -- Price axis ---
      ctx.fillStyle = COLORS.cardSurface;
      ctx.fillRect(chartW, 0, PRICE_AXIS_WIDTH, chartH);
      ctx.strokeStyle = COLORS.border;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(chartW, 0); ctx.lineTo(chartW, chartH); ctx.stroke();

      ctx.fillStyle = COLORS.textSecondary;
      ctx.font = '10px monospace';
      ctx.textAlign = 'left';
      for (let p = pStart; p <= priceMax; p += pStep) {
        ctx.fillText(formatPrice(p, activePair), chartW + 4, priceToY(p) + 3);
      }

      // -- Current price label ---
      if (visible.length > 0) {
        const lastPrice = visible[visible.length - 1].close;
        const isBull = visible[visible.length - 1].close >= visible[visible.length - 1].open;
        const labelY = priceToY(lastPrice);
        ctx.fillStyle = isBull ? COLORS.bullish : COLORS.bearish;
        ctx.fillRect(chartW, labelY - 8, PRICE_AXIS_WIDTH, 16);
        ctx.fillStyle = '#000';
        ctx.font = 'bold 10px monospace';
        ctx.fillText(formatPrice(lastPrice, activePair), chartW + 4, labelY + 4);
      }

      // -- Time axis ---
      ctx.fillStyle = COLORS.cardSurface;
      ctx.fillRect(0, chartH, W, TIME_AXIS_HEIGHT);
      ctx.strokeStyle = COLORS.border;
      ctx.beginPath(); ctx.moveTo(0, chartH); ctx.lineTo(W, chartH); ctx.stroke();

      ctx.fillStyle = COLORS.textSecondary;
      ctx.font = '9px monospace';
      ctx.textAlign = 'center';
      const labelEvery = Math.max(1, Math.floor(visibleCount / 8));
      for (let i = 0; i < visible.length; i += labelEvery) {
        ctx.fillText(formatTimestamp(visible[i].timestamp), i * totalCandleW + view.candleWidth / 2, chartH + 14);
      }

      // -- Crosshair ---
      const ch = crosshairRef.current;
      if (ch.visible && ch.x >= 0 && ch.x < chartW && ch.y >= 0 && ch.y < chartH) {
        ctx.strokeStyle = 'rgba(108, 99, 255, 0.4)';
        ctx.lineWidth = 0.5;
        ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.moveTo(0, ch.y); ctx.lineTo(chartW, ch.y); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(ch.x, 0); ctx.lineTo(ch.x, chartH); ctx.stroke();
        ctx.setLineDash([]);

        const hoverPrice = priceMin + (1 - ch.y / priceH) * finalPriceRange;
        ctx.fillStyle = 'rgba(108, 99, 255, 0.8)';
        ctx.fillRect(chartW, ch.y - 8, PRICE_AXIS_WIDTH, 16);
        ctx.fillStyle = '#fff';
        ctx.font = '10px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(formatPrice(hoverPrice, activePair), chartW + 4, ch.y + 4);

        const candleIdx = Math.floor(ch.x / totalCandleW);
        if (candleIdx >= 0 && candleIdx < visible.length) {
          const hc = visible[candleIdx];
          ctx.fillStyle = 'rgba(18, 18, 26, 0.85)';
          ctx.fillRect(4, 4, 220, 68);
          ctx.strokeStyle = COLORS.border;
          ctx.lineWidth = 1;
          ctx.strokeRect(4, 4, 220, 68);
          ctx.fillStyle = COLORS.textPrimary;
          ctx.font = '10px monospace';
          ctx.textAlign = 'left';
          const lines = [
            `T: ${formatTimestamp(hc.timestamp)}`,
            `O: ${formatPrice(hc.open, activePair)}  H: ${formatPrice(hc.high, activePair)}`,
            `L: ${formatPrice(hc.low, activePair)}  C: ${formatPrice(hc.close, activePair)}`,
            `Vol: ${abbreviateNumber(hc.volume)}`,
          ];
          lines.forEach((l, li) => ctx.fillText(l, 10, 18 + li * 14));
        }
      }

      ctx.restore();
    } catch (e) {
      console.warn('[Chart] main draw error:', e.message);
    }
  }, [candleData, activePair, indicators, chartIndicators]);

  // =========================================================================
  //  Lower indicator canvas drawing
  // =========================================================================
  const drawLowerChart = useCallback(() => {
    try {
      const canvas = lowerCanvasRef.current;
      if (!canvas) return;
      const ctx = safeGetCtx(canvas);
      if (!ctx) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 4);
      const W = canvas.width / dpr;
      const H = canvas.height / dpr;
      if (W <= 0 || H <= 0 || !isFinite(W) || !isFinite(H)) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.scale(dpr, dpr);

      const data = candleData;
      if (data.length === 0) { ctx.restore(); return; }

      const view = viewRef.current;
      const chartW = W - PRICE_AXIS_WIDTH;
      const totalCandleW = view.candleWidth + CANDLE_GAP;
      const visibleCount = Math.floor(chartW / totalCandleW);
      const endIdx = data.length - view.offset;
      const startIdx = Math.max(0, endIdx - visibleCount);
      const visible = data.slice(startIdx, Math.max(startIdx, endIdx));

      const lowerKey = (activeLowerIndicator || 'volume').toLowerCase();

      if (lowerKey === 'volume') {
        let maxVol = 0;
        for (const c of visible) { if (c.volume > maxVol) maxVol = c.volume; }
        for (let i = 0; i < visible.length; i++) {
          const c = visible[i];
          const x = i * totalCandleW;
          const isBull = c.close >= c.open;
          const barH = (c.volume / (maxVol || 1)) * (H - 4);
          ctx.fillStyle = isBull ? 'rgba(0,212,170,0.5)' : 'rgba(255,69,96,0.5)';
          ctx.fillRect(x, H - barH, view.candleWidth, barH);
        }
        ctx.fillStyle = COLORS.cardSurface;
        ctx.fillRect(chartW, 0, PRICE_AXIS_WIDTH, H);
        ctx.strokeStyle = COLORS.border;
        ctx.beginPath(); ctx.moveTo(chartW, 0); ctx.lineTo(chartW, H); ctx.stroke();
        ctx.fillStyle = COLORS.textSecondary;
        ctx.font = '9px monospace'; ctx.textAlign = 'left';
        ctx.fillText(abbreviateNumber(maxVol), chartW + 4, 12);
        ctx.fillText('0', chartW + 4, H - 2);
      } else {
        const drawIndicatorLine = (dataArr, color, minVal, maxVal) => {
          if (!dataArr || dataArr.length === 0) return;
          ctx.strokeStyle = color;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          let started = false;
          for (let i = 0; i < visible.length; i++) {
            const ts = visible[i].timestamp;
            const pt = dataArr.find((d) => d && (d.time === ts || d.time === ts / 1000));
            if (pt && pt.value != null) {
              const y = H * (1 - (pt.value - minVal) / ((maxVal - minVal) || 1));
              if (!started) { ctx.moveTo(i * totalCandleW + view.candleWidth / 2, y); started = true; }
              else ctx.lineTo(i * totalCandleW + view.candleWidth / 2, y);
            }
          }
          ctx.stroke();
        };

        if (lowerKey === 'rsi') {
          ctx.strokeStyle = 'rgba(108, 99, 255, 0.15)';
          ctx.lineWidth = 0.5;
          ctx.setLineDash([3, 3]);
          [30, 50, 70].forEach((level) => {
            const y = H * (1 - level / 100);
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(chartW, y); ctx.stroke();
          });
          ctx.setLineDash([]);
          drawIndicatorLine(indicators.rsi, COLORS.accent, 0, 100);
          ctx.fillStyle = COLORS.cardSurface;
          ctx.fillRect(chartW, 0, PRICE_AXIS_WIDTH, H);
          ctx.strokeStyle = COLORS.border;
          ctx.beginPath(); ctx.moveTo(chartW, 0); ctx.lineTo(chartW, H); ctx.stroke();
          ctx.fillStyle = COLORS.textSecondary;
          ctx.font = '9px monospace'; ctx.textAlign = 'left';
          ctx.fillText('70', chartW + 4, H * (1 - 70 / 100) + 3);
          ctx.fillText('30', chartW + 4, H * (1 - 30 / 100) + 3);
        } else if (lowerKey === 'macd') {
          let minV = Infinity, maxV = -Infinity;
          const allData = [...(indicators.macd || []), ...(indicators.macdSignal || []), ...(indicators.macdHistogram || [])];
          for (const d of allData) { if (d && d.value != null) { if (d.value < minV) minV = d.value; if (d.value > maxV) maxV = d.value; } }
          if (minV === Infinity) { minV = -1; maxV = 1; }

          if (indicators.macdHistogram) {
            for (let i = 0; i < visible.length; i++) {
              const ts = visible[i].timestamp;
              const pt = indicators.macdHistogram.find((d) => d && (d.time === ts || d.time === ts / 1000));
              if (pt && pt.value != null) {
                const zeroY = H * (1 - (0 - minV) / ((maxV - minV) || 1));
                const valY = H * (1 - (pt.value - minV) / ((maxV - minV) || 1));
                ctx.fillStyle = pt.value >= 0 ? COLORS.bullish : COLORS.bearish;
                ctx.globalAlpha = 0.4;
                ctx.fillRect(i * totalCandleW, Math.min(zeroY, valY), view.candleWidth, Math.abs(valY - zeroY) || 1);
                ctx.globalAlpha = 1;
              }
            }
          }
          drawIndicatorLine(indicators.macd, '#2196F3', minV, maxV);
          drawIndicatorLine(indicators.macdSignal, '#FF9800', minV, maxV);
          ctx.fillStyle = COLORS.cardSurface;
          ctx.fillRect(chartW, 0, PRICE_AXIS_WIDTH, H);
          ctx.strokeStyle = COLORS.border;
          ctx.beginPath(); ctx.moveTo(chartW, 0); ctx.lineTo(chartW, H); ctx.stroke();
          ctx.fillStyle = COLORS.textSecondary;
          ctx.font = '9px monospace'; ctx.textAlign = 'left';
          ctx.fillText(maxV.toFixed(2), chartW + 4, 12);
          ctx.fillText(minV.toFixed(2), chartW + 4, H - 2);
        } else {
          const dataArr = indicators[lowerKey] || [];
          let minV = Infinity, maxV = -Infinity;
          for (const d of dataArr) { if (d && d.value != null) { if (d.value < minV) minV = d.value; if (d.value > maxV) maxV = d.value; } }
          if (minV === Infinity) { minV = 0; maxV = 1; }
          drawIndicatorLine(dataArr, lowerKey === 'atr' ? '#FF9800' : '#9C27B0', minV, maxV);
          ctx.fillStyle = COLORS.cardSurface;
          ctx.fillRect(chartW, 0, PRICE_AXIS_WIDTH, H);
          ctx.strokeStyle = COLORS.border;
          ctx.beginPath(); ctx.moveTo(chartW, 0); ctx.lineTo(chartW, H); ctx.stroke();
          ctx.fillStyle = COLORS.textSecondary;
          ctx.font = '9px monospace'; ctx.textAlign = 'left';
          ctx.fillText(maxV.toFixed(2), chartW + 4, 12);
          ctx.fillText(minV.toFixed(2), chartW + 4, H - 2);
        }
      }

      ctx.restore();
    } catch (e) {
      console.warn('[Chart] lower draw error:', e.message);
    }
  }, [candleData, indicators, activeLowerIndicator]);

  // =========================================================================
  //  Resize observer — size canvases and schedule draws via rAF
  // =========================================================================
  useEffect(() => {
    let rafId = 0;

    const sizeAndDraw = () => {
      try {
        const dpr = Math.min(window.devicePixelRatio || 1, 4);
        const MAX_DIM = 8192;
        const sizeCanvas = (container, canvas) => {
          if (!container || !canvas) return;
          const rect = container.getBoundingClientRect();
          if (!rect.width || !rect.height) return;
          const w = Math.min(Math.round(rect.width * dpr), MAX_DIM);
          const h = Math.min(Math.round(rect.height * dpr), MAX_DIM);
          if (w > 0 && h > 0 && (canvas.width !== w || canvas.height !== h)) {
            canvas.width = w;
            canvas.height = h;
          }
        };
        sizeCanvas(mainContainerRef.current, mainCanvasRef.current);
        sizeCanvas(lowerContainerRef.current, lowerCanvasRef.current);
      } catch (_e) { /* ignore sizing errors */ }

      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        try { drawMainChart(); } catch (_e) { /* swallow */ }
        try { drawLowerChart(); } catch (_e) { /* swallow */ }
      });
    };

    // Initial size + draw (deferred to let DOM settle)
    const initTimer = setTimeout(sizeAndDraw, 50);

    const ro = new ResizeObserver(sizeAndDraw);
    if (mainContainerRef.current) ro.observe(mainContainerRef.current);
    if (lowerContainerRef.current) ro.observe(lowerContainerRef.current);

    return () => {
      clearTimeout(initTimer);
      cancelAnimationFrame(rafId);
      ro.disconnect();
    };
  }, [drawMainChart, drawLowerChart]);

  // =========================================================================
  //  Redraw on data changes (via rAF)
  // =========================================================================
  useEffect(() => {
    const rafId = requestAnimationFrame(() => {
      try { drawMainChart(); } catch (_e) { /* swallow */ }
      try { drawLowerChart(); } catch (_e) { /* swallow */ }
    });
    return () => cancelAnimationFrame(rafId);
  }, [drawMainChart, drawLowerChart]);

  // =========================================================================
  //  Mouse interaction: pan, zoom, crosshair
  // =========================================================================
  const drawMainRef = useRef(drawMainChart);
  const drawLowerRef = useRef(drawLowerChart);
  const candleDataRef = useRef(candleData);
  useEffect(() => { drawMainRef.current = drawMainChart; }, [drawMainChart]);
  useEffect(() => { drawLowerRef.current = drawLowerChart; }, [drawLowerChart]);
  useEffect(() => { candleDataRef.current = candleData; }, [candleData]);

  useEffect(() => {
    // Wait a tick for the canvas-creation effect to run first
    const timer = setTimeout(() => {
      const canvas = mainCanvasRef.current;
      if (!canvas) return;

      const safeDraw = () => {
        try { drawMainRef.current(); } catch (_e) { /* swallow */ }
      };
      const safeDrawBoth = () => {
        try { drawMainRef.current(); } catch (_e) { /* swallow */ }
        try { drawLowerRef.current(); } catch (_e) { /* swallow */ }
      };

      const handleWheel = (e) => {
        e.preventDefault();
        const view = viewRef.current;
        const data = candleDataRef.current;
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const chartW = rect.width - PRICE_AXIS_WIDTH;

        const oldTotalW = view.candleWidth + CANDLE_GAP;
        const oldVisibleCount = Math.floor(chartW / oldTotalW);
        const oldEndIdx = data.length - view.offset;
        const oldStartIdx = Math.max(0, oldEndIdx - oldVisibleCount);
        const cursorCandleIdx = oldStartIdx + Math.floor(mouseX / oldTotalW);
        const cursorFraction = mouseX / chartW;

        const oldWidth = view.candleWidth;
        if (e.deltaY < 0) {
          view.candleWidth = clamp(view.candleWidth + 1, 2, 40);
        } else {
          view.candleWidth = clamp(view.candleWidth - 1, 2, 40);
        }

        if (view.candleWidth !== oldWidth) {
          const newTotalW = view.candleWidth + CANDLE_GAP;
          const newVisibleCount = Math.floor(chartW / newTotalW);
          const newStartIdx = cursorCandleIdx - Math.floor(cursorFraction * newVisibleCount);
          const newEndIdx = newStartIdx + newVisibleCount;
          view.offset = clamp(data.length - newEndIdx, 0, Math.max(0, data.length - 5));
        }

        safeDrawBoth();
      };

      const handleMouseDown = (e) => {
        const view = viewRef.current;
        view.isDragging = true;
        view.dragStartX = e.clientX;
        view.dragStartOffset = view.offset;
        canvas.style.cursor = 'grabbing';
      };

      const handleMouseMove = (e) => {
        const view = viewRef.current;
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        if (view.isDragging) {
          const dx = e.clientX - view.dragStartX;
          const totalCandleW = view.candleWidth + CANDLE_GAP;
          const candleShift = Math.round(dx / totalCandleW);
          const data = candleDataRef.current;
          view.offset = clamp(view.dragStartOffset + candleShift, 0, Math.max(0, data.length - 5));
          safeDrawBoth();
        } else {
          crosshairRef.current = { x, y, visible: true };
          safeDraw();
        }
      };

      const handleMouseUp = () => {
        viewRef.current.isDragging = false;
        canvas.style.cursor = 'crosshair';
      };

      const handleMouseLeave = () => {
        viewRef.current.isDragging = false;
        crosshairRef.current.visible = false;
        canvas.style.cursor = 'crosshair';
        safeDraw();
      };

      canvas.addEventListener('wheel', handleWheel, { passive: false });
      canvas.addEventListener('mousedown', handleMouseDown);
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      canvas.addEventListener('mouseleave', handleMouseLeave);

      // Store cleanup ref
      canvas._chartCleanup = () => {
        canvas.removeEventListener('wheel', handleWheel);
        canvas.removeEventListener('mousedown', handleMouseDown);
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
        canvas.removeEventListener('mouseleave', handleMouseLeave);
      };
    }, 100);

    return () => {
      clearTimeout(timer);
      const canvas = mainCanvasRef.current;
      if (canvas && canvas._chartCleanup) {
        canvas._chartCleanup();
        delete canvas._chartCleanup;
      }
    };
  }, []);

  // =========================================================================
  //  Render — NO canvas elements in JSX (they're created via DOM above)
  // =========================================================================
  const pairOptions = useMemo(() => watchlist || [], [watchlist]);
  const lowerKey = (activeLowerIndicator || 'volume').toLowerCase();

  return (
    <div className="chart-container">
      {/* Toolbar */}
      <div className="chart-toolbar">
        <select
          className="chart-pair-selector"
          value={activePair}
          onChange={(e) => setActivePair(e.target.value)}
        >
          {pairOptions.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>

        <div className="chart-tf-group">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf.value}
              className={`chart-tf-btn ${activeTimeframe === tf.value ? 'active' : ''}`}
              onClick={() => setActiveTimeframe(tf.value)}
            >
              {tf.label}
            </button>
          ))}
        </div>

        <div className="chart-indicator-pills">
          {INDICATOR_PILL_DEFS.map((pill) => (
            <button
              key={pill.key}
              className={`chart-indicator-pill ${chartIndicators[pill.key] ? 'active' : ''}`}
              onClick={() => handleToggleIndicator(pill.key)}
            >
              {pill.label}
            </button>
          ))}
          <div style={{ position: 'relative' }}>
            <button
              className={`chart-indicator-pill ${showIndicatorPicker ? 'active' : ''}`}
              onClick={() => setShowIndicatorPicker(!showIndicatorPicker)}
            >
              + Indicators
            </button>
            {showIndicatorPicker && (
              <IndicatorPicker onClose={() => setShowIndicatorPicker(false)} />
            )}
          </div>
        </div>
      </div>

      {/* Main chart — canvas injected via DOM */}
      <div className="chart-main-area" ref={mainContainerRef} />

      {/* Lower indicator panel */}
      <div className="chart-lower-panel">
        <div className="chart-lower-tabs">
          {LOWER_INDICATORS.map((ind) => (
            <button
              key={ind}
              className={`chart-lower-tab ${lowerKey === ind ? 'active' : ''}`}
              onClick={() => handleLowerTab(ind)}
            >
              {ind}
            </button>
          ))}
        </div>
        {/* Lower canvas container — canvas injected via DOM */}
        <div className="chart-lower-canvas-wrap" ref={lowerContainerRef} />
      </div>

      {/* Recent trades ticker */}
      <div className="chart-trades-ticker">
        <span className="chart-trades-label">Trades</span>
        {recentTrades.length === 0 && (
          <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>No recent trades</span>
        )}
        {recentTrades.slice(0, 20).map((trade, i) => (
          <span
            key={trade.tradeId || trade.id || i}
            className={`chart-trade-item ${(trade.side || '').toLowerCase() === 'buy' ? 'buy' : 'sell'}`}
          >
            <span>{formatPrice(trade.price, activePair)}</span>
            <span>{trade.size}</span>
            <span className="chart-trade-time">{formatTimestamp(trade.time)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
