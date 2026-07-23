// Placeholder screen for navigation targets that aren't built yet.
export default function UnderConstruction({ label = 'This section' }) {
  return (
    <div className="nv-construction">
      <div className="nv-construction-card">
        <span className="nv-construction-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 21h18" />
            <path d="M5 21V10l7-5 7 5v11" />
            <path d="M9 21v-6h6v6" />
            <path d="M2 9l10-7 10 7" />
          </svg>
        </span>
        <h2 className="nv-construction-title">Under Construction</h2>
        <p className="nv-construction-text">
          {label} isn’t available yet — we’re still building it. Check back soon.
        </p>
      </div>
    </div>
  )
}
