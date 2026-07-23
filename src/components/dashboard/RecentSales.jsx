import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'

// Recent Sales — the signed-in user's own most recently sold copies.
// owned_copies is RLS-scoped to the owner, so this is inherently the
// user's data (a cross-market feed would need a dedicated RPC). Shows a
// real empty state when there are no sales; never fabricated rows.
function timeAgo(iso) {
  if (!iso) return ''
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000))
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.round(hrs / 24)
  return `${days}d ago`
}

function resolveImage(path) {
  if (!path) return ''
  if (path.startsWith('http')) return path
  return supabase.storage.from('item-images').getPublicUrl(path).data?.publicUrl || ''
}

export default function RecentSales({ userId, onOpenItem }) {
  const [rows, setRows] = useState([])
  const [status, setStatus] = useState('loading') // loading | ready | empty

  useEffect(() => {
    if (!userId) { setRows([]); setStatus('empty'); return }
    let cancelled = false
    ;(async () => {
      setStatus('loading')
      const { data: sold, error } = await supabase
        .from('owned_copies')
        .select('catalog_item_id, sale_price, updated_at')
        .eq('user_id', userId)
        .eq('sale_status', 'sold')
        .order('updated_at', { ascending: false })
        .limit(4)
      if (cancelled) return
      if (error || !sold?.length) { setRows([]); setStatus('empty'); return }

      const ids = [...new Set(sold.map((r) => r.catalog_item_id))]
      const { data: details } = await supabase
        .from('item_details')
        .select('item_id, subject, description, front_image_path, collectible_set')
        .in('item_id', ids)
      if (cancelled) return
      const byId = Object.fromEntries((details || []).map((d) => [d.item_id, d]))

      setRows(sold.map((r) => {
        const d = byId[r.catalog_item_id] || {}
        return {
          id: r.catalog_item_id,
          name: d.subject || d.description || 'Item',
          set: d.collectible_set || '',
          price: Number(r.sale_price) || 0,
          when: timeAgo(r.updated_at),
          image: resolveImage(d.front_image_path),
        }
      }))
      setStatus('ready')
    })()
    return () => { cancelled = true }
  }, [userId])

  return (
    <article className="nv-panel">
      <div className="nv-panel-head">
        <span className="nv-panel-title">Recent Sales</span>
      </div>
      {status === 'ready' ? (
        <ul className="nv-panel-list">
          {rows.map((row, i) => (
            <li key={`${row.id}-${i}`}>
              <button type="button" className="nv-panel-row" onClick={() => onOpenItem?.(row.id)}>
                <span className="nv-panel-thumb">
                  {row.image ? <img src={row.image} alt="" loading="lazy" /> : <span aria-hidden="true">◇</span>}
                </span>
                <span className="nv-panel-row-meta">
                  <span className="nv-panel-row-name">{row.name}</span>
                  {row.set && <span className="nv-panel-row-sub">{row.set}</span>}
                </span>
                <span className="nv-panel-row-right">
                  <span className="nv-panel-price">${row.price.toLocaleString()}</span>
                  {row.when && <span className="nv-panel-row-sub">{row.when}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="nv-panel-empty">
          {status === 'loading' ? 'Loading…' : 'No sales yet — items you sell will appear here.'}
        </p>
      )}
    </article>
  )
}
