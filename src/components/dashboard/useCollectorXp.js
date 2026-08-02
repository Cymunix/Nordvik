import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { computeCollectorXp, setCompletionMilestoneXp, XP_RULES } from './levels'

// Aggregates the user's real XP from the canonical earning rules.
// Synchronous part (unique items + duplicates) comes from already-loaded
// owned-copies counts; the async part (completed sales + set-completion
// milestones) is queried once per user. Earners with no data source yet
// (photos, complete details, event check-ins) contribute 0 until wired.
export default function useCollectorXp(userId, ownedCatalogItemCounts = {}) {
  const [asyncXp, setAsyncXp] = useState(0)

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

      // Wishlist items (50 XP each).
      const { count: wishlistCount } = await supabase
        .from('wishlist_items')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)

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

      setAsyncXp((salesCount || 0) * 250 + (wishlistCount || 0) * XP_RULES.wishlistItem + milestoneXp)
    })()
    return () => { cancelled = true }
  }, [userId])

  const baseXp = computeCollectorXp({ uniqueItems, duplicates })
  return baseXp + asyncXp
}
