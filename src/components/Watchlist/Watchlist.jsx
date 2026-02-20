import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { FixedSizeList } from 'react-window';
import useStore from '../../store';
import { formatPrice } from '../../utils/formatters';
import { DEFAULT_PAIRS } from '../../config/constants';
import './Watchlist.css';

/* ============================================================
   Watchlist — Left Sidebar with Virtualized Rows
   ============================================================ */

const ROW_HEIGHT = 36;

export default function Watchlist() {
  const watchlist = useStore((s) => s.watchlist);
  const favorites = useStore((s) => s.favorites);
  const tickers = useStore((s) => s.tickers);
  const activePair = useStore((s) => s.activePair);
  const setActivePair = useStore((s) => s.setActivePair);
  const toggleFavorite = useStore((s) => s.toggleFavorite);
  const updateWatchlist = useStore((s) => s.updateWatchlist);

  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('name');
  const [sortDir, setSortDir] = useState('asc');
  const [showAddDropdown, setShowAddDropdown] = useState(false);
  const [addSearch, setAddSearch] = useState('');

  /* Track previous prices for flash animation */
  const prevPricesRef = useRef({});
  const [flashMap, setFlashMap] = useState({});

  useEffect(() => {
    const newFlashes = {};
    for (const pair of watchlist) {
      const ticker = tickers[pair];
      if (!ticker) continue;
      const prevPrice = prevPricesRef.current[pair];
      if (prevPrice !== undefined && prevPrice !== ticker.price) {
        newFlashes[pair] = ticker.price > prevPrice ? 'flash-green' : 'flash-red';
      }
      prevPricesRef.current[pair] = ticker.price;
    }
    if (Object.keys(newFlashes).length > 0) {
      setFlashMap(newFlashes);
      const timer = setTimeout(() => setFlashMap({}), 700);
      return () => clearTimeout(timer);
    }
  }, [tickers, watchlist]);

  /* ---- Sorting and filtering ------------------------------ */
  const handleSort = useCallback(
    (col) => {
      if (sortBy === col) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortBy(col);
        setSortDir('asc');
      }
    },
    [sortBy]
  );

  const sortedList = useMemo(() => {
    let items = watchlist.map((pair) => ({
      pair,
      favorite: favorites.includes(pair),
    }));

    if (search.trim()) {
      const q = search.trim().toUpperCase();
      items = items.filter((w) => w.pair.toUpperCase().includes(q));
    }

    const favs = items.filter((w) => w.favorite);
    const nonFavs = items.filter((w) => !w.favorite);

    const sorter = (a, b) => {
      let va, vb;
      if (sortBy === 'name') {
        va = a.pair;
        vb = b.pair;
        return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
      }
      if (sortBy === 'price') {
        va = tickers[a.pair]?.price ?? 0;
        vb = tickers[b.pair]?.price ?? 0;
      } else if (sortBy === 'change') {
        va = tickers[a.pair]?.change24h ?? 0;
        vb = tickers[b.pair]?.change24h ?? 0;
      }
      return sortDir === 'asc' ? va - vb : vb - va;
    };

    favs.sort(sorter);
    nonFavs.sort(sorter);

    return [...favs, ...nonFavs];
  }, [watchlist, favorites, search, sortBy, sortDir, tickers]);

  /* ---- Available pairs for add dropdown -------------------- */
  const addOptions = useMemo(() => {
    const existing = new Set(watchlist);
    let pairs = [...DEFAULT_PAIRS];
    if (addSearch.trim()) {
      const q = addSearch.trim().toUpperCase();
      pairs = pairs.filter((p) => p.toUpperCase().includes(q));
    }
    return pairs.map((p) => ({ pair: p, alreadyAdded: existing.has(p) }));
  }, [watchlist, addSearch]);

  /* ---- Virtualized list sizing ----------------------------- */
  const containerRef = useRef(null);
  const [listHeight, setListHeight] = useState(300);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setListHeight(entry.contentRect.height);
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const Row = useCallback(
    ({ index, style }) => {
      const item = sortedList[index];
      if (!item) return null;
      const ticker = tickers[item.pair] || {};
      const price = ticker.price;
      const change = ticker.change24h;
      const isActive = activePair === item.pair;
      const flash = flashMap[item.pair] || '';

      return (
        <div
          style={style}
          className={`watchlist-row ${isActive ? 'active' : ''} ${flash}`}
          onClick={() => setActivePair(item.pair)}
        >
          <button
            className={`watchlist-star ${item.favorite ? 'favorited' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              toggleFavorite(item.pair);
            }}
            title={item.favorite ? 'Remove from favorites' : 'Add to favorites'}
          >
            {item.favorite ? '\u2605' : '\u2606'}
          </button>
          <span className="watchlist-pair-name">{item.pair}</span>
          <span className="watchlist-price">
            {price != null ? formatPrice(price, item.pair) : '--'}
          </span>
          <span
            className={`watchlist-change ${
              change != null ? (change >= 0 ? 'positive' : 'negative') : ''
            }`}
          >
            {change != null
              ? `${change >= 0 ? '+' : ''}${change.toFixed(2)}%`
              : '--'}
          </span>
        </div>
      );
    },
    [sortedList, tickers, activePair, flashMap, setActivePair, toggleFavorite]
  );

  const sortArrow = (col) => {
    if (sortBy !== col) return null;
    return (
      <span className="watchlist-sort-arrow">{sortDir === 'asc' ? '\u25B2' : '\u25BC'}</span>
    );
  };

  const handleAddPair = useCallback(
    (pair) => {
      if (!watchlist.includes(pair)) {
        updateWatchlist([...watchlist, pair]);
      }
    },
    [watchlist, updateWatchlist]
  );

  return (
    <div className="watchlist-container">
      <div className="watchlist-header">
        <div className="watchlist-title">Watchlist</div>
        <input
          className="watchlist-search"
          type="text"
          placeholder="Search pairs..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="watchlist-col-headers">
        <div className="watchlist-col-star" />
        <div
          className={`watchlist-col-header watchlist-col-pair ${sortBy === 'name' ? 'active' : ''}`}
          onClick={() => handleSort('name')}
        >
          Pair {sortArrow('name')}
        </div>
        <div
          className={`watchlist-col-header watchlist-col-price ${sortBy === 'price' ? 'active' : ''}`}
          onClick={() => handleSort('price')}
        >
          Price {sortArrow('price')}
        </div>
        <div
          className={`watchlist-col-header watchlist-col-change ${sortBy === 'change' ? 'active' : ''}`}
          onClick={() => handleSort('change')}
        >
          24h {sortArrow('change')}
        </div>
      </div>

      <div className="watchlist-list" ref={containerRef}>
        {sortedList.length > 0 ? (
          <FixedSizeList
            height={listHeight}
            width="100%"
            itemCount={sortedList.length}
            itemSize={ROW_HEIGHT}
          >
            {Row}
          </FixedSizeList>
        ) : (
          <div className="watchlist-empty">No pairs match your search</div>
        )}
      </div>

      <div className="watchlist-add-area">
        <button className="watchlist-add-btn" onClick={() => setShowAddDropdown((v) => !v)}>
          + Add Pair
        </button>
        {showAddDropdown && (
          <div className="watchlist-add-dropdown">
            <input
              className="watchlist-add-search"
              type="text"
              placeholder="Search available pairs..."
              value={addSearch}
              onChange={(e) => setAddSearch(e.target.value)}
              autoFocus
            />
            {addOptions.map((opt) => (
              <div
                key={opt.pair}
                className={`watchlist-add-option ${opt.alreadyAdded ? 'already-added' : ''}`}
                onClick={() => {
                  if (!opt.alreadyAdded) {
                    handleAddPair(opt.pair);
                  }
                }}
              >
                <span>{opt.pair}</span>
                {opt.alreadyAdded && <span style={{ fontSize: 10 }}>Added</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
