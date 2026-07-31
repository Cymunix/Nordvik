// Database sync for the NORDVIK import framework. Game-agnostic: it consumes
// neutral NordvikCards, resolves their taxonomy (idempotently), and creates or
// updates catalogue items. Writes require a Supabase key that can bypass RLS
// (service_role); reads/dry-runs work with the anon key.
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { NordvikCard } from '../types.ts'
import type { Logger } from './logger.ts'

interface TaxonomyContext {
  categoryId: string
  subcategoryId: string
  franchiseId: string
  subsetId: string
}

interface ExistingItem {
  item_id: string
  name: string | null
  description: string | null
  card_number: string | null
  brand_id: string | null
  item_type_id: string | null
  subset_id: string | null
  subject_id: string | null
  subject: string | null
  availability: string | null
  rarity_id: string | null
  franchise_id: string | null
  dynamic_fields: Record<string, unknown> | null
}

const RARITY_SORT_BASE = 100

function newId(): string {
  return crypto.randomUUID()
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

export class SupabaseSync {
  private readonly db: SupabaseClient
  private readonly log: Logger
  private readonly canWrite: boolean
  private tax: TaxonomyContext | null = null

  private readonly brandCache = new Map<string, string>()
  private readonly subjectCache = new Map<string, string>()
  private readonly propertyCache = new Map<string, string>()
  private readonly rarityCache = new Map<string, string>()

  constructor(url: string, key: string, canWrite: boolean, log: Logger) {
    this.db = createClient(url, key, { auth: { persistSession: false } })
    this.canWrite = canWrite
    this.log = log
  }

  // ── Idempotent get-or-create helper ────────────────────────────────────────
  private async getOrCreate(
    table: string,
    idCol: string,
    matchFilters: Record<string, string>,
    insertRow: Record<string, unknown>,
  ): Promise<string> {
    let q = this.db.from(table).select(idCol)
    for (const [col, val] of Object.entries(matchFilters)) q = q.eq(col, val)
    const { data: found, error: findErr } = await q.limit(1).maybeSingle()
    if (findErr) throw new Error(`${table} lookup failed: ${findErr.message}`)
    if (found) return (found as Record<string, string>)[idCol]
    if (!this.canWrite) throw new Error(`Missing ${table} ${JSON.stringify(matchFilters)} and no write access to create it`)
    const { data: created, error: insErr } = await this.db.from(table).insert(insertRow).select(idCol).single()
    if (insErr) throw new Error(`${table} insert failed: ${insErr.message}`)
    return (created as Record<string, string>)[idCol]
  }

  /** Resolve the fixed taxonomy for a game (category → subcategory → franchise → subfranchise). */
  async prepareTaxonomy(
    t: { category: string; subcategory: string; franchise: string; subfranchise: string },
  ): Promise<TaxonomyContext> {
    const categoryId = await this.getOrCreate('categories', 'category_id', { name: t.category }, { name: t.category })
    const subcategoryId = await this.getOrCreate(
      'subcategories', 'subcategory_id',
      { name: t.subcategory, category_id: categoryId },
      { name: t.subcategory, category_id: categoryId },
    )
    const franchiseId = await this.getOrCreate('franchises', 'franchise_id', { name: t.franchise }, { name: t.franchise })
    // Ensure the franchise↔subcategory link the app's cascade relies on.
    await this.ensureLink('franchise_subcategory', { franchise_id: franchiseId, subcategory_id: subcategoryId })
    const subsetId = await this.getOrCreate(
      'subsets', 'subset_id',
      { name: t.subfranchise, franchise_id: franchiseId },
      { name: t.subfranchise, franchise_id: franchiseId },
    )
    this.tax = { categoryId, subcategoryId, franchiseId, subsetId }
    return this.tax
  }

  /** Insert a link row if it doesn't already exist (no reliance on a unique constraint). */
  private async ensureLink(table: string, row: Record<string, string>): Promise<void> {
    let q = this.db.from(table).select('*', { head: true, count: 'exact' })
    for (const [col, val] of Object.entries(row)) q = q.eq(col, val)
    const { count } = await q
    if (!count && this.canWrite) {
      const { error } = await this.db.from(table).insert(row)
      if (error && !/duplicate key/i.test(error.message)) throw new Error(`${table} link failed: ${error.message}`)
    }
  }

  // ── Bulk cache preload: resolve every distinct name once, up front ─────────
  async preloadCaches(cards: NordvikCard[]): Promise<void> {
    const tax = this.requireTax()
    await this.preloadByName('rarities', 'rarity_id', 'name', distinct(cards.map((c) => c.rarity)), this.rarityCache)
    await this.preloadByName('brands', 'brand_id', 'name', distinct(cards.map((c) => c.itemType)), this.brandCache)
    await this.preloadByName(
      'properties', 'property_id', 'name', distinct(cards.map((c) => c.property)), this.propertyCache,
      { franchise_id: tax.franchiseId },
    )
    await this.preloadByName('subjects', 'subject_id', 'subject_name', distinct(cards.map((c) => c.subjectName)), this.subjectCache)
  }

  private async preloadByName(
    table: string, idCol: string, nameCol: string, names: string[],
    cache: Map<string, string>, extraFilter: Record<string, string> = {},
  ): Promise<void> {
    for (const names200 of chunk(names, 200)) {
      let q = this.db.from(table).select(`${idCol}, ${nameCol}`).in(nameCol, names200)
      for (const [col, val] of Object.entries(extraFilter)) q = q.eq(col, val)
      const { data, error } = await q
      if (error) throw new Error(`${table} preload failed: ${error.message}`)
      for (const row of data || []) {
        const r = row as Record<string, string>
        cache.set(r[nameCol].toLowerCase(), r[idCol])
      }
    }
  }

  private async resolveRarity(code: string): Promise<string | null> {
    if (!code) return null
    const key = code.toLowerCase()
    const hit = this.rarityCache.get(key)
    if (hit) return hit
    const id = await this.getOrCreate('rarities', 'rarity_id', { name: code }, { name: code, sort_order: RARITY_SORT_BASE + this.rarityCache.size })
    this.rarityCache.set(key, id)
    return id
  }

  private async resolveBrand(name: string): Promise<string | null> {
    if (!name) return null
    const key = name.toLowerCase()
    const hit = this.brandCache.get(key)
    if (hit) return hit
    const id = await this.getOrCreate('brands', 'brand_id', { name }, { name })
    await this.ensureLink('brand_franchise', { brand_id: id, franchise_id: this.requireTax().franchiseId })
    this.brandCache.set(key, id)
    return id
  }

  /** Item Type is a cascade level scoped to the Subcategory (items.item_type_id). */
  private readonly itemTypeCache = new Map<string, string>()
  private async resolveItemType(name: string): Promise<string | null> {
    if (!name) return null
    const tax = this.requireTax()
    const key = name.toLowerCase()
    const hit = this.itemTypeCache.get(key)
    if (hit) return hit
    const id = await this.getOrCreate(
      'item_types', 'item_type_id',
      { name, subcategory_id: tax.subcategoryId },
      { name, subcategory_id: tax.subcategoryId },
    )
    this.itemTypeCache.set(key, id)
    return id
  }

  /** Portrays is a lookup facet so "everything portraying X" is queryable. */
  private readonly portrayCache = new Map<string, string>()
  private async resolvePortray(name: string): Promise<string | null> {
    if (!name?.trim()) return null
    const key = name.trim().toLowerCase()
    const hit = this.portrayCache.get(key)
    if (hit) return hit
    const id = await this.getOrCreate('portrays', 'portray_id', { name: name.trim() }, { name: name.trim() })
    this.portrayCache.set(key, id)
    return id
  }

  private async resolveProperty(name: string): Promise<string | null> {
    if (!name) return null
    const tax = this.requireTax()
    const key = name.toLowerCase()
    const hit = this.propertyCache.get(key)
    if (hit) return hit
    const id = await this.getOrCreate(
      'properties', 'property_id',
      { name, franchise_id: tax.franchiseId },
      { name, franchise_id: tax.franchiseId, subset_id: tax.subsetId },
    )
    this.propertyCache.set(key, id)
    return id
  }

  private async resolveSubject(name: string): Promise<string | null> {
    if (!name) return null
    const key = name.toLowerCase()
    const hit = this.subjectCache.get(key)
    if (hit) return hit
    const id = await this.getOrCreate('subjects', 'subject_id', { subject_name: name }, { subject_name: name, subject_type: 'character' })
    this.subjectCache.set(key, id)
    return id
  }

  /** Load every existing item in this subcategory, keyed by its source_id (dynamic_fields.source_id). */
  async loadExisting(): Promise<Map<string, ExistingItem>> {
    const tax = this.requireTax()
    const map = new Map<string, ExistingItem>()
    const pageSize = 1000
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await this.db
        .from('items')
        .select('item_id, name, description, card_number, brand_id, item_type_id, subset_id, subject_id, subject, availability, rarity_id, franchise_id, dynamic_fields')
        .eq('subcategory_id', tax.subcategoryId)
        .range(from, from + pageSize - 1)
      if (error) throw new Error(`load existing failed: ${error.message}`)
      const rows = (data || []) as ExistingItem[]
      for (const row of rows) {
        const sid = row.dynamic_fields && (row.dynamic_fields as Record<string, unknown>).source_id
        if (typeof sid === 'string' && sid) map.set(sid, row)
      }
      if (rows.length < pageSize) break
    }
    return map
  }

  // ── The sync: create new printings, update changed ones, skip unchanged ────
  async sync(
    cards: NordvikCard[],
    existing: Map<string, ExistingItem>,
  ): Promise<{ imported: number; updated: number; skipped: number }> {
    const tax = this.requireTax()
    let imported = 0
    let updated = 0
    let skipped = 0

    const toCreate: NordvikCard[] = []
    const toUpdate: { card: NordvikCard; existing: ExistingItem }[] = []
    const seen = new Set<string>() // a printing can appear across set calls — de-dupe
    for (const card of cards) {
      if (!card.sourceId || seen.has(card.sourceId)) continue
      seen.add(card.sourceId)
      const ex = existing.get(card.sourceId)
      if (ex) toUpdate.push({ card, existing: ex })
      else toCreate.push(card)
    }

    // CREATE — resolve links then batch-insert items and their child rows.
    const itemRows: Record<string, unknown>[] = []
    const subjectLinks: Record<string, unknown>[] = []
    const propertyLinks: Record<string, unknown>[] = []
    const portrayLinks: Record<string, unknown>[] = []
    const imageRows: Record<string, unknown>[] = []
    for (const card of toCreate) {
      const brandId = await this.resolveBrand(card.itemType)
      const rarityId = await this.resolveRarity(card.rarity)
      const propertyId = await this.resolveProperty(card.property)
      const subjectId = await this.resolveSubject(card.subjectName)
      const itemTypeId = await this.resolveItemType(card.itemType)
      const itemId = newId()
      itemRows.push({
        item_id: itemId,
        name: card.subjectName || null,
        category_id: tax.categoryId,
        subcategory_id: tax.subcategoryId,
        franchise_id: tax.franchiseId,
        subset_id: tax.subsetId,
        brand_id: brandId,
        item_type_id: itemTypeId,
        subject_id: subjectId,
        // Subject is now also a plain indexed text column on items.
        subject: card.subjectName || null,
        availability: card.availability || null,
        rarity_id: rarityId,
        card_number: card.cardNumber || null,
        description: card.description || null,
        dynamic_fields: card.dynamicFields,
      })
      // Portrays (m2m lookup) — resolve each depicted person once, then link.
      for (const person of card.portrays || []) {
        const pid = await this.resolvePortray(person)
        if (pid) portrayLinks.push({ item_id: itemId, portray_id: pid })
      }
      if (subjectId) subjectLinks.push({ item_id: itemId, subject_id: subjectId })
      if (propertyId) propertyLinks.push({ item_id: itemId, property_id: propertyId })
      if (card.imageUrl) imageRows.push({ item_id: itemId, image_path: card.imageUrl, position: 0 })
    }
    if (this.canWrite) {
      for (const c of chunk(itemRows, 200)) {
        const { error } = await this.db.from('items').insert(c)
        if (error) throw new Error(`item insert failed: ${error.message}`)
        imported += c.length
      }
      await this.batchInsert('item_subjects', subjectLinks)
      await this.batchInsert('item_properties', propertyLinks)
      await this.batchInsert('item_portrays', portrayLinks)
      await this.batchInsert('item_images', imageRows)
    }

    // UPDATE — only when a managed field actually changed.
    for (const { card, existing: ex } of toUpdate) {
      const patch = await this.diffToPatch(card, ex)
      if (!patch) { skipped += 1; continue }
      if (this.canWrite) {
        const { error } = await this.db.from('items').update(patch).eq('item_id', ex.item_id)
        if (error) throw new Error(`item update failed: ${error.message}`)
      }
      updated += 1
    }

    return { imported, updated, skipped }
  }

  private async batchInsert(table: string, rows: Record<string, unknown>[]): Promise<void> {
    if (!rows.length || !this.canWrite) return
    for (const c of chunk(rows, 500)) {
      const { error } = await this.db.from(table).insert(c)
      if (error) this.log.warn(`${table} insert warning: ${error.message}`)
    }
  }

  /** Build an UPDATE patch of only the columns that differ, or null if unchanged. */
  private async diffToPatch(card: NordvikCard, ex: ExistingItem): Promise<Record<string, unknown> | null> {
    const tax = this.requireTax()
    const brandId = await this.resolveBrand(card.itemType)
    const rarityId = await this.resolveRarity(card.rarity)
    const subjectId = await this.resolveSubject(card.subjectName)
    const itemTypeId = await this.resolveItemType(card.itemType)
    const patch: Record<string, unknown> = {}
    const desiredName = card.subjectName || null
    if ((ex.name || null) !== desiredName) patch.name = desiredName
    if ((ex.item_type_id || null) !== (itemTypeId || null)) patch.item_type_id = itemTypeId
    if ((ex.subject || null) !== desiredName) patch.subject = desiredName
    if ((ex.availability || null) !== (card.availability || null)) patch.availability = card.availability || null
    if ((ex.description || null) !== (card.description || null)) patch.description = card.description || null
    if ((ex.card_number || null) !== (card.cardNumber || null)) patch.card_number = card.cardNumber || null
    if ((ex.brand_id || null) !== (brandId || null)) patch.brand_id = brandId
    if ((ex.rarity_id || null) !== (rarityId || null)) patch.rarity_id = rarityId
    if ((ex.subject_id || null) !== (subjectId || null)) patch.subject_id = subjectId
    if ((ex.subset_id || null) !== tax.subsetId) patch.subset_id = tax.subsetId
    if ((ex.franchise_id || null) !== tax.franchiseId) patch.franchise_id = tax.franchiseId
    const exDyn = (ex.dynamic_fields || {}) as Record<string, unknown>
    let dynChanged = false
    for (const [k, v] of Object.entries(card.dynamicFields)) {
      if (String(exDyn[k] ?? '') !== String(v ?? '')) { dynChanged = true; break }
    }
    if (dynChanged) patch.dynamic_fields = { ...exDyn, ...card.dynamicFields }
    return Object.keys(patch).length ? patch : null
  }

  private requireTax(): TaxonomyContext {
    if (!this.tax) throw new Error('prepareTaxonomy() must run before sync')
    return this.tax
  }
}

function distinct(values: string[]): string[] {
  return [...new Set(values.map((v) => (v || '').trim()).filter(Boolean))]
}

export type { TaxonomyContext, ExistingItem }
