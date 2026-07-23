import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'

// Completion Analytics (Collector+): "collections closest to completion" and
// "estimated cost to complete", computed from the user's real owned copies vs
// the catalogue. Cost uses items.retail_price (MSRP) of the items still missing
// — real data, never fabricated. Self-contained so it works on the Analytics
// tab without loading the whole Completion pipeline.
export default function CompletionAnalyticsPanel({ userId, formatUsd }) {
  const [status, setStatus] = useState('loading') // loading | ready | empty | error
  const [sets, setSets] = useState([])
  const [totalCost, setTotalCost] = useState(0)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!userId) { setStatus('empty'); return }
      setStatus('loading')
      try {
        // 1. Owned catalog items.
        const { data: owned } = await supabase.from('owned_copies').select('catalog_item_id').eq('user_id', userId)
        if (cancelled) return
        const ownedIds = new Set((owned || []).map((r) => r.catalog_item_id).filter(Boolean))
        if (ownedIds.size === 0) { setStatus('empty'); return }

        // 2. Which set each owned item belongs to (+ set name).
        const ownedBySet = {}
        const setName = {}
        const ids = [...ownedIds]
        for (let i = 0; i < ids.length; i += 500) {
          const { data } = await supabase.from('item_details')
            .select('item_id, collectible_set_id, collectible_set')
            .in('item_id', ids.slice(i, i + 500))
          if (cancelled) return
          for (const row of data || []) {
            if (!row.collectible_set_id) continue
            ownedBySet[row.collectible_set_id] = (ownedBySet[row.collectible_set_id] || 0) + 1
            if (row.collectible_set) setName[row.collectible_set_id] = row.collectible_set
          }
        }
        const topSetIds = Object.entries(ownedBySet).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([id]) => id)
        if (topSetIds.length === 0) { setStatus('empty'); return }

        // 3. All items in each set → missing = not owned.
        const perSet = []
        const allMissing = new Set()
        for (const setId of topSetIds) {
          const { data: setItems } = await supabase.from('item_details')
            .select('item_id').eq('collectible_set_id', setId).range(0, 999)
          if (cancelled) return
          const total = (setItems || []).length
          if (!total) continue
          const missing = (setItems || []).map((r) => r.item_id).filter((id) => !ownedIds.has(id))
          missing.forEach((id) => allMissing.add(id))
          perSet.push({
            id: setId, name: setName[setId] || 'Set',
            owned: ownedBySet[setId], total, missingIds: missing,
            pct: Math.round((ownedBySet[setId] / total) * 100),
          })
        }

        // 4. Retail price (MSRP) of missing items, batched.
        const priceById = {}
        const missingArr = [...allMissing]
        for (let i = 0; i < missingArr.length; i += 500) {
          const { data: priced } = await supabase.from('items')
            .select('item_id, retail_price').in('item_id', missingArr.slice(i, i + 500))
          if (cancelled) return
          for (const row of priced || []) priceById[row.item_id] = Number(row.retail_price) || 0
        }

        const withCost = perSet.map((s) => ({
          ...s,
          missing: s.missingIds.length,
          cost: s.missingIds.reduce((sum, id) => sum + (priceById[id] || 0), 0),
        }))
        // Closest to completion: not yet complete, ranked by % then fewest missing.
        const closest = withCost.filter((s) => s.missing > 0).sort((a, b) => b.pct - a.pct || a.missing - b.missing).slice(0, 6)
        const cost = closest.reduce((sum, s) => sum + s.cost, 0)

        if (cancelled) return
        setSets(closest)
        setTotalCost(cost)
        setStatus(closest.length ? 'ready' : 'empty')
      } catch {
        if (!cancelled) setStatus('error')
      }
    })()
    return () => { cancelled = true }
  }, [userId])

  return (
    <section className="nv-panel nv-col-block">
      <div className="nv-section-head">
        <span className="nv-section-title">Completion Analytics<span className="nv-plus-tag">Collector+</span></span>
        {status === 'ready' && <span className="nv-col-muted">Est. to complete these: <strong style={{ color: 'var(--nv-cyan)' }}>{formatUsd(totalCost)}</strong></span>}
      </div>
      {status === 'loading' ? (
        <p className="nv-col-muted">Calculating completion…</p>
      ) : status === 'error' ? (
        <p className="nv-col-muted">Couldn’t load completion analytics right now.</p>
      ) : status === 'empty' ? (
        <p className="nv-col-muted">Not enough set data yet — add items from sets to track completion cost.</p>
      ) : (
        <div className="nv-col-alloc">
          {sets.map((s) => (
            <div key={`ca-${s.id}`} className="nv-col-alloc-row">
              <div className="nv-col-alloc-head">
                <strong>{s.name}</strong>
                <span>{s.owned} / {s.total} · {s.pct}%</span>
              </div>
              <div className="nv-col-bar"><span style={{ width: `${Math.min(s.pct, 100)}%` }} /></div>
              <p className="nv-col-row-meta">
                You’re {s.missing} {s.missing === 1 ? 'item' : 'items'} away
                {s.cost > 0 ? ` · est. cost ${formatUsd(s.cost)}` : ' · no MSRP data for the missing items'}
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
