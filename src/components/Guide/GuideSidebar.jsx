export default function GuideSidebar({ sections, active, onSelect }) {
  return (
    <nav className="guide-nav">
      <div className="guide-nav-title">User Guide</div>
      {sections.map((sec) => (
        <button
          key={sec.id}
          className={`guide-nav-item ${active === sec.id ? 'active' : ''}`}
          onClick={() => onSelect(sec.id)}
        >
          {sec.title}
        </button>
      ))}
    </nav>
  );
}
