import NordicCardFrame from './NordicCardFrame'

// A single dashboard stat tile. Purely presentational — the parent supplies
// already-computed, real values (or omits the card entirely). Optional
// sparkline (`spark`) and `delta` render only when real history exists.
function Sparkline({ points }) {
  if (!points || points.length < 2) return null
  const w = 68
  const h = 22
  const min = Math.min(...points)
  const max = Math.max(...points)
  const span = max - min || 1
  const step = w / (points.length - 1)
  const d = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)},${(h - ((p - min) / span) * h).toFixed(1)}`)
    .join(' ')
  return (
    <svg className="nv-spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export default function StatCard({ icon, label, value, sub, spark, delta }) {
  return (
    <article className="nv-stat">
      <NordicCardFrame />
      <div className="nv-stat-head">
        {icon && <span className="nv-stat-icon">{icon}</span>}
        <span>{label}</span>
        {spark && spark.length > 1 && <span className="nv-stat-spark"><Sparkline points={spark} /></span>}
      </div>
      <p className="nv-stat-value">{value}</p>
      <p className="nv-stat-sub">
        {delta && (
          <span className={`nv-stat-delta ${delta.tone || ''}`}>{delta.text} </span>
        )}
        {sub}
      </p>
    </article>
  )
}
