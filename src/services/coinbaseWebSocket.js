/* ============================================================
   Cerebro Crypto — Coinbase Advanced Trade WebSocket Manager
   ============================================================
   Maintains a single persistent connection to Coinbase with
   auto-reconnect, heartbeat, and centralized message routing.
   ============================================================ */

import { WS_URL, WS_RECONNECT_DELAYS } from '../config/constants.js';
import { coinbaseREST } from './coinbaseREST.js';

class CoinbaseWebSocket {
  constructor() {
    /** @type {WebSocket|null} */
    this._ws = null;

    /** Connection status */
    this._status = 'disconnected'; // disconnected | connecting | connected | reconnecting

    /** Reconnect state */
    this._reconnectAttempt = 0;
    this._reconnectTimer = null;
    this._intentionalClose = false;

    /** Heartbeat timer */
    this._heartbeatTimer = null;

    /**
     * Active subscriptions.
     * Map<channel, { productIds: Set<string>, callbacks: Set<Function> }>
     */
    this._subscriptions = new Map();

    /** Status-change listeners */
    this._statusListeners = new Set();

    // Bind methods so they can be passed as callbacks safely
    this._onOpen = this._onOpen.bind(this);
    this._onMessage = this._onMessage.bind(this);
    this._onClose = this._onClose.bind(this);
    this._onError = this._onError.bind(this);
  }

  // =========================================================================
  //  Public API
  // =========================================================================

  /**
   * Open the WebSocket connection.
   */
  connect() {
    if (this._ws && (this._ws.readyState === WebSocket.OPEN || this._ws.readyState === WebSocket.CONNECTING)) {
      return; // already connected / connecting
    }

    this._intentionalClose = false;
    this._setStatus('connecting');

    this._ws = new WebSocket(WS_URL);
    this._ws.addEventListener('open', this._onOpen);
    this._ws.addEventListener('message', this._onMessage);
    this._ws.addEventListener('close', this._onClose);
    this._ws.addEventListener('error', this._onError);
  }

  /**
   * Gracefully close the connection.
   */
  disconnect() {
    this._intentionalClose = true;
    this._clearTimers();

    if (this._ws) {
      this._ws.removeEventListener('open', this._onOpen);
      this._ws.removeEventListener('message', this._onMessage);
      this._ws.removeEventListener('close', this._onClose);
      this._ws.removeEventListener('error', this._onError);

      if (this._ws.readyState === WebSocket.OPEN || this._ws.readyState === WebSocket.CONNECTING) {
        this._ws.close(1000, 'Client disconnect');
      }
      this._ws = null;
    }

    this._setStatus('disconnected');
  }

  /**
   * Subscribe to a channel for a set of product IDs.
   * @param {string}   channel     - e.g. 'ticker', 'level2', 'market_trades', 'user', 'heartbeats'
   * @param {string[]} productIds  - e.g. ['BTC-USD']
   * @param {Function} callback    - invoked with each message for this channel
   */
  async subscribe(channel, productIds, callback) {
    // Track the subscription locally
    if (!this._subscriptions.has(channel)) {
      this._subscriptions.set(channel, { productIds: new Set(), callbacks: new Set() });
    }

    const sub = this._subscriptions.get(channel);
    productIds.forEach((id) => sub.productIds.add(id));
    if (callback) sub.callbacks.add(callback);

    // Send the subscribe frame if connected
    if (this._ws && this._ws.readyState === WebSocket.OPEN) {
      await this._sendSubscribe(channel, productIds);
    }
  }

  /**
   * Unsubscribe from a channel for specific product IDs.
   */
  async unsubscribe(channel, productIds) {
    const sub = this._subscriptions.get(channel);
    if (!sub) return;

    productIds.forEach((id) => sub.productIds.delete(id));

    // If no product IDs left, remove the whole subscription
    if (sub.productIds.size === 0) {
      this._subscriptions.delete(channel);
    }

    if (this._ws && this._ws.readyState === WebSocket.OPEN) {
      await this._sendUnsubscribe(channel, productIds);
    }
  }

  /**
   * Return current connection status.
   */
  getStatus() {
    return this._status;
  }

  /**
   * Register a listener that fires whenever the status changes.
   * Returns an unsubscribe function.
   */
  onStatusChange(callback) {
    this._statusListeners.add(callback);
    return () => this._statusListeners.delete(callback);
  }

  // =========================================================================
  //  Internal – connection lifecycle
  // =========================================================================

  _onOpen() {
    console.log('[WS] Connected to Coinbase');
    this._reconnectAttempt = 0;
    this._setStatus('connected');
    this._startHeartbeat();

    // Resubscribe to all tracked channels
    this._resubscribeAll();
  }

  _onMessage(event) {
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch {
      return; // ignore non-JSON frames
    }

    let channel = msg.channel;
    if (!channel) return;

    // Coinbase uses different channel names in responses vs subscriptions
    // e.g. subscribe with "level2" but responses arrive as "l2_data"
    const CHANNEL_ALIASES = { l2_data: 'level2' };
    if (CHANNEL_ALIASES[channel]) {
      channel = CHANNEL_ALIASES[channel];
    }

    // Route to registered callbacks
    const sub = this._subscriptions.get(channel);
    if (sub) {
      sub.callbacks.forEach((cb) => {
        try {
          cb(msg);
        } catch (err) {
          console.error(`[WS] Callback error on channel "${channel}":`, err);
        }
      });
    }
  }

  _onClose(event) {
    console.warn('[WS] Connection closed', event.code, event.reason);
    this._clearTimers();

    if (this._intentionalClose) {
      this._setStatus('disconnected');
      return;
    }

    // Auto-reconnect
    this._setStatus('reconnecting');
    this._scheduleReconnect();
  }

  _onError(event) {
    console.error('[WS] Error', event);
    // onClose will fire next and handle reconnection
  }

  // =========================================================================
  //  Internal – reconnect
  // =========================================================================

  _scheduleReconnect() {
    const delay =
      WS_RECONNECT_DELAYS[Math.min(this._reconnectAttempt, WS_RECONNECT_DELAYS.length - 1)];
    console.log(`[WS] Reconnecting in ${delay}ms (attempt ${this._reconnectAttempt + 1})`);

    this._reconnectTimer = setTimeout(() => {
      this._reconnectAttempt++;
      this.connect();
    }, delay);
  }

  // =========================================================================
  //  Internal – heartbeat
  // =========================================================================

  _startHeartbeat() {
    this._clearHeartbeat();
    // Subscribe to the heartbeats channel to keep the connection alive
    this.subscribe('heartbeats', [], null);

    // Also send a ping-like resubscribe every 30 seconds as a keep-alive
    this._heartbeatTimer = setInterval(() => {
      if (this._ws && this._ws.readyState === WebSocket.OPEN) {
        // Coinbase keeps the connection alive as long as heartbeats channel is subscribed
        // This interval is just a safety net
      }
    }, 30000);
  }

  _clearHeartbeat() {
    if (this._heartbeatTimer) {
      clearInterval(this._heartbeatTimer);
      this._heartbeatTimer = null;
    }
  }

  // =========================================================================
  //  Internal – subscribe / unsubscribe frames
  // =========================================================================

  async _sendSubscribe(channel, productIds) {
    try {
      // Get auth credentials from our proxy
      const auth = await coinbaseREST.getWsAuth(channel, productIds);

      const frame = {
        type: 'subscribe',
        channel,
        product_ids: productIds,
        ...auth, // api_key, timestamp, signature
      };

      this._ws.send(JSON.stringify(frame));
    } catch (err) {
      console.error(`[WS] Failed to subscribe to "${channel}":`, err);
    }
  }

  async _sendUnsubscribe(channel, productIds) {
    try {
      const auth = await coinbaseREST.getWsAuth(channel, productIds);

      const frame = {
        type: 'unsubscribe',
        channel,
        product_ids: productIds,
        ...auth,
      };

      this._ws.send(JSON.stringify(frame));
    } catch (err) {
      console.error(`[WS] Failed to unsubscribe from "${channel}":`, err);
    }
  }

  async _resubscribeAll() {
    for (const [channel, sub] of this._subscriptions) {
      const productIds = [...sub.productIds];
      if (productIds.length > 0 || channel === 'heartbeats') {
        await this._sendSubscribe(channel, productIds);
      }
    }
  }

  // =========================================================================
  //  Internal – helpers
  // =========================================================================

  _setStatus(status) {
    if (this._status === status) return;
    this._status = status;
    this._statusListeners.forEach((cb) => {
      try {
        cb(status);
      } catch {
        /* ignore */
      }
    });
  }

  _clearTimers() {
    this._clearHeartbeat();
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton export
// ---------------------------------------------------------------------------
const coinbaseWS = new CoinbaseWebSocket();
export default coinbaseWS;
