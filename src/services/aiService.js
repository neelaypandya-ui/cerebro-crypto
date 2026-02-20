/* ============================================================
   Cerebro Crypto — AI Chat Service
   ============================================================
   Proxies requests to Claude or OpenAI through the backend so
   API keys are never exposed client-side.
   ============================================================ */

import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 60000, // AI responses can be slow
  headers: { 'Content-Type': 'application/json' },
});

/**
 * @typedef {Object} AIChatSettings
 * @property {'claude'|'openai'} provider
 * @property {string}            apiKey   - stored server-side; sent only on first config
 * @property {string}            model    - e.g. 'claude-sonnet-4-20250514' or 'gpt-4o'
 */

export const aiService = {
  /**
   * Send a chat message and return the assistant response.
   *
   * @param {Array<{role: string, content: string}>} messages
   * @param {AIChatSettings} settings
   * @returns {Promise<{role: string, content: string}>}
   */
  sendMessage: async (messages, settings = {}) => {
    const { provider, apiKey, model } = settings;

    // If no provider/key is configured, return a helpful placeholder
    if (!provider || !apiKey) {
      return {
        role: 'assistant',
        content:
          'AI service not yet configured. Add your API key in Settings.',
      };
    }

    try {
      const response = await api.post('/ai/chat', {
        provider,
        model,
        messages,
      });

      return {
        role: 'assistant',
        content: response.data?.content || response.data?.choices?.[0]?.message?.content || '',
      };
    } catch (error) {
      const errMsg =
        error.response?.data?.error ||
        error.message ||
        'Unknown AI service error';
      console.error('[aiService]', errMsg);
      return {
        role: 'assistant',
        content: `Error from AI service: ${errMsg}`,
      };
    }
  },
};

export default aiService;
