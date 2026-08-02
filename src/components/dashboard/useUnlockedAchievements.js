import { useEffect, useState } from 'react'

// Achievements are permanent: once unlocked they stay unlocked, even if the
// underlying stat later drops (e.g. you sell an item). We union the currently
// satisfied achievements with a persisted set of previously-unlocked ids and
// only ever grow it. Persisted per user so it survives reloads.
const ACH_KEY = (userId) => `nv_ach_unlocked_${userId}`

export default function useUnlockedAchievements(userId, stats, achievements = []) {
  const [stored, setStored] = useState(() => new Set())

  // Load the persisted set whenever the user changes.
  useEffect(() => {
    if (!userId) { setStored(new Set()); return }
    let arr = []
    try { arr = JSON.parse(localStorage.getItem(ACH_KEY(userId)) || '[]') } catch { arr = [] }
    setStored(new Set(Array.isArray(arr) ? arr : []))
  }, [userId])

  const currentIds = stats ? achievements.filter((a) => a.check(stats)).map((a) => a.id) : []
  const currentKey = currentIds.slice().sort().join(',')

  const merged = new Set(stored)
  for (const id of currentIds) merged.add(id)

  // Persist (and adopt) any newly-unlocked achievements — never shrink.
  useEffect(() => {
    if (!userId) return
    if (merged.size > stored.size) {
      try { localStorage.setItem(ACH_KEY(userId), JSON.stringify([...merged])) } catch { /* ignore */ }
      setStored(merged)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, currentKey, stored])

  return merged
}
