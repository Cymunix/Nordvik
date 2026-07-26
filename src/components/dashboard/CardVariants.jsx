import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'

// Card variant group: other catalogue items that share this card's base
// Card Number within the SAME game (franchise). Never merges records — each
// variant stays its own item; this just surfaces the sibling variants.
function resolveImage(path) {
  if (!path) return ''
  return path.startsWith('http') ? path : (supabase.storage.from('item-images').getPublicUrl(path).data?.publicUrl || '')
}

export default function CardVariants({ itemId, cardNumber, franchiseId, onOpenItem }) {
  const [variants, setVariants] = useState([])
  const [status, setStatus] = useState('loading')

  useEffect(() => {
    if (!cardNumber || !franchiseId) { setStatus('empty'); return }
    let cancelled = false
    ;(async () => {
      setStatus('loading')
      const { data, error } = await supabase
        .from('item_details')
        .select('item_id, subject, description, front_image_path, print_type, card_number')
        .eq('card_number', cardNumber)
        .eq('franchise_id', franchiseId)
      if (cancelled) return
      if (error) { setStatus('empty'); return }
      let candidates = data || []
      // A shared card number within a game is NOT enough: many games (e.g. Star
      // Wars Pocketmodel) restart numbering in each set, so card "1" exists in
      // every set. Real variants must ALSO belong to the same Property (the set).
      // Two items are variants only if their Property sets match — share at least
      // one Property, or both have none (the One Piece case, where the number is
      // globally unique and variants carry no Property).
      const ids = candidates.map((r) => r.item_id)
      const propsByItem = new Map(ids.map((id) => [id, new Set()]))
      if (ids.length > 1) {
        const { data: links } = await supabase
          .from('item_properties').select('item_id, property_id').in('item_id', ids)
        for (const l of (links || [])) propsByItem.get(l.item_id)?.add(l.property_id)
      }
      const selfProps = propsByItem.get(itemId) || new Set()
      const rows = candidates.filter((r) => {
        if (r.item_id === itemId) return false
        const p = propsByItem.get(r.item_id) || new Set()
        if (selfProps.size === 0 && p.size === 0) return true
        for (const x of selfProps) if (p.has(x)) return true
        return false
      })
      setVariants(rows.map((r) => ({
        id: r.item_id,
        name: r.subject || r.description || 'Variant',
        variant: r.print_type || '',
        image: resolveImage(r.front_image_path),
      })))
      setStatus(rows.length ? 'ready' : 'empty')
    })()
    return () => { cancelled = true }
  }, [itemId, cardNumber, franchiseId])

  if (status !== 'ready') return null

  return (
    <section className="catalog-variants" aria-label="Card variants">
      <h3 className="catalog-variants-title">Variants · {cardNumber}</h3>
      <div className="catalog-variants-grid">
        {variants.map((v) => (
          <button key={v.id} type="button" className="catalog-variant-card" onClick={() => onOpenItem?.(v.id)}>
            <span className="catalog-variant-thumb">
              {v.image ? <img src={v.image} alt="" loading="lazy" /> : <span aria-hidden="true">◇</span>}
            </span>
            <span className="catalog-variant-name">{v.name}</span>
            {v.variant ? <span className="catalog-variant-type">{v.variant}</span> : null}
          </button>
        ))}
      </div>
    </section>
  )
}
