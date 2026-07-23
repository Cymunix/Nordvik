import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'

// "Hot Items" — catalog items added to collections most in the last 7 days,
// aggregated across all users via the hot_items_this_week RPC (aggregate
// counts only, no private data). Catalog details come from item_details.
// Renders nothing until the RPC exists / returns rows — never mock data.
function resolveImage(path) {
  if (!path) return ''
  if (path.startsWith('http')) return path
  return supabase.storage.from('item-images').getPublicUrl(path).data?.publicUrl || ''
}

export default function HotItems({ limit = 6, onOpenItem }) {
  const [items, setItems] = useState([])
  const [status, setStatus] = useState('loading') // loading | ready | empty | error

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setStatus('loading')
      const { data: ranked, error } = await supabase.rpc('hot_items_this_week', { item_limit: limit })
      if (cancelled) return
      if (error) { setStatus('error'); return }
      const rows = ranked || []
      if (!rows.length) { setItems([]); setStatus('empty'); return }

      const ids = rows.map((r) => r.catalog_item_id)
      const { data: details } = await supabase
        .from('item_details')
        .select('item_id, subject, description, front_image_path, collectible_set, release_year')
        .in('item_id', ids)
      if (cancelled) return

      const byId = Object.fromEntries((details || []).map((d) => [d.item_id, d]))
      const merged = rows
        .map((r) => {
          const d = byId[r.catalog_item_id]
          if (!d) return null
          return {
            id: r.catalog_item_id,
            addCount: Number(r.add_count) || 0,
            collectorCount: Number(r.collector_count) || 0,
            name: d.subject || d.description || 'Untitled item',
            set: d.collectible_set || '',
            year: d.release_year || '',
            image: resolveImage(d.front_image_path),
          }
        })
        .filter(Boolean)

      setItems(merged)
      setStatus(merged.length ? 'ready' : 'empty')
    })()
    return () => { cancelled = true }
  }, [limit])

  // Always show the section with `limit` slots: real cards where we have
  // them, empty placeholder blocks for the rest. Never fabricated data.
  const placeholders = Math.max(0, limit - items.length)
  const caption =
    status === 'loading' ? 'Loading…'
      : status === 'error' ? 'Unavailable right now'
      : items.length === 0 ? 'No new additions this week yet'
      : null

  return (
    <section aria-label="Hot items this week">
      <div className="nv-section-head">
        <span className="nv-section-title">Hot Items · This Week</span>
        {caption && <span className="nv-section-note">{caption}</span>}
      </div>
      <div className="nv-hot-grid">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            className="nv-hot-card"
            onClick={() => onOpenItem?.(item.id)}
          >
            <span className="nv-hot-thumb">
              {item.image
                ? <img src={item.image} alt="" loading="lazy" />
                : <span className="nv-hot-thumb-empty" aria-hidden="true">◇</span>}
              <span className="nv-hot-badge">
                {item.collectorCount} {item.collectorCount === 1 ? 'collector' : 'collectors'}
              </span>
            </span>
            <span className="nv-hot-meta">
              <span className="nv-hot-name">{item.name}</span>
              {(item.set || item.year) && (
                <span className="nv-hot-sub">{[item.set, item.year].filter(Boolean).join(' · ')}</span>
              )}
            </span>
          </button>
        ))}
        {Array.from({ length: placeholders }).map((_, index) => (
          <div key={`ph-${index}`} className={`nv-hot-card nv-hot-card-empty${status === 'loading' ? ' is-loading' : ''}`} aria-hidden="true">
            <span className="nv-hot-thumb">
              <span className="nv-hot-thumb-empty">◇</span>
            </span>
            <span className="nv-hot-meta">
              <span className="nv-hot-name nv-hot-name-muted">—</span>
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}
