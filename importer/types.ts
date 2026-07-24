// Shared types for the NORDVIK trading-card import framework.
//
// The framework is game-agnostic: a per-game MAPPER turns raw API cards into the
// neutral `NordvikCard` shape below, and the shared VALIDATOR + SYNC service take
// it from there. To add Pokémon / Lorcana / Magic, implement a new `TcgMapper`
// (and API client) — everything downstream is reused.

// ── Raw OPTCG API shapes ────────────────────────────────────────────────────
export interface OptcgSet {
  set_name: string
  set_id: string
}

export interface OptcgCard {
  card_name: string
  set_name: string
  card_text: string | null
  set_id: string
  rarity: string | null
  card_set_id: string
  card_color: string | null
  card_type: string | null
  life: number | string | null
  card_cost: number | string | null
  card_power: number | string | null
  sub_types: string | null
  counter_amount: number | string | null
  attribute: string | null
  card_image_id: string
  card_image: string | null
  // Ignored by mapping (present in the API): inventory_price, market_price, date_scraped.
  [key: string]: unknown
}

// ── Neutral, DB-agnostic mapped card ────────────────────────────────────────
// Taxonomy is described by NAME; the sync service resolves names → ids/rows.
export interface NordvikCard {
  /** Unique per PRINTING (card_image_id, e.g. "OP01-077_p1"). The sync key. */
  sourceId: string
  /** Groups variants (card_set_id, e.g. "OP01-077"). Every printing stays its own item. */
  variantGroup: string
  /** Standard / Parallel / Alternate Art … derived from the image suffix. */
  variantType: string

  category: string       // "Trading Cards"
  subcategory: string    // "One Piece"
  franchise: string      // "One Piece"
  subfranchise: string   // "The One Piece Card Game"
  property: string       // set_name (e.g. "Romance Dawn")
  itemType: string       // card_type (Character / Leader / Event / Stage)
  subjectName: string    // card_name
  cardNumber: string     // card_set_id (== variantGroup)
  description: string     // card_text
  rarity: string         // rarity code (UC / R / SR …)
  imageUrl: string       // card_image

  /** Per-game attributes stored in items.dynamic_fields. */
  dynamicFields: Record<string, string | number | null>
}

export interface ValidationIssue {
  sourceId: string
  cardNumber: string
  field: string
  severity: 'error' | 'warning'
  message: string
}

/** A per-game mapper. Implement this to plug a new TCG into the framework. */
export interface TcgMapper<ApiCard, ApiSet> {
  /** Human label, used in logs. */
  readonly game: string
  /** Fixed NORDVIK taxonomy for this game. */
  readonly taxonomy: {
    category: string
    subcategory: string
    franchise: string
    subfranchise: string
  }
  /** Map one raw API card (within a set) to the neutral NordvikCard. */
  mapCard(apiCard: ApiCard, set: ApiSet): NordvikCard
}

export interface SyncReport {
  importedSets: number
  failedSets: string[]
  cardsSeen: number
  cardsImported: number
  cardsUpdated: number
  cardsSkipped: number
  validationIssues: ValidationIssue[]
  durationMs: number
}
