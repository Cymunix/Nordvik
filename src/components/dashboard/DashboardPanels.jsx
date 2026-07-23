// Small presentational dashboard panels.
// UpcomingEvents has no data source yet (Events is "coming soon"), so it
// renders an honest empty state — never fabricated events. BuildYourLegacy
// is a static promo whose CTA reuses existing navigation.

export function UpcomingEvents() {
  return (
    <article className="nv-panel">
      <div className="nv-panel-head">
        <span className="nv-panel-title">Upcoming Events</span>
      </div>
      <p className="nv-panel-empty">No upcoming events yet — this space lights up once Events launches.</p>
    </article>
  )
}

export function BuildYourLegacy({ onExplore }) {
  return (
    <article className="nv-legacy">
      <div className="nv-legacy-rune" aria-hidden="true">
        <svg viewBox="0 0 60 120" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="14" y="6" width="32" height="108" rx="8" opacity="0.5" />
          <path d="M30 20v80M30 40l14-12M30 40L16 28M30 64l14 12M30 64l-14 12" strokeLinecap="round" />
        </svg>
      </div>
      <div className="nv-legacy-body">
        <h3 className="nv-legacy-title">Build Your Legacy</h3>
        <p className="nv-legacy-text">Track, trade and treasure the world’s greatest collectibles.</p>
        <button type="button" className="nv-btn nv-btn-primary" onClick={onExplore}>Explore Collection</button>
      </div>
    </article>
  )
}
