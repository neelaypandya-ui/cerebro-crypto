import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import useStore from '../../store';
import { formatTimestamp } from '../../utils/formatters';
import './AIAssistant.css';

/* ============================================================
   AIAssistant — Collapsible AI Chat Panel (Right Sidebar)
   ============================================================ */

/* Persisted chat in localStorage */
const CHAT_KEY = 'cerebro_ai_chat';

const loadMessages = () => {
  try {
    const raw = localStorage.getItem(CHAT_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
};

const saveMessages = (msgs) => {
  try {
    localStorage.setItem(CHAT_KEY, JSON.stringify(msgs.slice(-50)));
  } catch { /* ignore */ }
};

export default function AIAssistant() {
  const activePair = useStore((s) => s.activePair);
  const tickers = useStore((s) => s.tickers);
  const currentRegime = useStore((s) => s.currentRegime);
  const indicators = useStore((s) => s.indicators);
  const positions = useStore((s) => s.positions);
  const paperPortfolio = useStore((s) => s.paperPortfolio);
  const tradingMode = useStore((s) => s.tradingMode);

  const [messages, setMessages] = useState(loadMessages);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef(null);

  /* Scroll to bottom on new message */
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  /* Save messages on change */
  useEffect(() => {
    saveMessages(messages);
  }, [messages]);

  /* ---- Build market context ------------------------------- */
  const buildContext = useCallback(() => {
    const ticker = tickers[activePair] || {};
    const activePositions = tradingMode === 'paper' ? (paperPortfolio.positions || []) : positions;

    const ctx = [
      `Active pair: ${activePair}`,
      `Current price: ${ticker.price || 'N/A'}`,
      `24h change: ${ticker.change24h != null ? ticker.change24h.toFixed(2) + '%' : 'N/A'}`,
      `Market regime: ${currentRegime}`,
      `Trading mode: ${tradingMode}`,
      `Open positions: ${activePositions.length}`,
    ];

    if (activePositions.length > 0) {
      ctx.push('Positions:');
      activePositions.forEach((p) => {
        ctx.push(`  - ${p.pair}: entry=${p.entryPrice}, qty=${p.quantity}, sl=${p.stopLoss || 'none'}`);
      });
    }

    /* Include available indicator summaries */
    if (indicators.rsi?.length > 0) {
      const lastRsi = indicators.rsi[indicators.rsi.length - 1];
      ctx.push(`RSI: ${lastRsi.value?.toFixed(1) || 'N/A'}`);
    }

    return ctx.join('\n');
  }, [activePair, tickers, currentRegime, indicators, positions, paperPortfolio, tradingMode]);

  /* ---- Send message --------------------------------------- */
  const handleSend = useCallback(async (text) => {
    const content = text || input.trim();
    if (!content) return;

    const context = buildContext();
    const fullPrompt = `[Market Context]\n${context}\n\n[User Question]\n${content}`;

    const userMsg = {
      id: Date.now(),
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setSending(true);

    try {
      /* Attempt to call AI API through proxy */
      const aiApiKey = localStorage.getItem('aiApiKey') || '';
      const aiProvider = localStorage.getItem('aiProvider') || 'claude';
      const aiModel = localStorage.getItem('aiModel') || 'claude-sonnet-4-20250514';

      let responseText = '';

      if (aiApiKey) {
        try {
          const response = await fetch('/api/ai/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              provider: aiProvider,
              model: aiModel,
              messages: [
                {
                  role: 'system',
                  content: 'You are Cerebro, a cryptocurrency trading assistant. Provide concise, actionable analysis based on the market context provided. Focus on technical analysis, risk management, and trading opportunities.',
                },
                ...messages.slice(-10).map((m) => ({ role: m.role, content: m.content })),
                { role: 'user', content: fullPrompt },
              ],
            }),
          });

          if (response.ok) {
            const data = await response.json();
            responseText = data.content || data.choices?.[0]?.message?.content || 'No response';
          } else {
            responseText = 'AI service unavailable. Check your API key in Settings.';
          }
        } catch (err) {
          responseText = `AI request failed: ${err.message}. Configure API key in Settings.`;
        }
      } else {
        responseText = generateLocalResponse(content, context);
      }

      const assistantMsg = {
        id: Date.now() + 1,
        role: 'assistant',
        content: responseText,
        timestamp: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      const errorMsg = {
        id: Date.now() + 1,
        role: 'assistant',
        content: `Error: ${err.message}`,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setSending(false);
    }
  }, [input, messages, buildContext]);

  /* ---- Handle Enter key ----------------------------------- */
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  /* ---- Quick prompt buttons ------------------------------- */
  const quickPrompts = useMemo(() => [
    { label: `Analyze ${activePair}`, text: `Analyze the current setup for ${activePair}. What do the technicals suggest?` },
    { label: 'Entry check', text: `Should I enter a position on ${activePair} right now? Consider the regime, indicators, and risk.` },
    { label: 'S/R levels', text: `What are the key support and resistance levels for ${activePair}?` },
    { label: 'Review positions', text: 'Review my open positions. Should I adjust stops or take profits on any?' },
    { label: 'Risk/Reward', text: `What is the risk/reward for a long entry on ${activePair} at current price?` },
    { label: 'Best setup', text: 'Which pair on my watchlist has the best setup right now?' },
  ], [activePair]);

  return (
    <div className="ai-container">
      {/* Messages */}
      <div className="ai-messages">
        {messages.length === 0 ? (
          <div className="ai-empty">
            Ask Cerebro about market conditions, trading setups, or position management.
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className={`ai-message ${msg.role}`}>
              <div className="ai-message-header">
                <span className="ai-message-role">{msg.role}</span>
                <span className="ai-message-time">{formatTimestamp(msg.timestamp)}</span>
              </div>
              <div className="ai-message-content">{msg.content}</div>
            </div>
          ))
        )}
        {sending && <div className="ai-typing">Cerebro is thinking...</div>}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick prompts */}
      <div className="ai-quick-prompts">
        {quickPrompts.map((qp) => (
          <button
            key={qp.label}
            className="ai-quick-prompt"
            onClick={() => handleSend(qp.text)}
            disabled={sending}
          >
            {qp.label}
          </button>
        ))}
      </div>

      {/* Input area */}
      <div className="ai-input-area">
        <textarea
          className="ai-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask Cerebro..."
          rows={1}
          disabled={sending}
        />
        <button
          className="ai-send-btn"
          onClick={() => handleSend()}
          disabled={sending || !input.trim()}
        >
          Send
        </button>
      </div>
    </div>
  );
}

/* ---- Local fallback response when no API key -------------- */
function generateLocalResponse(question, context) {
  const q = question.toLowerCase();
  const lines = context.split('\n');

  const price = lines.find((l) => l.startsWith('Current price:'))?.split(':')[1]?.trim() || 'N/A';
  const regime = lines.find((l) => l.startsWith('Market regime:'))?.split(':')[1]?.trim() || 'unknown';
  const pair = lines.find((l) => l.startsWith('Active pair:'))?.split(':')[1]?.trim() || 'BTC-USD';

  if (q.includes('analyze') || q.includes('setup')) {
    return `**${pair} Analysis**\n\nCurrent price: ${price}\nRegime: ${regime}\n\nTo provide detailed analysis, please configure your AI API key in Settings. Without it, I can only show basic market context.\n\nGeneral guidance for ${regime} regime:\n${regime === 'bullish' ? '- Look for momentum and breakout entries\n- Trail stops to lock in profits' : regime === 'choppy' ? '- Focus on mean reversion setups\n- Tighter stops, smaller position sizes' : '- Capital preservation mode\n- Avoid new entries\n- Tighten stops on existing positions'}`;
  }

  if (q.includes('entry') || q.includes('should i')) {
    return `**Entry Assessment for ${pair}**\n\nPrice: ${price}\nRegime: ${regime}\n\n${regime === 'bearish' ? 'The market is in a bearish regime. It is generally advisable to avoid new entries and focus on capital preservation.' : 'For detailed entry analysis with indicator signals and risk/reward calculations, configure your AI API key in Settings.'}\n\nAlways ensure proper position sizing and stop-loss placement.`;
  }

  if (q.includes('support') || q.includes('resistance') || q.includes('s/r')) {
    return `**Support & Resistance for ${pair}**\n\nFor accurate S/R level identification using technical analysis, please configure your AI API key in Settings.\n\nGeneral approach:\n- Check recent swing highs/lows on the chart\n- Look for areas of high volume (volume profile)\n- EMA lines often act as dynamic support/resistance\n- VWAP is an important intraday level`;
  }

  if (q.includes('position') || q.includes('review')) {
    const posCount = lines.find((l) => l.startsWith('Open positions:'))?.split(':')[1]?.trim() || '0';
    return `**Position Review**\n\nOpen positions: ${posCount}\nRegime: ${regime}\n\n${posCount === '0' ? 'No open positions to review.' : 'For detailed position analysis with specific recommendations on stops and targets, configure your AI API key in Settings.'}`;
  }

  return `**Cerebro AI**\n\nI received your question about: "${question.slice(0, 50)}..."\n\nPair: ${pair} | Price: ${price} | Regime: ${regime}\n\nFor full AI-powered analysis, please configure your API key in Settings (gear icon in the top bar). I support Claude and OpenAI models.`;
}
