/* ============================================================
   Cerebro Crypto — IndexedDB Persistence Layer
   ============================================================
   Uses the `idb` library for a promise-based IndexedDB wrapper.
   ============================================================ */

import { openDB } from 'idb';

const DB_NAME = 'cerebro-crypto';
const DB_VERSION = 2;

/** @type {import('idb').IDBPDatabase|null} */
let dbInstance = null;

// ---------------------------------------------------------------------------
// Initialise / open database
// ---------------------------------------------------------------------------

/**
 * Open (or create) the IndexedDB database and return the connection.
 * Safe to call multiple times – returns the cached instance.
 */
export async function initDB() {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // ---- trades store ---------------------------------------------------
      if (!db.objectStoreNames.contains('trades')) {
        const trades = db.createObjectStore('trades', { keyPath: 'id' });
        trades.createIndex('pair', 'pair', { unique: false });
        trades.createIndex('timestamp', 'timestamp', { unique: false });
        trades.createIndex('strategy', 'strategy', { unique: false });
      }

      // ---- candles store --------------------------------------------------
      if (!db.objectStoreNames.contains('candles')) {
        const candles = db.createObjectStore('candles', { autoIncrement: true });
        candles.createIndex('pairTimeframe', ['pair', 'timeframe'], { unique: false });
        candles.createIndex('timestamp', 'timestamp', { unique: false });
      }

      // ---- paperTrades store ----------------------------------------------
      if (!db.objectStoreNames.contains('paperTrades')) {
        const paper = db.createObjectStore('paperTrades', { keyPath: 'id' });
        paper.createIndex('pair', 'pair', { unique: false });
        paper.createIndex('timestamp', 'timestamp', { unique: false });
      }

      // ---- alerts store ---------------------------------------------------
      if (!db.objectStoreNames.contains('alerts')) {
        const alerts = db.createObjectStore('alerts', { keyPath: 'id' });
        alerts.createIndex('pair', 'pair', { unique: false });
        alerts.createIndex('type', 'type', { unique: false });
      }

      // ---- signals store --------------------------------------------------
      if (!db.objectStoreNames.contains('signals')) {
        const signals = db.createObjectStore('signals', { keyPath: 'id' });
        signals.createIndex('strategy', 'strategy', { unique: false });
        signals.createIndex('pair', 'pair', { unique: false });
        signals.createIndex('createdAt', 'createdAt', { unique: false });
      }

      // ---- strategyPerformance store --------------------------------------
      if (!db.objectStoreNames.contains('strategyPerformance')) {
        db.createObjectStore('strategyPerformance', { keyPath: 'key' });
      }
    },
  });

  return dbInstance;
}

// ---------------------------------------------------------------------------
// Trades
// ---------------------------------------------------------------------------

/**
 * Save a single trade record.
 */
export async function saveTrade(trade) {
  const db = await initDB();
  return db.put('trades', trade);
}

/**
 * Retrieve trades with optional filters.
 * @param {{ pair?: string, startDate?: number, endDate?: number }} filters
 */
export async function getTrades(filters = {}) {
  const db = await initDB();
  let results;

  if (filters.pair) {
    results = await db.getAllFromIndex('trades', 'pair', filters.pair);
  } else {
    results = await db.getAll('trades');
  }

  // Apply date filters in-memory
  if (filters.startDate) {
    results = results.filter((t) => t.timestamp >= filters.startDate);
  }
  if (filters.endDate) {
    results = results.filter((t) => t.timestamp <= filters.endDate);
  }

  // Sort newest-first
  results.sort((a, b) => b.timestamp - a.timestamp);
  return results;
}

// ---------------------------------------------------------------------------
// Candles
// ---------------------------------------------------------------------------

/**
 * Bulk-save candles for a given pair and timeframe.
 */
export async function saveCandles(pair, timeframe, candles) {
  const db = await initDB();
  const tx = db.transaction('candles', 'readwrite');
  const store = tx.objectStore('candles');

  for (const c of candles) {
    await store.put({ ...c, pair, timeframe });
  }

  await tx.done;
}

/**
 * Retrieve cached candles for a pair/timeframe within a time range.
 */
export async function getCandles(pair, timeframe, start, end) {
  const db = await initDB();
  const index = db.transaction('candles', 'readonly')
    .objectStore('candles')
    .index('pairTimeframe');

  const results = await index.getAll([pair, timeframe]);

  return results
    .filter((c) => {
      if (start && c.timestamp < start) return false;
      if (end && c.timestamp > end) return false;
      return true;
    })
    .sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Delete all cached candle data.
 */
export async function clearCandleCache() {
  const db = await initDB();
  return db.clear('candles');
}

// ---------------------------------------------------------------------------
// Paper Trades
// ---------------------------------------------------------------------------

/**
 * Save a paper-trading trade record.
 */
export async function savePaperTrade(trade) {
  const db = await initDB();
  return db.put('paperTrades', trade);
}

/**
 * Retrieve paper trades with optional filters.
 */
export async function getPaperTrades(filters = {}) {
  const db = await initDB();
  let results;

  if (filters.pair) {
    results = await db.getAllFromIndex('paperTrades', 'pair', filters.pair);
  } else {
    results = await db.getAll('paperTrades');
  }

  if (filters.startDate) {
    results = results.filter((t) => t.timestamp >= filters.startDate);
  }
  if (filters.endDate) {
    results = results.filter((t) => t.timestamp <= filters.endDate);
  }

  results.sort((a, b) => b.timestamp - a.timestamp);
  return results;
}

// ---------------------------------------------------------------------------
// Signals
// ---------------------------------------------------------------------------

/**
 * Save a strategy signal record.
 */
export async function saveSignal(signal) {
  const db = await initDB();
  return db.put('signals', {
    ...signal,
    id: signal.id || `sig-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    createdAt: signal.createdAt || Date.now(),
  });
}

/**
 * Retrieve signals with optional filters.
 * @param {{ strategy?: string, pair?: string, startDate?: number, endDate?: number }} filters
 */
export async function getSignals(filters = {}) {
  const db = await initDB();
  let results;

  if (filters.strategy) {
    results = await db.getAllFromIndex('signals', 'strategy', filters.strategy);
  } else if (filters.pair) {
    results = await db.getAllFromIndex('signals', 'pair', filters.pair);
  } else {
    results = await db.getAll('signals');
  }

  if (filters.startDate) {
    results = results.filter((s) => s.createdAt >= filters.startDate);
  }
  if (filters.endDate) {
    results = results.filter((s) => s.createdAt <= filters.endDate);
  }

  results.sort((a, b) => b.createdAt - a.createdAt);
  return results;
}

// ---------------------------------------------------------------------------
// Strategy Performance
// ---------------------------------------------------------------------------

/**
 * Save strategy performance metrics.
 */
export async function saveStrategyPerformance(perfData) {
  const db = await initDB();
  return db.put('strategyPerformance', perfData);
}

/**
 * Get strategy performance by key.
 */
export async function getStrategyPerformance(key) {
  const db = await initDB();
  if (key) {
    return db.get('strategyPerformance', key);
  }
  return db.getAll('strategyPerformance');
}

// ---------------------------------------------------------------------------
// Export helpers
// ---------------------------------------------------------------------------

/**
 * Export all trades as a CSV string.
 */
export async function exportTradesCSV() {
  const trades = await getTrades();
  if (trades.length === 0) return '';

  const headers = Object.keys(trades[0]);
  const rows = trades.map((t) =>
    headers.map((h) => {
      const val = t[h];
      // Wrap strings that may contain commas in quotes
      if (typeof val === 'string' && val.includes(',')) return `"${val}"`;
      if (val === null || val === undefined) return '';
      return String(val);
    }).join(',')
  );

  return [headers.join(','), ...rows].join('\n');
}

/**
 * Export all trades as a JSON string.
 */
export async function exportTradesJSON() {
  const trades = await getTrades();
  return JSON.stringify(trades, null, 2);
}
