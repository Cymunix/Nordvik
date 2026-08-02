import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { computeCollectorXp, setCompletionMilestoneXp, XP_RULES } from './levels'

// Aggregates the user's real XP from the canonical earning rules.
// Synchronous part (unique items + duplicates) comes from already-loaded
// owned-copies counts; the async part (completed sales + set-completion
// milestones) is queried once per user. Earners with no data source yet
// (photos, complete details, event check-ins) contribute 0 until wired.
const XP_HW_KEY = (userId) => `nv_xp_hw_${userId}`

export default function useCollectorXp(userId, ownedCatalogItemCounts = {}, achievementsUnlocked = 0, wishlistCount = 0) {
  const [asyncXp, setAsyncXp] = useState(0)
  // XP high-water mark: XP is derived from live state, so removing an item
  // would otherwise make it drop. We ratchet it so it can only ever rise —
  // persisted per user so the mark survives reloads.
  const [xpHighWater, setXpHighWater] = useState(0)

  const uniqueItems = Object.keys(ownedCatalogItemCounts).length
  let totalCopies = 0
  for (const n of Object.values(ownedCatalogItemCounts)) totalCopies += Number(n) || 0
  const duplicates = Math.max(0, totalCopies - uniqueItems)

  useEffect(() => {
    if (!userId) { setAsyncXp(0); return }
    let cancelled = false
    ;(async () => {
      // Completed sales.
      const { count: salesCount } = await supabase
        .from('owned_copies')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('sale_status', 'sold')

      // Set-completion milestones across the user's owned sets.
      const { data: owned } = await supabase
        .from('owned_copies')
        .select('catalog_item_id')
        .eq('user_id', userId)
      if (cancelled) return
      const ids = [...new Set((owned || []).map((r) => r.catalog_item_id).filter(Boolean))]

      const ownedBySet = {}
      for (let i = 0; i < ids.length; i += 500) {
        const { data } = await supabase
          .from('item_details')
          .select('item_id, collectible_set_id')
          .in('item_id', ids.slice(i, i + 500))
        if (cancelled) return
        for (const row of data || []) {
          if (row.collectible_set_id) {
            ownedBySet[row.collectible_set_id] = (ownedBySet[row.collectible_set_id] || 0) + 1
          }
        }
      }

      const setIds = Object.keys(ownedBySet).slice(0, 80)
      let milestoneXp = 0
      await Promise.all(setIds.map(async (setId) => {
        const { count } = await supabase
          .from('item_details')
          .select('item_id', { count: 'exact', head: true })
          .eq('collectible_set_id', setId)
        if (count) milestoneXp += setCompletionMilestoneXp(Math.min(1, ownedBySet[setId] / count))
      }))
      if (cancelled) return

      setAsyncXp((salesCount || 0) * 250 + milestoneXp)
    })()
    return () => { cancelled = true }
  }, [userId])

  const baseXp = computeCollectorXp({ uniqueItems, duplicates })
  const achievementXp = Math.max(0, achievementsUnlocked) * XP_RULES.achievement
  // Wishlist XP is derived from the app's live wishlist count so it updates the
  // instant an item is wishlisted (the async block only refreshes per user).
  const wishlistXp = Math.max(0, wishlistCount) * XP_RULES.wishlistItem
  const liveXp = baseXp + asyncXp + achievementXp + wishlistXp

  // Load the stored high-water mark whenever the user changes.
  useEffect(() => {
    if (!userId) { setXpHighWater(0); return }
    let stored = 0
    try { stored = Number(localStorage.getItem(XP_HW_KEY(userId))) || 0 } catch { stored = 0 }
    setXpHighWater(stored)
  }, [userId])

  // Raise (never lower) the mark as live XP grows, and persist it.
  useEffect(() => {
    if (!userId) return
    if (liveXp > xpHighWater) {
      setXpHighWater(liveXp)
      try { localStorage.setItem(XP_HW_KEY(userId), String(liveXp)) } catch { /* ignore */ }
    }
  }, [userId, liveXp, xpHighWater])

  return Math.max(liveXp, xpHighWater)
}
