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
      const rows = (data || []).filter((r) => r.item_id !== itemId)
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
