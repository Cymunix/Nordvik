import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'

// Card variant group: other catalogue items that are genuinely the SAME card in
// a different finish/printing. The signal is strict — same item number AND same
// name, scoped to the same Subfranchise (subset). Number alone links unrelated
// cards (every set restarts numbering; #1 exists everywhere), and number+set
// without the name links different cards that share a number, so both are wrong.
// Never merges records — each variant stays its own item; this just surfaces the
// siblings.
function resolveImage(path) {
  if (!path) return ''
  return path.startsWith('http') ? path : (supabase.storage.from('item-images').getPublicUrl(path).data?.publicUrl || '')
}

export default function CardVariants({ itemId, onOpenItem }) {
  const [variants, setVariants] = useState([])
  const [status, setStatus] = useState('loading')
  const [cardNumber, setCardNumber] = useState('')

  useEffect(() => {
    if (!itemId) { setStatus('empty'); return }
    let cancelled = false
    ;(async () => {
      setStatus('loading')
      // This card's identity: number, name, and taxonomy scope.
      const { data: self, error: selfErr } = await supabase
        .from('items')
        .select('item_id, name, card_number, subset_id, franchise_id')
        .eq('item_id', itemId)
        .single()
      if (cancelled) return
      if (selfErr || !self || !self.card_number || !self.name) { setStatus('empty'); return }
      setCardNumber(self.card_number)

      // Variants must share the item number AND the name. Scope to the same
      // Subfranchise (subset) — anything lower in the taxonomy is already inside
      // it. When the card has no Subfranchise, fall back to the Franchise as the
      // outer bound so we still don't reach across unrelated games.
      let query = supabase
        .from('items')
        .select('item_id')
        .eq('card_number', self.card_number)
        .eq('name', self.name)
        .neq('item_id', itemId)
      if (self.subset_id) query = query.eq('subset_id', self.subset_id)
      else if (self.franchise_id) query = query.is('subset_id', null).eq('franchise_id', self.franchise_id)
      else { setStatus('empty'); return }

      const { data: matches, error } = await query
      if (cancelled) return
      if (error || !matches || !matches.length) { setStatus('empty'); return }

      // Pull display fields (image / printing / subject) from the view, plus the
      // finish from the raw item so foil vs nonfoil variants are distinguishable.
      const ids = matches.map((m) => m.item_id)
      const [{ data: details }, { data: finishRows }] = await Promise.all([
        supabase.from('item_details')
          .select('item_id, subject, description, front_image_path, print_type').in('item_id', ids),
        supabase.from('items').select('item_id, finish:dynamic_fields->>finish').in('item_id', ids),
      ])
      if (cancelled) return
      const byId = new Map((details || []).map((d) => [d.item_id, d]))
      const finishById = new Map((finishRows || []).map((r) => [r.item_id, r.finish]))
      setVariants(ids.map((id) => {
        const d = byId.get(id) || {}
        return {
          id,
          name: d.subject || d.description || self.name || 'Variant',
          variant: finishById.get(id) || d.print_type || '',
          image: resolveImage(d.front_image_path),
        }
      }))
      setStatus('ready')
    })()
    return () => { cancelled = true }
  }, [itemId])

  if (status !== 'ready') return null

  return (
    <section className="catalog-variants" aria-label="Card variants">
      <h3 className="catalog-variants-title">Variants{cardNumber ? ` · ${cardNumber}` : ''}</h3>
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
