// ============================================================================
// Cerebro Crypto - Express Proxy Server
// ============================================================================
// Sits between the React frontend and Coinbase Advanced Trade API.
//   1. Security  - API keys never leave the server.
//   2. Paper Trading - Orders are intercepted and simulated in paper mode.
//
// Supports both CDP API keys (ES256/EdDSA JWT) and legacy keys.
// Environment variables (from .env):
//   COINBASE_API_KEY    - CDP key name or legacy UUID
//   COINBASE_API_SECRET - PEM private key (CDP) or base64-encoded key (legacy)
//   PROXY_PORT          - port for this server (default 3002)
// ============================================================================

import express from 'express';
import cors from 'cors';
import crypto from 'node:crypto';
import dotenv from 'dotenv';

dotenv.config();

const API_KEY    = process.env.COINBASE_API_KEY;
const API_SECRET = process.env.COINBASE_API_SECRET;
const PORT       = parseInt(process.env.PROXY_PORT, 10) || 3002;

const COINBASE_BASE_URL = 'https://api.coinbase.com';

if (!API_KEY || !API_SECRET) {
  console.error('[proxy] COINBASE_API_KEY and COINBASE_API_SECRET must be set in .env');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Detect key type and prepare signing key
// ---------------------------------------------------------------------------

let keyType = 'unknown';
let signingKey = null;

if (API_SECRET.includes('-----BEGIN')) {
  // CDP key with PEM-encoded EC private key (ES256)
  keyType = 'ec_pem';
  signingKey = crypto.createPrivateKey(API_SECRET);
  console.log('[proxy] Detected CDP API key (ES256 PEM)');
} else {
  // Legacy key or raw Ed25519 key (base64-encoded)
  const rawBytes = Buffer.from(API_SECRET, 'base64');

  if (rawBytes.length === 64) {
    // 64 bytes = Ed25519 private key (32-byte seed + 32-byte public key)
    keyType = 'ed25519';
    const ED25519_PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');
    const seed = rawBytes.slice(0, 32);
    const pkcs8Der = Buffer.concat([ED25519_PKCS8_PREFIX, seed]);
    signingKey = crypto.createPrivateKey({ key: pkcs8Der, format: 'der', type: 'pkcs8' });
    console.log('[proxy] Detected Ed25519 API key (EdDSA)');
  } else if (rawBytes.length === 32) {
    // 32 bytes = might be a raw EC P-256 private key
    keyType = 'ec_raw';
    // Wrap in PKCS8 DER for P-256
    const EC_P256_PKCS8_PREFIX = Buffer.from(
      '30810287020100301306072a8648ce3d020106082a8648ce3d030107046d306b0201010420',
      'hex'
    );
    const EC_P256_PKCS8_SUFFIX = Buffer.from(
      'a14403420004',
      'hex'
    );
    // Without the public key we can't construct full PKCS8, fall back to HMAC
    keyType = 'hmac';
    signingKey = rawBytes;
    console.log('[proxy] Detected 32-byte key, using HMAC fallback');
  } else {
    // Unknown format, try HMAC
    keyType = 'hmac';
    signingKey = rawBytes;
    console.log('[proxy] Unknown key format (' + rawBytes.length + ' bytes), using HMAC fallback');
  }
}

// ---------------------------------------------------------------------------
// JWT Generation
// ---------------------------------------------------------------------------

function base64url(buf) {
  return Buffer.from(buf).toString('base64url');
}

/**
 * Generate a JWT for Coinbase Advanced Trade API REST requests.
 * @param {string} method - HTTP method (GET, POST, etc.)
 * @param {string} path - Request path (e.g. "/api/v3/brokerage/accounts")
 * @returns {string} JWT token
 */
function generateRESTJWT(method, path) {
  const now = Math.floor(Date.now() / 1000);
  const nonce = crypto.randomBytes(16).toString('hex');

  // URI format: "METHOD host/path" (no protocol)
  const uri = `${method} api.coinbase.com${path}`;

  if (keyType === 'ed25519') {
    const header = { alg: 'EdDSA', typ: 'JWT', kid: API_KEY, nonce };
    const payload = { iss: 'cdp', sub: API_KEY, nbf: now, exp: now + 120, uri };
    const signingInput = base64url(JSON.stringify(header)) + '.' + base64url(JSON.stringify(payload));
    const signature = crypto.sign(null, Buffer.from(signingInput), signingKey);
    return signingInput + '.' + base64url(signature);
  }

  if (keyType === 'ec_pem') {
    const header = { alg: 'ES256', typ: 'JWT', kid: API_KEY, nonce };
    const payload = { iss: 'cdp', sub: API_KEY, nbf: now, exp: now + 120, uri };
    const signingInput = base64url(JSON.stringify(header)) + '.' + base64url(JSON.stringify(payload));
    const signature = crypto.sign('SHA256', Buffer.from(signingInput), {
      key: signingKey,
      dsaEncoding: 'ieee-p1363',
    });
    return signingInput + '.' + base64url(signature);
  }

  // HMAC fallback (legacy keys)
  return null;
}

/**
 * Generate a JWT for Coinbase WebSocket authentication.
 * WebSocket JWTs omit the URI field.
 */
function generateWSJWT() {
  const now = Math.floor(Date.now() / 1000);
  const nonce = crypto.randomBytes(16).toString('hex');

  if (keyType === 'ed25519') {
    const header = { alg: 'EdDSA', typ: 'JWT', kid: API_KEY, nonce };
    const payload = { iss: 'cdp', sub: API_KEY, nbf: now, exp: now + 120 };
    const signingInput = base64url(JSON.stringify(header)) + '.' + base64url(JSON.stringify(payload));
    const signature = crypto.sign(null, Buffer.from(signingInput), signingKey);
    return signingInput + '.' + base64url(signature);
  }

  if (keyType === 'ec_pem') {
    const header = { alg: 'ES256', typ: 'JWT', kid: API_KEY, nonce };
    const payload = { iss: 'cdp', sub: API_KEY, nbf: now, exp: now + 120 };
    const signingInput = base64url(JSON.stringify(header)) + '.' + base64url(JSON.stringify(payload));
    const signature = crypto.sign('SHA256', Buffer.from(signingInput), {
      key: signingKey,
      dsaEncoding: 'ieee-p1363',
    });
    return signingInput + '.' + base64url(signature);
  }

  return null;
}

/**
 * Build auth headers for Coinbase REST API.
 * Uses JWT Bearer token for CDP/Ed25519 keys, or HMAC headers for legacy keys.
 */
function buildCoinbaseHeaders(method, requestPath, body = '') {
  const jwt = generateRESTJWT(method, requestPath);

  if (jwt) {
    return {
      'Authorization': `Bearer ${jwt}`,
      'Content-Type': 'application/json',
    };
  }

  // HMAC fallback for legacy keys
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const message = timestamp + method + requestPath + body;
  const signature = crypto
    .createHmac('sha256', signingKey)
    .update(message)
    .digest('base64');

  return {
    'CB-ACCESS-KEY':       API_KEY,
    'CB-ACCESS-SIGN':      signature,
    'CB-ACCESS-TIMESTAMP': timestamp,
    'Content-Type':        'application/json',
  };
}

/**
 * Build WebSocket auth credentials.
 * Returns JWT for CDP/Ed25519 keys, or HMAC signature for legacy keys.
 */
function buildWebSocketAuth(channel, productIds) {
  const jwt = generateWSJWT();

  if (jwt) {
    return { jwt, api_key: API_KEY, timestamp: Math.floor(Date.now() / 1000).toString() };
  }

  // HMAC fallback
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const message = timestamp + channel + productIds.join(',');
  const signature = crypto
    .createHmac('sha256', signingKey)
    .update(message)
    .digest('hex');

  return { api_key: API_KEY, timestamp, signature };
}

// ---------------------------------------------------------------------------
// In-Memory State
// ---------------------------------------------------------------------------

let tradingMode = 'paper';
const priceCache = {};

// ---------------------------------------------------------------------------
// Paper Trading Helpers
// ---------------------------------------------------------------------------

function simulatePaperFill(orderPayload) {
  const { product_id = 'BTC-USD', side = 'BUY', order_configuration } = orderPayload;

  let basePrice = priceCache[product_id] || 0;
  if (basePrice === 0) {
    console.warn(`[paper] No cached price for ${product_id}`);
  }

  const slippageFactor = side === 'BUY' ? 1.0005 : 0.9995;
  const fillPrice = parseFloat((basePrice * slippageFactor).toFixed(2));

  let baseSize = '0';
  let quoteSize = '0';

  if (order_configuration) {
    const marketCfg = order_configuration.market_market_ioc;
    const limitCfg = order_configuration.limit_limit_gtc;
    if (marketCfg) {
      baseSize = marketCfg.base_size || '0';
      quoteSize = marketCfg.quote_size || '0';
    } else if (limitCfg) {
      baseSize = limitCfg.base_size || '0';
    }
  }

  if (parseFloat(baseSize) === 0 && parseFloat(quoteSize) > 0 && fillPrice > 0) {
    baseSize = (parseFloat(quoteSize) / fillPrice).toFixed(8);
  }

  const filledValue = parseFloat(baseSize) * fillPrice;
  const fee = parseFloat((filledValue * 0.006).toFixed(2));
  const orderId = crypto.randomUUID();

  return {
    success: true,
    success_response: {
      order_id: orderId,
      product_id,
      side,
      client_order_id: orderPayload.client_order_id || crypto.randomUUID(),
    },
    order: {
      order_id: orderId,
      product_id,
      side,
      status: 'FILLED',
      time_in_force: 'IMMEDIATE_OR_CANCEL',
      created_time: new Date().toISOString(),
      completion_percentage: '100',
      filled_size: baseSize,
      average_filled_price: fillPrice.toString(),
      fee,
      number_of_fills: '1',
      filled_value: filledValue.toFixed(2),
      order_type: 'MARKET',
      total_fees: fee.toString(),
      total_value_after_fees:
        side === 'BUY' ? (filledValue + fee).toFixed(2) : (filledValue - fee).toFixed(2),
      is_paper_trade: true,
    },
  };
}

function updatePriceCache(path, jsonBody) {
  try {
    if (/^products\/[\w-]+$/.test(path) && jsonBody.price) {
      priceCache[path.split('/')[1]] = parseFloat(jsonBody.price);
      return;
    }
    if (/^products\/[\w-]+\/ticker$/.test(path)) {
      const price = jsonBody.price || (jsonBody.trades?.[0]?.price);
      if (price) priceCache[path.split('/')[1]] = parseFloat(price);
      return;
    }
    if (path === 'products' && Array.isArray(jsonBody.products)) {
      for (const p of jsonBody.products) {
        if (p.product_id && p.price) priceCache[p.product_id] = parseFloat(p.price);
      }
    }
    if (path === 'best_bid_ask' && Array.isArray(jsonBody.pricebooks)) {
      for (const book of jsonBody.pricebooks) {
        if (book.product_id && book.bids?.length > 0) {
          const bid = parseFloat(book.bids[0].price || 0);
          const ask = book.asks?.length > 0 ? parseFloat(book.asks[0].price || 0) : bid;
          if (bid > 0) priceCache[book.product_id] = (bid + ask) / 2;
        }
      }
    }
  } catch { /* price caching is best-effort */ }
}

// ---------------------------------------------------------------------------
// Express App
// ---------------------------------------------------------------------------

const app = express();
app.use(cors());
app.use(express.json());

// Health Check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', mode: tradingMode, keyType });
});

// Trading Mode
app.get('/api/mode', (_req, res) => res.json({ mode: tradingMode }));

app.post('/api/mode', (req, res) => {
  const { mode } = req.body;
  if (mode !== 'paper' && mode !== 'live') {
    return res.status(400).json({ error: 'Invalid mode. Must be "paper" or "live".' });
  }
  tradingMode = mode;
  console.log(`[proxy] Trading mode set to: ${tradingMode}`);
  res.json({ mode: tradingMode });
});

// WebSocket Auth
app.post('/api/ws-auth', (req, res) => {
  const { channel, product_ids } = req.body;
  if (!channel) {
    return res.status(400).json({ error: 'Need "channel" field.' });
  }
  const ids = Array.isArray(product_ids) ? product_ids : [];
  try {
    const auth = buildWebSocketAuth(channel, ids);
    res.json(auth);
  } catch (err) {
    console.error('[proxy] WS auth error:', err.message);
    res.status(500).json({ error: 'Failed to generate WebSocket auth.' });
  }
});

// Coinbase REST Proxy
app.all('/api/coinbase/*', async (req, res) => {
  try {
    const subPath = req.params[0];
    if (!subPath) return res.status(400).json({ error: 'No path specified.' });

    const method = req.method.toUpperCase();

    // Paper trading intercept
    if (tradingMode === 'paper' && method === 'POST' && subPath === 'orders') {
      console.log('[paper] Simulating order fill');
      return res.json(simulatePaperFill(req.body));
    }

    const requestPath = `/api/v3/brokerage/${subPath}`;
    const targetUrl = new URL(requestPath, COINBASE_BASE_URL);
    const queryString = new URLSearchParams(req.query).toString();
    if (queryString) targetUrl.search = queryString;

    const hasBody = !['GET', 'HEAD'].includes(method);
    const bodyStr = hasBody && req.body ? JSON.stringify(req.body) : '';

    // Sign with the path only (no query string) for JWT URI
    const headers = buildCoinbaseHeaders(method, requestPath, bodyStr);

    const fetchOptions = { method, headers };
    if (hasBody && bodyStr) fetchOptions.body = bodyStr;

    console.log(`[proxy] ${method} ${targetUrl.href}`);
    const cbResponse = await fetch(targetUrl.href, fetchOptions);
    const responseText = await cbResponse.text();

    let responseJson = null;
    try { responseJson = JSON.parse(responseText); } catch { /* not JSON */ }

    if (responseJson) updatePriceCache(subPath, responseJson);

    // Log auth failures for debugging
    if (cbResponse.status === 401) {
      console.error(`[proxy] AUTH FAILED (${cbResponse.status}): ${responseText.slice(0, 200)}`);
      console.error(`[proxy] Key type: ${keyType}, Key: ${API_KEY.slice(0, 12)}...`);
    }

    res.status(cbResponse.status);
    res.set('Content-Type', cbResponse.headers.get('content-type') || 'application/json');
    res.send(responseText);
  } catch (err) {
    console.error('[proxy] Error:', err.message);
    res.status(502).json({ error: 'Proxy request failed.', message: err.message });
  }
});

// Start Server
app.listen(PORT, () => {
  console.log(`[proxy] Cerebro Crypto proxy running on port ${PORT}`);
  console.log(`[proxy] Key type: ${keyType} | Mode: ${tradingMode}`);
  console.log(`[proxy] API key: ${API_KEY.slice(0, 12)}...`);
});
