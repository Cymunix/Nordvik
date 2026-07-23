import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import StatCard from './StatCard'
import { IconGraded } from './icons'

// Real "Completion" stat: the user's average completion across the
// collectible sets they own at least one item from. Uses real catalog
// totals per set (item_details), never a fabricated percentage.
export default function CompletionStat({ userId }) {
  const [pct, setPct] = useState(null)
  const [setsTracked, setSetsTracked] = useState(0)
  const [status, setStatus] = useState('loading') // loading | ready | empty

  useEffect(() => {
    if (!userId) { setStatus('empty'); return }
    let cancelled = false
    ;(async () => {
      setStatus('loading')
      // 1. Owned catalog item ids for this user.
      const { data: owned } = await supabase
        .from('owned_copies')
        .select('catalog_item_id')
        .eq('user_id', userId)
      if (cancelled) return
      const ids = [...new Set((owned || []).map((r) => r.catalog_item_id).filter(Boolean))]
      if (!ids.length) { setStatus('empty'); return }

      // 2. Which set each owned item belongs to (batched).
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
      // Bound the work: the user's 30 largest sets.
      const setIds = Object.entries(ownedBySet)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 30)
        .map(([id]) => id)
      if (!setIds.length) { setStatus('empty'); return }

      // 3. Catalog total per set → per-set completion → average.
      const perSet = await Promise.all(setIds.map(async (setId) => {
        const { count } = await supabase
          .from('item_details')
          .select('item_id', { count: 'exact', head: true })
          .eq('collectible_set_id', setId)
        if (!count) return null
        return Math.min(1, ownedBySet[setId] / count)
      }))
      if (cancelled) return
      const valid = perSet.filter((v) => v != null)
      if (!valid.length) { setStatus('empty'); return }
      const avg = valid.reduce((s, v) => s + v, 0) / valid.length
      setPct(Math.round(avg * 100))
      setSetsTracked(valid.length)
      setStatus('ready')
    })()
    return () => { cancelled = true }
  }, [userId])

  return (
    <StatCard
      icon={<IconGraded />}
      label="Completion"
      value={status === 'ready' ? `${pct}%` : status === 'loading' ? '…' : '—'}
      sub={
        status === 'ready'
          ? `Across ${setsTracked} ${setsTracked === 1 ? 'set' : 'sets'} you collect`
          : status === 'loading' ? 'Calculating…' : 'Add set items to track completion'
      }
    />
  )
}
