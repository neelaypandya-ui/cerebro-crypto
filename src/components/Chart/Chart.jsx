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
    ctx.clearRect(0, 0, 1, 1);
    return ctx;
  } catch (_e) {
    try {
      const w = canvas.width, h = canvas.height;
      canvas.width = 0; canvas.height = 0;
      canvas.width = w; canvas.height = h;
      return canvas.getContext('2d');
    } catch (_e2) { return null; }
  }
}

// ---- Drawing helpers -------------------------------------------------------
const CANDLE_GAP = 2;
const PRICE_AXIS_WIDTH = 70;
const TIME_AXIS_HEIGHT = 24;
const VOLUME_HEIGHT_RATIO = 0.18;

function clamp(val, min, max) { return Math.max(min, Math.min(max, val)); }

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
  const watchlist = useStore((s) => s.watchlist);

  const candleData = useMemo(() => candles[activeTimeframe] || [], [candles, activeTimeframe]);

  const mainCanvasRef = useRef(null);
  const lowerCanvasRef = useRef(null);
  const mainContainerRef = useRef(null);
  const lowerContainerRef = useRef(null);

  const viewRef = useRef({ offset: 0, candleWidth: 8, isDragging: false, dragStartX: 0, dragStartOffset: 0 });
  const crosshairRef = useRef({ x: -1, y: -1, visible: false });
  const [showIndicatorPicker, setShowIndicatorPicker] = useState(false);

  const handleToggleIndicator = (key) => { setChartIndicators({ [key]: !chartIndicators[key] }); };
  const handleLowerTab = (ind) => { useStore.setState({ activeLowerIndicator: ind }); };

  // Create canvas elements via DOM (outside React's tree)
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
      try { mc.removeChild(mainCanvas); } catch (_e) {}
      try { lc.removeChild(lowerCanvas); } catch (_e) {}
    };
  }, []);

  useEffect(() => { viewRef.current.offset = 0; }, [activePair, activeTimeframe]);

  // === Main chart draw ===
  const drawMainChart = useCallback(() => {
    try {
      const canvas = mainCanvasRef.current;
      if (!canvas) return;
      const ctx = safeGetCtx(canvas);
      if (!ctx) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 4);
      const W = canvas.width / dpr, H = canvas.height / dpr;
      if (W <= 0 || H <= 0 || !isFinite(W) || !isFinite(H)) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save(); ctx.scale(dpr, dpr);

      const data = candleData;
      if (data.length === 0) {
        ctx.fillStyle = COLORS.textSecondary; ctx.font = '13px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('Waiting for ' + activePair + '...', W / 2, H / 2);
        ctx.restore(); return;
      }

      const view = viewRef.current;
      const chartW = W - PRICE_AXIS_WIDTH, chartH = H - TIME_AXIS_HEIGHT;
      const volumeH = chartH * VOLUME_HEIGHT_RATIO, priceH = chartH - volumeH;
      const totalCandleW = view.candleWidth + CANDLE_GAP;
      const visibleCount = Math.floor(chartW / totalCandleW);
      const endIdx = data.length - view.offset;
      const startIdx = Math.max(0, endIdx - visibleCount);
      const visible = data.slice(startIdx, Math.max(startIdx, endIdx));
      if (visible.length === 0) { ctx.restore(); return; }

      let priceMin = Infinity, priceMax = -Infinity, volMax = 0;
      for (const c of visible) {
        if (c.low < priceMin) priceMin = c.low;
        if (c.high > priceMax) priceMax = c.high;
        if (c.volume > volMax) volMax = c.volume;
      }
      const pricePad = (priceMax - priceMin || 1) * 0.06;
      priceMin -= pricePad; priceMax += pricePad;
      const finalPriceRange = priceMax - priceMin;
      const priceToY = (p) => priceH * (1 - (p - priceMin) / finalPriceRange);
      const volToY = (v) => chartH - (v / (volMax || 1)) * volumeH;

      // Grid
      ctx.strokeStyle = 'rgba(30,30,46,0.5)'; ctx.lineWidth = 0.5;
      const pStep = niceStep(finalPriceRange, 6);
      const pStart = Math.ceil(priceMin / pStep) * pStep;
      for (let p = pStart; p <= priceMax; p += pStep) {
        const y = priceToY(p);
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(chartW, y); ctx.stroke();
      }

      // Volume bars
      for (let i = 0; i < visible.length; i++) {
        const c = visible[i], x = i * totalCandleW;
        ctx.fillStyle = c.close >= c.open ? 'rgba(0,212,170,0.25)' : 'rgba(255,69,96,0.25)';
        ctx.fillRect(x, volToY(c.volume), view.candleWidth, chartH - volToY(c.volume));
      }

      // Candles
      for (let i = 0; i < visible.length; i++) {
        const c = visible[i], x = i * totalCandleW, barW = view.candleWidth;
        const color = c.close >= c.open ? COLORS.bullish : COLORS.bearish;
        ctx.strokeStyle = color; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x + barW / 2, priceToY(c.high)); ctx.lineTo(x + barW / 2, priceToY(c.low)); ctx.stroke();
        const bodyTop = priceToY(Math.max(c.open, c.close));
        const bodyBot = priceToY(Math.min(c.open, c.close));
        ctx.fillStyle = color; ctx.fillRect(x, bodyTop, barW, Math.max(bodyBot - bodyTop, 1));
      }

      // Overlay indicators — arrays are aligned 1:1 with candle data (raw number arrays)
      const drawLine = (dataArr, color, dashed) => {
        if (!dataArr || !dataArr.length) return;
        ctx.strokeStyle = color; ctx.lineWidth = 1;
        ctx.setLineDash(dashed ? [4, 3] : []);
        ctx.beginPath(); let started = false;
        for (let i = 0; i < visible.length; i++) {
          const dataIdx = startIdx + i;
          const val = dataIdx < dataArr.length ? dataArr[dataIdx] : null;
          if (val != null) {
            const y = priceToY(val);
            if (!started) { ctx.moveTo(i * totalCandleW + view.candleWidth / 2, y); started = true; }
            else ctx.lineTo(i * totalCandleW + view.candleWidth / 2, y);
          }
        }
        ctx.stroke(); ctx.setLineDash([]);
      };
      if (chartIndicators.ema9) drawLine(indicators.ema9, '#2196F3');
      if (chartIndicators.ema21) drawLine(indicators.ema21, '#FF9800');
      if (chartIndicators.ema50) drawLine(indicators.ema50, '#9C27B0');
      if (chartIndicators.sma200) drawLine(indicators.sma200, '#FFFFFF', true);
      if (chartIndicators.vwap) drawLine(indicators.vwap, '#f0b429', true);
      if (chartIndicators.bbands && indicators.bbands) {
        drawLine(indicators.bbands.upper, 'rgba(136,136,170,0.5)');
        drawLine(indicators.bbands.lower, 'rgba(136,136,170,0.5)');
        drawLine(indicators.bbands.middle, 'rgba(136,136,170,0.3)', true);
      }

      // Price axis
      ctx.fillStyle = COLORS.cardSurface; ctx.fillRect(chartW, 0, PRICE_AXIS_WIDTH, chartH);
      ctx.strokeStyle = COLORS.border; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(chartW, 0); ctx.lineTo(chartW, chartH); ctx.stroke();
      ctx.fillStyle = COLORS.textSecondary; ctx.font = '10px monospace'; ctx.textAlign = 'left';
      for (let p = pStart; p <= priceMax; p += pStep) ctx.fillText(formatPrice(p, activePair), chartW + 4, priceToY(p) + 3);

      // Current price
      if (visible.length > 0) {
        const last = visible[visible.length - 1], labelY = priceToY(last.close);
        ctx.fillStyle = last.close >= last.open ? COLORS.bullish : COLORS.bearish;
        ctx.fillRect(chartW, labelY - 8, PRICE_AXIS_WIDTH, 16);
        ctx.fillStyle = '#000'; ctx.font = 'bold 10px monospace';
        ctx.fillText(formatPrice(last.close, activePair), chartW + 4, labelY + 4);
      }

      // Time axis
      ctx.fillStyle = COLORS.cardSurface; ctx.fillRect(0, chartH, W, TIME_AXIS_HEIGHT);
      ctx.strokeStyle = COLORS.border;
      ctx.beginPath(); ctx.moveTo(0, chartH); ctx.lineTo(W, chartH); ctx.stroke();
      ctx.fillStyle = COLORS.textSecondary; ctx.font = '9px monospace'; ctx.textAlign = 'center';
      const labelEvery = Math.max(1, Math.floor(visibleCount / 8));
      for (let i = 0; i < visible.length; i += labelEvery)
        ctx.fillText(formatTimestamp(visible[i].timestamp), i * totalCandleW + view.candleWidth / 2, chartH + 14);

      // Crosshair
      const ch = crosshairRef.current;
      if (ch.visible && ch.x >= 0 && ch.x < chartW && ch.y >= 0 && ch.y < chartH) {
        ctx.strokeStyle = 'rgba(108,99,255,0.4)'; ctx.lineWidth = 0.5; ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.moveTo(0, ch.y); ctx.lineTo(chartW, ch.y); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(ch.x, 0); ctx.lineTo(ch.x, chartH); ctx.stroke();
        ctx.setLineDash([]);
        const hoverPrice = priceMin + (1 - ch.y / priceH) * finalPriceRange;
        ctx.fillStyle = 'rgba(108,99,255,0.8)'; ctx.fillRect(chartW, ch.y - 8, PRICE_AXIS_WIDTH, 16);
        ctx.fillStyle = '#fff'; ctx.font = '10px monospace'; ctx.textAlign = 'left';
        ctx.fillText(formatPrice(hoverPrice, activePair), chartW + 4, ch.y + 4);
        const ci = Math.floor(ch.x / totalCandleW);
        if (ci >= 0 && ci < visible.length) {
          const hc = visible[ci];
          ctx.fillStyle = 'rgba(18,18,26,0.85)'; ctx.fillRect(4, 4, 220, 68);
          ctx.strokeStyle = COLORS.border; ctx.lineWidth = 1; ctx.strokeRect(4, 4, 220, 68);
          ctx.fillStyle = COLORS.textPrimary; ctx.font = '10px monospace'; ctx.textAlign = 'left';
          [`T: ${formatTimestamp(hc.timestamp)}`,
           `O: ${formatPrice(hc.open, activePair)}  H: ${formatPrice(hc.high, activePair)}`,
           `L: ${formatPrice(hc.low, activePair)}  C: ${formatPrice(hc.close, activePair)}`,
           `Vol: ${abbreviateNumber(hc.volume)}`
          ].forEach((l, li) => ctx.fillText(l, 10, 18 + li * 14));
        }
      }
      ctx.restore();
    } catch (e) { console.warn('[Chart] main draw error:', e); }
  }, [candleData, activePair, indicators, chartIndicators]);

  // === Lower chart draw ===
  const drawLowerChart = useCallback(() => {
    try {
      const canvas = lowerCanvasRef.current;
      if (!canvas) return;
      const ctx = safeGetCtx(canvas);
      if (!ctx) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 4);
      const W = canvas.width / dpr, H = canvas.height / dpr;
      if (W <= 0 || H <= 0 || !isFinite(W) || !isFinite(H)) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save(); ctx.scale(dpr, dpr);
      const data = candleData;
      if (!data.length) { ctx.restore(); return; }
      const view = viewRef.current;
      const chartW = W - PRICE_AXIS_WIDTH, totalCandleW = view.candleWidth + CANDLE_GAP;
      const visibleCount = Math.floor(chartW / totalCandleW);
      const endIdx = data.length - view.offset, startIdx = Math.max(0, endIdx - visibleCount);
      const visible = data.slice(startIdx, Math.max(startIdx, endIdx));
      const lowerKey = (activeLowerIndicator || 'volume').toLowerCase();

      if (lowerKey === 'volume') {
        let maxVol = 0;
        for (const c of visible) if (c.volume > maxVol) maxVol = c.volume;
        for (let i = 0; i < visible.length; i++) {
          const c = visible[i], barH = (c.volume / (maxVol || 1)) * (H - 4);
          ctx.fillStyle = c.close >= c.open ? 'rgba(0,212,170,0.5)' : 'rgba(255,69,96,0.5)';
          ctx.fillRect(i * totalCandleW, H - barH, view.candleWidth, barH);
        }
        ctx.fillStyle = COLORS.cardSurface; ctx.fillRect(chartW, 0, PRICE_AXIS_WIDTH, H);
        ctx.strokeStyle = COLORS.border; ctx.beginPath(); ctx.moveTo(chartW, 0); ctx.lineTo(chartW, H); ctx.stroke();
        ctx.fillStyle = COLORS.textSecondary; ctx.font = '9px monospace'; ctx.textAlign = 'left';
        ctx.fillText(abbreviateNumber(maxVol), chartW + 4, 12); ctx.fillText('0', chartW + 4, H - 2);
      } else {
        const drawIL = (arr, color, mn, mx) => {
          if (!arr || !arr.length) return;
          ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.beginPath(); let started = false;
          for (let i = 0; i < visible.length; i++) {
            const dataIdx = startIdx + i;
            const val = dataIdx < arr.length ? arr[dataIdx] : null;
            if (val != null) {
              const y = H * (1 - (val - mn) / ((mx - mn) || 1));
              if (!started) { ctx.moveTo(i * totalCandleW + view.candleWidth / 2, y); started = true; }
              else ctx.lineTo(i * totalCandleW + view.candleWidth / 2, y);
            }
          }
          ctx.stroke();
        };
        // Helper to find min/max of a raw number array within the visible range
        const rangeOf = (arr) => {
          let mn = Infinity, mx = -Infinity;
          for (let i = 0; i < visible.length; i++) {
            const v = arr[startIdx + i];
            if (v != null) { if (v < mn) mn = v; if (v > mx) mx = v; }
          }
          return [mn, mx];
        };
        if (lowerKey === 'rsi') {
          ctx.strokeStyle = 'rgba(108,99,255,0.15)'; ctx.lineWidth = 0.5; ctx.setLineDash([3, 3]);
          [30, 50, 70].forEach((lv) => { const y = H * (1 - lv / 100); ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(chartW, y); ctx.stroke(); });
          ctx.setLineDash([]); drawIL(indicators.rsi, COLORS.accent, 0, 100);
          ctx.fillStyle = COLORS.cardSurface; ctx.fillRect(chartW, 0, PRICE_AXIS_WIDTH, H);
          ctx.strokeStyle = COLORS.border; ctx.beginPath(); ctx.moveTo(chartW, 0); ctx.lineTo(chartW, H); ctx.stroke();
          ctx.fillStyle = COLORS.textSecondary; ctx.font = '9px monospace'; ctx.textAlign = 'left';
          ctx.fillText('70', chartW + 4, H * 0.3 + 3); ctx.fillText('30', chartW + 4, H * 0.7 + 3);
        } else if (lowerKey === 'macd') {
          const macdData = indicators.macd;
          const macdLine = macdData ? (macdData.macd || []) : [];
          const signalLine = macdData ? (macdData.signal || []) : [];
          const histLine = macdData ? (macdData.histogram || []) : [];
          let mn = Infinity, mx = -Infinity;
          for (const arr of [macdLine, signalLine, histLine]) {
            const [aMn, aMx] = rangeOf(arr);
            if (aMn < mn) mn = aMn; if (aMx > mx) mx = aMx;
          }
          if (mn === Infinity) { mn = -1; mx = 1; }
          if (histLine.length) {
            for (let i = 0; i < visible.length; i++) {
              const dataIdx = startIdx + i;
              const val = dataIdx < histLine.length ? histLine[dataIdx] : null;
              if (val != null) {
                const zY = H * (1 - (0 - mn) / ((mx - mn) || 1)), vY = H * (1 - (val - mn) / ((mx - mn) || 1));
                ctx.fillStyle = val >= 0 ? COLORS.bullish : COLORS.bearish;
                ctx.globalAlpha = 0.4; ctx.fillRect(i * totalCandleW, Math.min(zY, vY), view.candleWidth, Math.abs(vY - zY) || 1); ctx.globalAlpha = 1;
              }
            }
          }
          drawIL(macdLine, '#2196F3', mn, mx); drawIL(signalLine, '#FF9800', mn, mx);
          ctx.fillStyle = COLORS.cardSurface; ctx.fillRect(chartW, 0, PRICE_AXIS_WIDTH, H);
          ctx.strokeStyle = COLORS.border; ctx.beginPath(); ctx.moveTo(chartW, 0); ctx.lineTo(chartW, H); ctx.stroke();
          ctx.fillStyle = COLORS.textSecondary; ctx.font = '9px monospace'; ctx.textAlign = 'left';
          ctx.fillText(mx.toFixed(2), chartW + 4, 12); ctx.fillText(mn.toFixed(2), chartW + 4, H - 2);
        } else {
          const arr = indicators[lowerKey] || [];
          let mn = Infinity, mx = -Infinity;
          for (let i = 0; i < visible.length; i++) {
            const v = arr[startIdx + i];
            if (v != null) { if (v < mn) mn = v; if (v > mx) mx = v; }
          }
          if (mn === Infinity) { mn = 0; mx = 1; }
          drawIL(arr, lowerKey === 'atr' ? '#FF9800' : '#9C27B0', mn, mx);
          ctx.fillStyle = COLORS.cardSurface; ctx.fillRect(chartW, 0, PRICE_AXIS_WIDTH, H);
          ctx.strokeStyle = COLORS.border; ctx.beginPath(); ctx.moveTo(chartW, 0); ctx.lineTo(chartW, H); ctx.stroke();
          ctx.fillStyle = COLORS.textSecondary; ctx.font = '9px monospace'; ctx.textAlign = 'left';
          ctx.fillText(mx.toFixed(2), chartW + 4, 12); ctx.fillText(mn.toFixed(2), chartW + 4, H - 2);
        }
      }
      ctx.restore();
    } catch (e) { console.warn('[Chart] lower draw error:', e); }
  }, [candleData, indicators, activeLowerIndicator]);

  // === Resize + draw ===
  useEffect(() => {
    let rafId = 0;
    const sizeAndDraw = () => {
      try {
        const dpr = Math.min(window.devicePixelRatio || 1, 4);
        const size = (container, canvas) => {
          if (!container || !canvas) return;
          const r = container.getBoundingClientRect();
          if (!r.width || !r.height) return;
          const w = Math.min(Math.round(r.width * dpr), 8192), h = Math.min(Math.round(r.height * dpr), 8192);
          if (w > 0 && h > 0 && (canvas.width !== w || canvas.height !== h)) { canvas.width = w; canvas.height = h; }
        };
        size(mainContainerRef.current, mainCanvasRef.current);
        size(lowerContainerRef.current, lowerCanvasRef.current);
      } catch (_e) {}
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        try { drawMainChart(); } catch (_e) {}
        try { drawLowerChart(); } catch (_e) {}
      });
    };
    const t = setTimeout(sizeAndDraw, 50);
    const ro = new ResizeObserver(sizeAndDraw);
    if (mainContainerRef.current) ro.observe(mainContainerRef.current);
    if (lowerContainerRef.current) ro.observe(lowerContainerRef.current);
    return () => { clearTimeout(t); cancelAnimationFrame(rafId); ro.disconnect(); };
  }, [drawMainChart, drawLowerChart]);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      try { drawMainChart(); } catch (_e) {}
      try { drawLowerChart(); } catch (_e) {}
    });
    return () => cancelAnimationFrame(id);
  }, [drawMainChart, drawLowerChart]);

  // === Mouse interaction ===
  const drawMainRef = useRef(drawMainChart);
  const drawLowerRef = useRef(drawLowerChart);
  const candleDataRef = useRef(candleData);
  useEffect(() => { drawMainRef.current = drawMainChart; }, [drawMainChart]);
  useEffect(() => { drawLowerRef.current = drawLowerChart; }, [drawLowerChart]);
  useEffect(() => { candleDataRef.current = candleData; }, [candleData]);

  useEffect(() => {
    const timer = setTimeout(() => {
      const canvas = mainCanvasRef.current;
      if (!canvas) return;
      const sd = () => { try { drawMainRef.current(); } catch (_e) {} };
      const sdb = () => { try { drawMainRef.current(); } catch (_e) {} try { drawLowerRef.current(); } catch (_e) {} };

      const onWheel = (e) => {
        e.preventDefault();
        const view = viewRef.current, data = candleDataRef.current;
        const rect = canvas.getBoundingClientRect(), mouseX = e.clientX - rect.left;
        const chartW = rect.width - PRICE_AXIS_WIDTH;
        const oldTW = view.candleWidth + CANDLE_GAP, oldVC = Math.floor(chartW / oldTW);
        const oldEI = data.length - view.offset, oldSI = Math.max(0, oldEI - oldVC);
        const cci = oldSI + Math.floor(mouseX / oldTW), cf = mouseX / chartW;
        const oldW = view.candleWidth;
        view.candleWidth = clamp(view.candleWidth + (e.deltaY < 0 ? 1 : -1), 2, 40);
        if (view.candleWidth !== oldW) {
          const nTW = view.candleWidth + CANDLE_GAP, nVC = Math.floor(chartW / nTW);
          const nSI = cci - Math.floor(cf * nVC);
          view.offset = clamp(data.length - (nSI + nVC), 0, Math.max(0, data.length - 5));
        }
        sdb();
      };
      const onDown = (e) => { const v = viewRef.current; v.isDragging = true; v.dragStartX = e.clientX; v.dragStartOffset = v.offset; canvas.style.cursor = 'grabbing'; };
      const onMove = (e) => {
        const view = viewRef.current, rect = canvas.getBoundingClientRect();
        if (view.isDragging) {
          const dx = e.clientX - view.dragStartX, tw = view.candleWidth + CANDLE_GAP;
          view.offset = clamp(view.dragStartOffset + Math.round(dx / tw), 0, Math.max(0, candleDataRef.current.length - 5));
          sdb();
        } else { crosshairRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top, visible: true }; sd(); }
      };
      const onUp = () => { viewRef.current.isDragging = false; canvas.style.cursor = 'crosshair'; };
      const onLeave = () => { viewRef.current.isDragging = false; crosshairRef.current.visible = false; canvas.style.cursor = 'crosshair'; sd(); };

      canvas.addEventListener('wheel', onWheel, { passive: false });
      canvas.addEventListener('mousedown', onDown);
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
      canvas.addEventListener('mouseleave', onLeave);
      canvas._cleanup = () => {
        canvas.removeEventListener('wheel', onWheel);
        canvas.removeEventListener('mousedown', onDown);
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        canvas.removeEventListener('mouseleave', onLeave);
      };
    }, 100);
    return () => { clearTimeout(timer); const c = mainCanvasRef.current; if (c && c._cleanup) { c._cleanup(); delete c._cleanup; } };
  }, []);

  // === Render (no canvas in JSX — they're DOM-created) ===
  const pairOptions = useMemo(() => watchlist || [], [watchlist]);
  const lowerKey = (activeLowerIndicator || 'volume').toLowerCase();

  return (
    <div className="chart-container">
      <div className="chart-toolbar">
        <select className="chart-pair-selector" value={activePair} onChange={(e) => setActivePair(e.target.value)}>
          {pairOptions.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <div className="chart-tf-group">
          {TIMEFRAMES.map((tf) => (
            <button key={tf.value} className={`chart-tf-btn ${activeTimeframe === tf.value ? 'active' : ''}`} onClick={() => setActiveTimeframe(tf.value)}>{tf.label}</button>
          ))}
        </div>
        <div className="chart-indicator-pills">
          {INDICATOR_PILL_DEFS.map((pill) => (
            <button key={pill.key} className={`chart-indicator-pill ${chartIndicators[pill.key] ? 'active' : ''}`} onClick={() => handleToggleIndicator(pill.key)}>{pill.label}</button>
          ))}
          <div style={{ position: 'relative' }}>
            <button className={`chart-indicator-pill ${showIndicatorPicker ? 'active' : ''}`} onClick={() => setShowIndicatorPicker(!showIndicatorPicker)}>+ Indicators</button>
            {showIndicatorPicker && <IndicatorPicker onClose={() => setShowIndicatorPicker(false)} />}
          </div>
        </div>
      </div>
      <div className="chart-main-area" ref={mainContainerRef} />
      <div className="chart-lower-panel">
        <div className="chart-lower-tabs">
          {LOWER_INDICATORS.map((ind) => (
            <button key={ind} className={`chart-lower-tab ${lowerKey === ind ? 'active' : ''}`} onClick={() => handleLowerTab(ind)}>{ind}</button>
          ))}
        </div>
        <div className="chart-lower-canvas-wrap" ref={lowerContainerRef} />
      </div>
    </div>
  );
}
