#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import readline from 'node:readline'
import zlib from 'node:zlib'
import { createClient } from '@supabase/supabase-js'
import { chain } from 'stream-chain'
import { parser } from 'stream-json'
import { streamArray } from 'stream-json/streamers/stream-array.js'

function parseArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    if (!token.startsWith('--')) continue

    const key = token.slice(2)
    const next = argv[i + 1]
    if (!next || next.startsWith('--')) {
      args[key] = 'true'
      continue
    }

    args[key] = next
    i += 1
  }
  return args
}

function printHelp() {
  console.log(`Scryfall bulk importer

Usage:
  node scripts/import-scryfall-bulk.mjs --api-key <catalog_api_key> --file <path/to/all_cards.json|.json.gz> [options]

Required:
  --file              Local Scryfall bulk card file. Supports a JSON array
                      (Scryfall default) or JSONL / NDJSON (one card object per
                      line). .gz is supported for either. Format is auto-detected.

Optional:
  --format            auto|array|jsonl (default: auto — sniffs the first byte)
  --category          Catalog category name (default: Trading Cards)
  --subcategory       Catalog subcategory name (default: Magic: The Gathering)
  --franchise-mode    game|set|line (default: line -- MTG Franchise = Mainline/Universes Beyond/Secret Lair)
  --franchise         Force fixed franchise name (overrides franchise-mode)
  --brand             Brand name passed to API (default: Wizards of the Coast)
  --names             Exact card names separated by | (case-insensitive)
  --names-file        Text file with one exact card name per line (case-insensitive)
  --start             Start index in file (default: 0)
  --limit             Max cards to process (default: all from start)
  --concurrency       Parallel in-flight RPC calls (default: 1). For a full
                      2.8GB load, 8–16 is much faster and still gentle.
  --checkpoint        Path to a resume file. Progress is written here as an
                      index; on restart the run auto-resumes from it unless
                      --start is given explicitly.
  --sleep-ms          Delay between calls in ms (default: 0)
  --dry-run           Print mapped payloads only; no writes
  --help              Show this help

Environment:
  VITE_SUPABASE_URL or SUPABASE_URL
  VITE_SUPABASE_ANON_KEY or SUPABASE_ANON_KEY
  ADMIN_EMAIL, ADMIN_PASSWORD   platform-admin login used to write items
                                (not needed for --dry-run)
`)
}

function toInt(value, fallback) {
  if (value == null) return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function normalizeArray(value) {
  if (Array.isArray(value)) return value
  return []
}

function normalizeName(value) {
  return String(value || '').trim().toLowerCase()
}

function parseNamesList(rawValue) {
  if (!rawValue || typeof rawValue !== 'string') {
    return []
  }

  return rawValue
    .split('|')
    .map((name) => name.trim())
    .filter(Boolean)
}

function readNamesFromFile(filePath) {
  if (!filePath) {
    return []
  }

  const absolute = path.resolve(process.cwd(), filePath)
  if (!fs.existsSync(absolute)) {
    throw new Error(`Names file not found: ${absolute}`)
  }

  const content = fs.readFileSync(absolute, 'utf8')
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
}

// ── MTG "line" classification: Franchise = Mainline | Universes Beyond | Secret
// Lair. Secret Lair wins first. A card is Universes Beyond if its set is one of
// the known UB set codes OR its set name matches a listed non-MTG IP. Everything
// else is Mainline. Both lists are easy to extend as new sets release.
const UB_SET_CODES = new Set([
  'ltr', 'ltc',        // The Lord of the Rings
  'who',               // Doctor Who
  'pip',               // Fallout
  '40k',               // Warhammer 40,000
  'rex',               // Jurassic World
  'acr',               // Assassin's Creed
  'fin', 'fic', 'fca', // Final Fantasy
  'spm',               // Marvel's Spider-Man
  'clb',               // Baldur's Gate (D&D)
  'afr', 'afc',        // Adventures in the Forgotten Realms (D&D)
])
// Matched case-insensitively against the Scryfall set name.
const UB_NAME_PATTERNS = [
  /walking dead/i, /stranger things/i, /arcane/i, /street fighter/i, /fortnite/i,
  /warhammer/i, /transformers/i, /forgotten realms|baldur'?s gate|dungeons? ?& ?dragons/i,
  /lord of the rings|middle-?earth/i, /creepshow/i, /doctor who/i, /evil dead/i,
  /princess bride/i, /jurassic/i, /tomb raider/i, /cluedo|\bclue\b/i, /fallout/i,
  /hatsune miku/i, /assassin'?s creed/i, /monty python/i, /ghostbusters/i,
  /child'?s play/i, /marvel|spider-?man/i, /final fantasy/i, /spongebob/i,
  /teenage mutant ninja turtles|ninja turtles/i,
]
function classifyMtgLine(card) {
  const setName = card.set_name || ''
  const setCode = (card.set || '').toLowerCase()
  if (/secret lair/i.test(setName)) return 'Secret Lair'
  if (UB_SET_CODES.has(setCode)) return 'Universes Beyond'
  if (UB_NAME_PATTERNS.some((re) => re.test(setName))) return 'Universes Beyond'
  return 'Mainline'
}

// ── Field mapping helpers: translate Scryfall shapes into the app's Trading
// Cards field spec (Type = colour, Traits = subtypes, Abilities = rules text,
// Cost = readable mana, Finish, Language, and a legalities object the existing
// card_format_legality backfill can read).
const MTG_COLOR_NAMES = { W: 'White', U: 'Blue', B: 'Black', R: 'Red', G: 'Green', C: 'Colorless' }
const MTG_LANG_NAMES = {
  en: 'English', es: 'Spanish', fr: 'French', de: 'German', it: 'Italian',
  pt: 'Portuguese', ja: 'Japanese', ko: 'Korean', ru: 'Russian',
  zhs: 'Chinese (Simplified)', zht: 'Chinese (Traditional)', he: 'Hebrew',
  la: 'Latin', grc: 'Ancient Greek', ar: 'Arabic', sa: 'Sanskrit', ph: 'Phyrexian',
}

function colorLabel(colors) {
  const arr = normalizeArray(colors)
  if (!arr.length) return 'Colorless'
  return arr.map((c) => MTG_COLOR_NAMES[c] || c).join(', ')
}
// Subtypes are the part of the type line after the em dash: "Creature — Vampire
// Cleric" → ["Vampire", "Cleric"]. These are the app's Traits.
function subtypesFromTypeLine(typeLine) {
  if (!typeLine) return []
  const parts = String(typeLine).split('—')
  if (parts.length < 2) return []
  return parts[1].trim().split(/\s+/).filter(Boolean)
}
// Oracle text → one ability per line (matches the app's multi-value chips).
function abilitiesFromOracle(text) {
  if (!text) return []
  return String(text).split('\n').map((s) => s.trim()).filter(Boolean)
}
function languageName(lang) { return MTG_LANG_NAMES[lang] || lang || null }
function finishesLabel(finishes) {
  const arr = normalizeArray(finishes).filter((f) => typeof f === 'string' && f.trim())
  if (!arr.length) return null
  return arr.map((f) => f.charAt(0).toUpperCase() + f.slice(1)).join(', ')
}
// "{2}{W}{W}" → "2 White, 2 Any Colour".
function formatMana(manaCost) {
  if (!manaCost) return null
  const syms = [...String(manaCost).matchAll(/\{([^}]+)\}/g)].map((m) => m[1])
  if (!syms.length) return null
  let generic = 0
  const colored = {}
  for (const s of syms) {
    if (/^\d+$/.test(s)) generic += parseInt(s, 10)
    else colored[s] = (colored[s] || 0) + 1
  }
  const parts = []
  for (const c of ['W', 'U', 'B', 'R', 'G', 'C']) {
    if (colored[c]) { parts.push(`${colored[c]} ${MTG_COLOR_NAMES[c]}`); delete colored[c] }
  }
  for (const [sym, n] of Object.entries(colored)) parts.push(`${n} {${sym}}`) // hybrid/phyrexian
  if (generic) parts.push(`${generic} Any Colour`)
  return parts.join(', ') || null
}
// Scryfall legalities are {format: "legal"|"not_legal"|…}. The card_format_legality
// backfill inserts only entries whose value is JSON true, so keep just the
// legal/restricted formats as {format: true}.
function legalObject(legalities) {
  const out = {}
  if (legalities && typeof legalities === 'object') {
    for (const [fmt, status] of Object.entries(legalities)) {
      if (status === 'legal' || status === 'restricted') out[fmt] = true
    }
  }
  return out
}

function mapCardToPayload(card, config) {
  const category = config.category
  const subcategory = config.subcategory
  const franchiseName = config.franchise
    || (config.franchiseMode === 'game'
      ? 'Magic: The Gathering'
      : config.franchiseMode === 'set'
        ? (card.set_name || 'Unknown Set')
        : classifyMtgLine(card)) // default: line (Mainline / Universes Beyond / Secret Lair)

  const nameBase = (card.name || '').trim() || 'Unknown Card'
  const collectorNumber = (card.collector_number || '').trim()
  const setCode = (card.set || '').toUpperCase()
  const itemName = collectorNumber
    ? `${nameBase} [${setCode || 'SET'} #${collectorNumber}]`
    : nameBase

  const year = (() => {
    const dateText = (card.released_at || '').trim()
    if (!dateText || dateText.length < 4) return null
    const parsedYear = Number(dateText.slice(0, 4))
    return Number.isFinite(parsedYear) ? parsedYear : null
  })()

  // Description = flavour text (the italic quote); rules text goes to Abilities.
  const description = card.flavor_text || null

  const rarity = card.rarity ? card.rarity.charAt(0).toUpperCase() + card.rarity.slice(1) : null
  const dynamicFields = {
    // ── Spec-aligned Trading Cards fields ──
    type: colorLabel(card.colors),                    // Type = colour ("White")
    traits: subtypesFromTypeLine(card.type_line),     // Traits = subtypes (array)
    abilities: abilitiesFromOracle(card.oracle_text), // Abilities = rules text (array)
    cost: formatMana(card.mana_cost),                 // Cost = readable mana
    finish: finishesLabel(card.finishes),             // Finish = available finishes
    artist: card.artist || null,                      // Artist
    language: languageName(card.lang),                // Language = "English"
    // legalities → drives the Legal field via the card_format_legality backfill.
    // NOT shown as a row (the app hides it); it's data for the backfill only.
    legalities: legalObject(card.legalities),
    // ── Magic-specific extras (shown as labelled rows) ──
    type_line: card.type_line || null,                // full "Creature — Vampire"
    rarity,
    mana_value: card.cmc ?? null,
    power: card.power || null,
    toughness: card.toughness || null,
    loyalty: card.loyalty || null,
    keywords: normalizeArray(card.keywords),
    color_identity: normalizeArray(card.color_identity).map((c) => MTG_COLOR_NAMES[c] || c),
    set_code: card.set || null,
    // NOTE: `set` and `collector_number` are intentionally omitted — they are
    // shown by the item's real Subfranchise and Card Number columns, so keeping
    // them here would duplicate those rows. Links live in metadata, not here.
  }

  const metadata = {
    identifier: card.id || null,
    status: 'published',
    dynamic_fields: dynamicFields,
    source: 'scryfall_bulk',
    scryfall_oracle_id: card.oracle_id || null,
    scryfall_tcgplayer_id: card.tcgplayer_id || null,
    scryfall_cardmarket_id: card.cardmarket_id || null,
    scryfall_mtgo_id: card.mtgo_id || null,
    scryfall_uri: card.scryfall_uri || null,
    image_url: card.image_uris?.normal || card.image_uris?.large || null,
    lang: card.lang || null,
    released_at: card.released_at || null,
    games: normalizeArray(card.games),
    promo: Boolean(card.promo),
    foil: Boolean(card.foil),
    nonfoil: Boolean(card.nonfoil),
    reserved: Boolean(card.reserved),
  }

  const variants = normalizeArray(card.finishes)
    .filter((finish) => typeof finish === 'string' && finish.trim())
    .map((finish) => ({
      name: finish.trim().toUpperCase(),
      sku: null,
      identifier: card.id || null,
      condition: 'NM',
    }))

  const people = card.artist
    ? [{ name: String(card.artist).trim(), roles: ['Illustrator'] }]
    : null

  return {
    p_category_name: category,
    p_subcategory_name: subcategory,
    p_franchise_name: franchiseName,
    p_item_name: itemName,
    p_release_year: year,
    p_description: description,
    p_brand_name: config.brand,
    p_metadata: metadata,
    p_people: people,
    p_minifigures: null,
    p_variants: variants.length > 0 ? variants : null,
  }
}

function openDecodedStream(absolute) {
  const source = fs.createReadStream(absolute)
  return absolute.endsWith('.gz') ? source.pipe(zlib.createGunzip()) : source
}

// Peek at the first meaningful (non-whitespace) byte of the decoded stream.
// A JSON array starts with '['; JSONL / NDJSON starts with '{'.
async function detectFormat(absolute) {
  return new Promise((resolve, reject) => {
    const stream = openDecodedStream(absolute)
    stream.on('error', reject)
    stream.on('data', (chunk) => {
      const text = chunk.toString('utf8')
      const match = text.match(/\S/)
      stream.destroy()
      if (!match) {
        resolve('array')
        return
      }
      resolve(match[0] === '[' ? 'array' : 'jsonl')
    })
    stream.on('end', () => resolve('array'))
  })
}

async function* readJsonArrayStream(absolute) {
  const pipeline = chain([openDecodedStream(absolute), parser(), streamArray()])
  for await (const item of pipeline) {
    yield item?.value
  }
}

async function* readJsonlStream(absolute) {
  const rl = readline.createInterface({
    input: openDecodedStream(absolute),
    crlfDelay: Infinity,
  })
  for await (const line of rl) {
    const trimmed = line.trim()
    // Tolerate blank lines and stray array framing if a JSONL export was
    // wrapped in brackets or comma-separated.
    if (!trimmed || trimmed === '[' || trimmed === ']') continue
    const clean = trimmed.endsWith(',') ? trimmed.slice(0, -1) : trimmed
    try {
      yield JSON.parse(clean)
    } catch (err) {
      throw new Error(`Failed to parse JSONL line: ${err.message}`)
    }
  }
}

async function* readBulkCardsStream(filePath, format) {
  const absolute = path.resolve(process.cwd(), filePath)
  const resolved = format === 'auto' ? await detectFormat(absolute) : format
  if (resolved === 'jsonl') {
    yield* readJsonlStream(absolute)
  } else {
    yield* readJsonArrayStream(absolute)
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ── Direct-insert ingest (matches the app's Create Item form) ─────────────
// The old create_catalog_item_via_api RPC was removed when the catalog was
// reshaped; the app now writes items directly as an authenticated admin. We do
// the same: resolve/create Category → Subcategory → Franchise (line) →
// Subfranchise (set), then upsert the item row.
async function resolveIngestContext(supabase, config) {
  const { data: cat } = await supabase.from('categories').select('category_id').eq('name', config.category).maybeSingle()
  if (!cat) throw new Error(`Category not found: "${config.category}"`)
  const { data: sub } = await supabase.from('subcategories')
    .select('subcategory_id').eq('category_id', cat.category_id).eq('name', config.subcategory).maybeSingle()
  if (!sub) throw new Error(`Subcategory not found: "${config.subcategory}" under ${config.category}`)
  return {
    categoryId: cat.category_id,
    subcategoryId: sub.subcategory_id,
    // Caches hold PROMISES keyed by name so concurrent cards that need the same
    // franchise/set share one create instead of racing to duplicate it.
    franchiseCache: new Map(),
    subsetCache: new Map(),
  }
}

function getOrCreateFranchise(supabase, ctx, name) {
  const key = name.toLowerCase()
  if (ctx.franchiseCache.has(key)) return ctx.franchiseCache.get(key)
  const p = (async () => {
    let { data } = await supabase.from('franchises').select('franchise_id').ilike('name', name).limit(1).maybeSingle()
    if (!data) {
      const { data: created, error } = await supabase.from('franchises').insert({ name }).select('franchise_id').single()
      if (error) throw error
      data = created
    }
    await supabase.from('franchise_subcategory')
      .upsert({ franchise_id: data.franchise_id, subcategory_id: ctx.subcategoryId }, { onConflict: 'franchise_id,subcategory_id', ignoreDuplicates: true })
    return data.franchise_id
  })()
  ctx.franchiseCache.set(key, p)
  return p
}

function getOrCreateSubset(supabase, ctx, franchiseId, name) {
  const key = `${franchiseId}|${name.toLowerCase()}`
  if (ctx.subsetCache.has(key)) return ctx.subsetCache.get(key)
  const p = (async () => {
    let { data } = await supabase.from('subsets').select('subset_id')
      .eq('franchise_id', franchiseId).ilike('name', name).limit(1).maybeSingle()
    if (!data) {
      const { data: created, error } = await supabase.from('subsets').insert({ name, franchise_id: franchiseId }).select('subset_id').single()
      if (error) throw error
      data = created
    }
    return data.subset_id
  })()
  ctx.subsetCache.set(key, p)
  return p
}

// Insert (or update) a card as real item rows, mirroring the app's form. Each
// finish (foil / nonfoil / etched …) becomes its OWN item — a card printed in
// both foil and nonfoil is two entries. They share name + number + subset, so
// the app's CardVariants links them as variants in Related Items automatically.
async function ingestCard(supabase, ctx, card, config) {
  const payload = mapCardToPayload(card, config)
  const franchiseId = await getOrCreateFranchise(supabase, ctx, payload.p_franchise_name)
  const setName = (card.set_name || '').trim()
  const subsetId = setName ? await getOrCreateSubset(supabase, ctx, franchiseId, setName) : null

  const df = payload.p_metadata?.dynamic_fields || {}
  const baseDynamic = Object.fromEntries(
    Object.entries(df).filter(([, v]) => v !== '' && v != null && !(Array.isArray(v) && v.length === 0)),
  )
  const cardName = (card.name || '').trim() || 'Unknown Card'
  const cardNumber = (card.collector_number || '').trim() || null
  const imageUrl = card.image_uris?.normal || card.image_uris?.large
    || card.card_faces?.[0]?.image_uris?.normal || card.card_faces?.[0]?.image_uris?.large || null

  const finishes = normalizeArray(card.finishes).filter((f) => typeof f === 'string' && f.trim())
  const finishList = finishes.length ? finishes : ['nonfoil']

  for (const finishRaw of finishList) {
    const finish = finishRaw.charAt(0).toUpperCase() + finishRaw.slice(1)
    const dynamicFields = { ...baseDynamic, finish }
    const row = {
      name: cardName,
      subject: cardName,
      category_id: ctx.categoryId,
      subcategory_id: ctx.subcategoryId,
      franchise_id: franchiseId,
      subset_id: subsetId,
      card_number: cardNumber,
      description: payload.p_description || null,
      release_year: payload.p_release_year ?? null,
      dynamic_fields: dynamicFields,
    }

    // Idempotency: set + collector number + finish is unique (fall back to name
    // when there's no number). Update in place so re-runs refresh the mapping.
    let findQ = supabase.from('items').select('item_id')
      .eq('subcategory_id', ctx.subcategoryId).eq('dynamic_fields->>finish', finish)
    if (subsetId) findQ = findQ.eq('subset_id', subsetId)
    findQ = cardNumber ? findQ.eq('card_number', cardNumber) : findQ.eq('name', cardName)
    const { data: existing } = await findQ.limit(1).maybeSingle()

    let itemId
    if (existing) {
      itemId = existing.item_id
      const { error } = await supabase.from('items').update(row).eq('item_id', itemId)
      if (error) throw error
    } else {
      const { data: created, error } = await supabase.from('items').insert(row).select('item_id').single()
      if (error) throw error
      itemId = created.item_id
    }

    // Attach the Scryfall image as the front image (position 0), only if none yet.
    if (itemId && imageUrl) {
      const { data: existingImg } = await supabase.from('item_images')
        .select('item_image_id').eq('item_id', itemId).eq('position', 0).limit(1).maybeSingle()
      if (!existingImg) {
        await supabase.from('item_images').insert({ item_id: itemId, image_path: imageUrl, position: 0 })
      }
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help === 'true') {
    printHelp()
    return
  }

  const filePath = args.file
  if (!filePath) {
    printHelp()
    process.exitCode = 1
    return
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase env vars. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.')
  }

  const formatArg = (args.format || 'auto').toLowerCase()
  const format = ['array', 'jsonl'].includes(formatArg) ? formatArg : 'auto'

  const startProvided = args.start != null
  const config = {
    format,
    category: args.category || 'Trading Cards',
    subcategory: args.subcategory || 'Magic: The Gathering',
    franchiseMode: ['game', 'set', 'line'].includes((args['franchise-mode'] || 'line').toLowerCase())
      ? (args['franchise-mode'] || 'line').toLowerCase()
      : 'line',
    franchise: args.franchise || '',
    brand: args.brand || 'Wizards of the Coast',
    names: parseNamesList(args.names || ''),
    namesFile: args['names-file'] || '',
    start: Math.max(0, toInt(args.start, 0)),
    limit: Math.max(0, toInt(args.limit, 0)),
    concurrency: Math.max(1, toInt(args.concurrency, 1)),
    checkpoint: args.checkpoint || '',
    sleepMs: Math.max(0, toInt(args['sleep-ms'], 0)),
    dryRun: args['dry-run'] === 'true',
  }

  // Resume from a checkpoint file unless an explicit --start overrides it.
  if (config.checkpoint && !startProvided && !config.dryRun) {
    const cpPath = path.resolve(process.cwd(), config.checkpoint)
    if (fs.existsSync(cpPath)) {
      const saved = toInt(fs.readFileSync(cpPath, 'utf8').trim(), -1)
      if (saved >= 0) {
        config.start = saved + 1
        console.log(`Resuming from checkpoint ${cpPath}: starting at index ${config.start}`)
      }
    }
  }

  const fileNames = readNamesFromFile(config.namesFile)
  const allowedNameSet = new Set(
    [...config.names, ...fileNames]
      .map((name) => normalizeName(name))
      .filter(Boolean),
  )

  const supabase = createClient(supabaseUrl, supabaseAnonKey)

  // Authenticate as a platform-admin and resolve the taxonomy context (writes
  // go through the app's normal RLS, same as the Create Item form). Dry runs
  // skip auth entirely — they only print payloads.
  let ctx = null
  if (!config.dryRun) {
    const adminEmail = process.env.ADMIN_EMAIL
    const adminPassword = process.env.ADMIN_PASSWORD
    if (!adminEmail || !adminPassword) {
      throw new Error('Set ADMIN_EMAIL and ADMIN_PASSWORD in .env (a platform_admin account) to write items.')
    }
    const { error: authErr } = await supabase.auth.signInWithPassword({ email: adminEmail, password: adminPassword })
    if (authErr) throw new Error(`Admin sign-in failed: ${authErr.message}`)
    ctx = await resolveIngestContext(supabase, config)
    console.log(`Signed in as ${adminEmail} — writing to ${config.category} › ${config.subcategory}`)
  }

  let successCount = 0
  let errorCount = 0
  let seenCount = 0
  let processedCount = 0
  let skippedByNameCount = 0
  const stopAfter = config.limit > 0 ? config.start + config.limit : null

  console.log(`Streaming file from index ${config.start}${config.limit > 0 ? ` for ${config.limit} rows` : ' to end of file'} (format: ${config.format}, concurrency: ${config.concurrency})`)
  if (allowedNameSet.size > 0) {
    console.log(`Name allowlist active: ${allowedNameSet.size} card names`)
  }

  // Checkpointing: rows are dispatched in index order but may finish out of
  // order under concurrency, so we only persist the highest index up to which
  // every row has completed. That guarantees a resume never skips a row.
  const cpPath = config.checkpoint ? path.resolve(process.cwd(), config.checkpoint) : ''
  const done = new Set()
  let checkpointIndex = config.start - 1
  const recordDone = (i) => {
    if (!cpPath) return
    done.add(i)
    while (done.has(checkpointIndex + 1)) {
      checkpointIndex += 1
      done.delete(checkpointIndex)
    }
  }
  let lastFlushed = -1
  const flushCheckpoint = () => {
    if (!cpPath || checkpointIndex === lastFlushed) return
    fs.writeFileSync(cpPath, String(checkpointIndex))
    lastFlushed = checkpointIndex
  }

  const importOne = async (card, i) => {
    // Never reject: a thrown error here (network blip, odd card shape) would
    // otherwise abort the whole run via the mid-loop Promise.race and leave
    // sibling in-flight promises as unhandled rejections. Catch, count, resume.
    try {
      await ingestCard(supabase, ctx, card, config)
      successCount += 1
      if (successCount % 50 === 0) {
        console.log(`Progress: ${successCount} imported, ${errorCount} errors, ${skippedByNameCount} skipped by name filter (checkpoint @ ${checkpointIndex})`)
      }
    } catch (err) {
      errorCount += 1
      console.error(`ERROR [${i}] ${card?.name || ''}: ${err?.message || err}`)
    } finally {
      recordDone(i)
      flushCheckpoint()
      if (config.sleepMs > 0) await sleep(config.sleepMs)
    }
  }

  // Bounded pool of in-flight RPC calls.
  const inFlight = new Set()
  const launch = (card, i) => {
    const p = importOne(card, i).finally(() => inFlight.delete(p))
    inFlight.add(p)
    return p
  }

  for await (const card of readBulkCardsStream(filePath, config.format)) {
    const i = seenCount
    seenCount += 1

    if (i < config.start) {
      continue
    }

    if (stopAfter !== null && i >= stopAfter) {
      break
    }

    if (allowedNameSet.size > 0) {
      const cardName = normalizeName(card?.name)
      if (!allowedNameSet.has(cardName)) {
        skippedByNameCount += 1
        recordDone(i)
        continue
      }
    }

    processedCount += 1

    if (config.dryRun) {
      console.log(JSON.stringify({ index: i, payload: mapCardToPayload(card, config) }, null, 2))
      if (stopAfter !== null && i + 1 >= stopAfter) {
        break
      }
      continue
    }

    launch(card, i)
    if (inFlight.size >= config.concurrency) {
      await Promise.race(inFlight)
    }
  }

  // Drain any remaining in-flight work before final summary/checkpoint.
  await Promise.allSettled(inFlight)
  flushCheckpoint()

  if (config.dryRun) {
    console.log(`Dry run complete. Previewed: ${processedCount}, skipped by name filter: ${skippedByNameCount}`)
    return
  }

  console.log(`Done. Imported: ${successCount}, errors: ${errorCount}, processed: ${processedCount}, skipped by name filter: ${skippedByNameCount}`)
}

main().catch((error) => {
  console.error(error?.message || error)
  process.exit(1)
})
