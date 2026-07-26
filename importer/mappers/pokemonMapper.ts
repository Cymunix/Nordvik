// Pokémon TCG mapper: TCGdex card → neutral NordvikCard.
//
// Model notes:
//   - card.id  ("swsh3-136")  → globally unique → the sync key (source_id).
//   - card.localId ("136")    → the card number. NOTE: localId restarts per set,
//     so "136" recurs across sets — variant grouping in the app is scoped by
//     card_number + Property(set), which keeps different sets' #136 apart.
//   - TCGdex exposes variants as booleans (normal/reverse/holo/firstEdition/
//     wPromo) on ONE card. We keep ONE catalogue item per card and store the
//     variants object in dynamic_fields (lossless). If per-finish items are ever
//     wanted, expand here into multiple NordvikCards sharing variantGroup.
//   - Nested gameplay (types[], attacks[], weaknesses[], legal{}, set counts)
//     goes into dynamic_fields as JSON — the items.dynamic_fields jsonb column
//     stores it as-is, no schema change.
import type { NordvikCard, TcgdexCard, TcgdexSetResume, TcgMapper } from '../types.ts'

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s === '' ? null : s
}

// TCGdex `image` is a base URL with no quality/extension (e.g.
// ".../swsh3/136"). The CDN serves "{base}/{quality}.{ext}". "high.webp" is the
// standard high-res render.
function fullImageUrl(base: string | undefined): string {
  const b = (base || '').trim().replace(/\/+$/, '')
  return b ? `${b}/high.webp` : ''
}

export const pokemonMapper: TcgMapper<TcgdexCard, TcgdexSetResume> = {
  game: 'Pokémon Trading Card Game',
  taxonomy: {
    category: 'Trading Cards',
    subcategory: 'Pokemon',
    franchise: 'Pokemon',
    subfranchise: 'Pokémon Trading Card Game',
  },
  validItemTypes: ['Pokemon', 'Trainer', 'Energy'],

  mapCard(apiCard: TcgdexCard, set: TcgdexSetResume): NordvikCard {
    const cardNumber = str(apiCard.localId) || ''
    const sourceId = str(apiCard.id) || cardNumber
    const supertype = str(apiCard.category) || '' // Pokemon / Trainer / Energy

    // Only include nested structures when the API actually provided them, so a
    // card without attacks/weaknesses doesn't store empty noise.
    const dynamicFields: NordvikCard['dynamicFields'] = {
      source_id: sourceId,
      supertype: supertype || null,
      illustrator: str(apiCard.illustrator),
      hp: typeof apiCard.hp === 'number' ? apiCard.hp : (str(apiCard.hp) ? Number(str(apiCard.hp)) : null),
      evolve_from: str(apiCard.evolveFrom),
      stage: str(apiCard.stage),
      retreat: typeof apiCard.retreat === 'number' ? apiCard.retreat : null,
      regulation_mark: str(apiCard.regulationMark),
      set_id: str(set?.id) || str(apiCard.set?.id),
      set_logo: str(set?.logo) || str(apiCard.set?.logo),
      set_symbol: str(set?.symbol) || str(apiCard.set?.symbol),
    }
    if (Array.isArray(apiCard.types) && apiCard.types.length) dynamicFields.types = apiCard.types
    if (Array.isArray(apiCard.attacks) && apiCard.attacks.length) {
      // Preserve multiple costs, and optional effect/damage exactly as given.
      dynamicFields.attacks = apiCard.attacks.map((a) => ({
        name: str(a?.name),
        cost: Array.isArray(a?.cost) ? a!.cost : [],
        effect: a?.effect != null ? String(a.effect) : null,
        damage: a?.damage != null ? a.damage : null,
      }))
    }
    if (Array.isArray(apiCard.weaknesses) && apiCard.weaknesses.length) dynamicFields.weaknesses = apiCard.weaknesses.map((w) => ({ type: str(w?.type), value: str(w?.value) }))
    if (Array.isArray(apiCard.resistances) && apiCard.resistances.length) dynamicFields.resistances = apiCard.resistances.map((r) => ({ type: str(r?.type), value: str(r?.value) }))
    if (apiCard.legal && typeof apiCard.legal === 'object') dynamicFields.legalities = apiCard.legal
    if (apiCard.variants && typeof apiCard.variants === 'object') dynamicFields.variants = apiCard.variants
    const cc = set?.cardCount || apiCard.set?.cardCount
    if (cc && typeof cc === 'object') dynamicFields.set_card_count = cc

    return {
      sourceId,
      variantGroup: cardNumber,
      variantType: 'Standard',

      category: 'Trading Cards',
      subcategory: 'Pokemon',
      franchise: 'Pokemon',
      subfranchise: 'Pokémon Trading Card Game',
      property: str(set?.name) || str(apiCard.set?.name) || '',
      itemType: supertype,
      subjectName: str(apiCard.name) || '',
      cardNumber,
      description: str(apiCard.description) || '',
      rarity: str(apiCard.rarity) || '',
      imageUrl: fullImageUrl(apiCard.image),

      dynamicFields,
    }
  },
}
