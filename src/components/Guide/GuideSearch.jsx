export default function GuideSearch({ query, onSearch }) {
  return (
    <div className="guide-search">
      <input
        className="guide-search-input"
        type="text"
        placeholder="Search guide..."
        value={query}
        onChange={(e) => onSearch(e.target.value)}
      />
    </div>
  );
}
