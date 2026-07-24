// One Piece Card Game mapper: OPTCG API card → neutral NordvikCard.
//
// Variant model (verified against the live API):
//   - card_set_id  (e.g. "OP01-077")     → the VARIANT GROUP (base card number)
//   - card_image_id (e.g. "OP01-077_p1") → UNIQUE per printing → the sync key
// Every printing stays its own catalogue item; items that share a card_set_id are
// linked as variants (the app groups by items.card_number).
import type { NordvikCard, OptcgCard, OptcgSet, TcgMapper } from '../types.ts'

// Turn an image-id suffix into a human variant label. The API only exposes the
// "_pN" suffix, so we name what we can prove and keep the raw suffix for the rest.
function variantTypeFromSuffix(suffix: string): string {
  if (!suffix) return 'Standard'
  const p = suffix.match(/^_p(\d+)$/i)
  if (p) {
    const n = Number(p[1])
    return n <= 1 ? 'Parallel' : `Alternate Art ${n}`
  }
  const r = suffix.match(/^[_-]r(\d+)$/i)
  if (r) return `Reprint ${r[1]}`
  return `Variant (${suffix.replace(/^[_-]/, '')})`
}

// Numbers arrive as strings or nulls; keep them as trimmed strings (or null) so
// blank stats never become 0.
function str(v: unknown): string | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s === '' ? null : s
}

export const onePieceMapper: TcgMapper<OptcgCard, OptcgSet> = {
  game: 'One Piece Card Game',
  taxonomy: {
    category: 'Trading Cards',
    subcategory: 'One Piece',
    franchise: 'One Piece',
    subfranchise: 'The One Piece Card Game',
  },

  mapCard(apiCard: OptcgCard, set: OptcgSet): NordvikCard {
    const cardNumber = String(apiCard.card_set_id || '').trim()
    const setId = str(apiCard.set_id) || String(set.set_id || '').trim()
    // card_image_id identifies a printing but is NOT globally unique — a card
    // reprinted in a later/premium set repeats it. So the stable sync key is
    // image-id + set-id. Strip any stray file extension first.
    const imageId = String(apiCard.card_image_id || '').trim().replace(/\.(jpe?g|png|webp|gif|avif)$/i, '')
    const sourceId = setId ? `${imageId}@${setId}` : imageId
    // The variant suffix is whatever the image id has beyond the base card number.
    const suffix = imageId.startsWith(cardNumber) ? imageId.slice(cardNumber.length) : ''
    const variantType = variantTypeFromSuffix(suffix)
    const cardType = str(apiCard.card_type) || ''

    return {
      sourceId,
      variantGroup: cardNumber,
      variantType,

      category: 'Trading Cards',
      subcategory: 'One Piece',
      franchise: 'One Piece',
      subfranchise: 'The One Piece Card Game',
      property: str(apiCard.set_name) || str(set.set_name) || '',
      itemType: cardType,
      subjectName: str(apiCard.card_name) || '',
      cardNumber,
      description: str(apiCard.card_text) || '',
      rarity: str(apiCard.rarity) || '',
      imageUrl: str(apiCard.card_image) || '',

      // Per-game attributes → items.dynamic_fields. source_id is stored here too
      // so the sync service can match a printing on re-run without a schema change.
      dynamicFields: {
        source_id: sourceId,
        image_id: imageId,
        variant_type: variantType,
        set_id: str(apiCard.set_id),
        card_color: str(apiCard.card_color),
        card_type: cardType || null,
        attribute: str(apiCard.attribute),
        card_cost: str(apiCard.card_cost),
        card_power: str(apiCard.card_power),
        counter_amount: str(apiCard.counter_amount),
        life: str(apiCard.life),
        sub_types: str(apiCard.sub_types), // "Collection"
      },
    }
  },
}
