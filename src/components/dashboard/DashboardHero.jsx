// Cinematic hero band for the dashboard. Personalised with the real
// signed-in user's greeting/name; quick actions reuse existing nav handlers.
// The emblems beside the name are purely decorative Nordic ornament — they
// carry no status/level data.
function HeroEmblems() {
  return (
    <span className="nv-hero-emblems" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4"><circle cx="12" cy="12" r="9" /><path d="M12 3v18M3 12h18M12 12l6-6M12 12l-6 6" strokeLinecap="round" /></svg>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z" /><path d="M9 12l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" /></svg>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M12 2l2.6 6.8L21 9.3l-5 4.4L17.6 21 12 17.3 6.4 21 8 13.7l-5-4.4 6.4-.5z" /></svg>
    </span>
  )
}

export default function DashboardHero({
  eyebrow,
  name,
  quote,
  actions = [],
  emblems = false,
}) {
  return (
    <section className="nv-hero">
      {eyebrow ? <p className="nv-hero-eyebrow">{eyebrow}</p> : null}
      <h1 className="nv-hero-name">
        {name}
        {emblems ? <HeroEmblems /> : null}
      </h1>
      {quote ? <p className="nv-hero-quote">{quote}</p> : null}
      {actions.length > 0 && (
        <div className="nv-hero-actions">
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              className={`nv-btn${action.primary ? ' nv-btn-primary' : ''}`}
              onClick={action.onClick}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
