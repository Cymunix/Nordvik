import { useEffect, useRef, useState } from 'react'
import { levelInfoFromXp } from './levels'
import NordicCardFrame from './NordicCardFrame'

// NORDVIK level progression notifications.
//  - <XpToast>       : small "+N XP / reason" pill.
//  - <LevelUpOverlay>: centred, non-blocking level-up celebration.
//  - <LevelNotifications>: controller that watches REAL collector XP and fires
//    a toast, then (if a threshold was crossed) the overlay. No placeholder XP.

function RankEmblem() {
  return (
    <svg viewBox="0 0 72 72" fill="none" stroke="currentColor" strokeWidth="1.4"
      strokeLinecap="round" strokeLinejoin="round">
      <circle cx="36" cy="36" r="26" opacity="0.5" />
      <path d="M36 6 L41 30 L66 36 L41 42 L36 66 L31 42 L6 36 L31 30 Z" />
      <circle cx="36" cy="36" r="7" />
    </svg>
  )
}

export function XpToast({ amount, reason, onDone, duration = 2600 }) {
  useEffect(() => {
    const t = setTimeout(onDone, duration)
    return () => clearTimeout(t)
  }, [onDone, duration])
  return (
    <div className="nv-xp-toast" role="status" aria-live="polite" style={{ animationDuration: `${duration}ms` }}>
      <span className="nv-xp-toast-amt">+{Number(amount).toLocaleString()} XP</span>
      {reason ? <span className="nv-xp-toast-reason">{reason}</span> : null}
    </div>
  )
}

export function LevelUpOverlay({ fromLevel, toLevel, rank, pct = 0, xpLabel, onDone, duration = 4200 }) {
  useEffect(() => {
    const t = setTimeout(onDone, duration)
    return () => clearTimeout(t)
  }, [onDone, duration])
  const multi = toLevel - fromLevel > 1
  return (
    <div className="nv-levelup" role="status" aria-live="assertive" style={{ animationDuration: `${duration}ms` }}>
      <div className="nv-levelup-card">
        <NordicCardFrame />
        <span className="nv-levelup-glow" aria-hidden="true" />
        <span className="nv-levelup-particles" aria-hidden="true">
          {Array.from({ length: 7 }).map((_, i) => <span key={i} />)}
        </span>
        <span className="nv-levelup-emblem" aria-hidden="true"><RankEmblem /></span>
        <p className="nv-levelup-kicker">LEVEL UP</p>
        <p className="nv-levelup-num">{multi ? `${fromLevel} → ${toLevel}` : toLevel}</p>
        <p className="nv-levelup-rank">{rank}</p>
        <div className="nv-levelup-xp">
          <div className="nv-levelup-xp-track">
            <div className="nv-levelup-xp-fill" style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
          </div>
          {xpLabel ? <span className="nv-levelup-xp-label">{xpLabel}</span> : null}
        </div>
      </div>
    </div>
  )
}

export default function LevelNotifications({ xp, ownedCatalogItemCounts = {} }) {
  const uniqueItems = Object.keys(ownedCatalogItemCounts).length
  let totalCopies = 0
  for (const n of Object.values(ownedCatalogItemCounts)) totalCopies += Number(n) || 0

  const prev = useRef(null)              // last settled snapshot
  const warmupUntil = useRef(Date.now() + 3000) // absorb initial async XP settling
  const pendingLevelUp = useRef(null)
  const timer = useRef(null)
  const [toast, setToast] = useState(null)
  const [levelUp, setLevelUp] = useState(null)

  useEffect(() => {
    // Debounce: an item-add updates base XP then async XP moments later; coalesce
    // those into a single notification once the value settles.
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      const info = levelInfoFromXp(xp)
      const snap = { xp, level: info.level, unique: uniqueItems, total: totalCopies }
      if (prev.current === null || Date.now() < warmupUntil.current) {
        prev.current = snap
        return
      }
      const p = prev.current
      const dXp = xp - p.xp
      if (dXp > 0) {
        let reason = 'XP Earned'
        if (uniqueItems > p.unique) reason = 'New Item Added'
        else if (totalCopies > p.total) reason = 'Duplicate Added'
        if (info.level > p.level) {
          pendingLevelUp.current = {
            fromLevel: p.level,
            toLevel: info.level,
            rank: info.role,
            pct: info.pct,
            xpLabel: `${info.intoLevel.toLocaleString()} / ${(info.intoLevel + info.toNext).toLocaleString()} XP`,
          }
        }
        setToast({ amount: dXp, reason, id: Date.now() })
      }
      prev.current = snap
    }, 600)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [xp, uniqueItems, totalCopies])

  return (
    <>
      {toast && (
        <XpToast
          key={toast.id}
          amount={toast.amount}
          reason={toast.reason}
          onDone={() => {
            setToast(null)
            if (pendingLevelUp.current) {
              setLevelUp({ ...pendingLevelUp.current, id: Date.now() })
              pendingLevelUp.current = null
            }
          }}
        />
      )}
      {levelUp && (
        <LevelUpOverlay key={levelUp.id} {...levelUp} onDone={() => setLevelUp(null)} />
      )}
    </>
  )
}
