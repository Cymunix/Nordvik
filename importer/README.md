# NORDVIK Trading-Card Importer

A repeatable, API-driven importer that pulls every card from the **OPTCG API**
(one piece) and syncs it into the NORDVIK catalogue. No PDF scraping, no browser
exports — it calls the API directly, so new sets import automatically as they ship.

The framework is **game-agnostic**: validation, sync, and orchestration operate on
a neutral `NordvikCard` shape, so Pokémon / Lorcana / Magic / Yu-Gi-Oh! plug in by
adding their own API client + mapper and reusing everything else.

## Architecture

```
importer/
  api/client.ts               OPTCG API client (getAllSets, getSet) — retries + timeout
  mappers/onePieceMapper.ts   OPTCG card -> neutral NordvikCard (+ variant logic)
  validators/cardValidator.ts validation (missing/invalid fields, image URLs) — game-agnostic
  services/
    syncService.ts            taxonomy resolution + create/update/skip sync (Supabase)
    logger.ts                 structured logging + final report
  importers/onePieceImporter.ts  orchestration: fetch -> map -> validate -> sync
  run.ts                      CLI entry
  types.ts                    shared types + the TcgMapper interface to plug new games in
```

## Requirements

- **Node 24+** (runs the TypeScript directly via native type-stripping — no build step).
- `@supabase/supabase-js` (already a project dependency).

## Environment

| Var | Purpose |
|-----|---------|
| `SUPABASE_URL` (or `VITE_SUPABASE_URL`) | project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | **required for real writes** — bypasses RLS |
| `VITE_SUPABASE_ANON_KEY` | enough for `--dry-run` (read-only) |

The service-role key is a **secret** — keep it in `.env` (git-ignored), never commit it.

## Usage

```bash
# Map + validate every set, write DB-ready JSON, no DB writes:
npm run import:onepiece:dry -- --json-out mapped.json

# Full sync (needs SUPABASE_SERVICE_ROLE_KEY in .env):
npm run import:onepiece

# Import just one (e.g. a newly released) set:
npm run import:onepiece -- --set OP-16

# Live-check every image URL too:
npm run import:onepiece -- --check-images
```

Flags: `--dry-run`, `--set OP-16` (comma-separated / repeatable), `--json-out <file>`,
`--check-images`, `--verbose`.

## How it maps (per the NORDVIK spec)

| NORDVIK | API |
|---|---|
| Category | `"Trading Cards"` |
| Subcategory | `"One Piece"` |
| Franchise | `"One Piece"` |
| Subfranchise | `"The One Piece Card Game"` |
| Property | `set_name` |
| Item Type / Card Type | `card_type` |
| Collection | `sub_types` |
| Subject | `card_name` |
| ID Number / Card Number | `card_set_id` |
| Description | `card_text` |
| Card Colour / Set ID / Life / Cost / Power / Counter / Attribute | `card_color` / `set_id` / `life` / `card_cost` / `card_power` / `counter_amount` / `attribute` (→ `dynamic_fields`) |
| Rarity | `rarity` |
| Card Image | `card_image` |

Ignored: `inventory_price`, `market_price`, `date_scraped`.

## Variants

- Cards that share `card_set_id` (e.g. `OP01-001`) belong to the same **Variant
  Group** — every printing stays its own catalogue item (they link via
  `items.card_number`).
- The **sync key** is `card_image_id` + `set_id` (a printing repeats across sets;
  keying on both preserves each set's listing and lets re-runs match reliably).
  It is stored in `dynamic_fields.source_id`.
- `variant_type` is derived from the image-id suffix: `Standard`, `Parallel`,
  `Alternate Art N`, `Reprint N`.

## Sync behaviour

- **New printing** → create.
- **Existing printing, changed fields** → update only the changed columns.
- **Existing, unchanged** → skip.
- **New set** → its cards are simply new source-ids, so they're created; run
  `--set <id>` to import only a specific new set.
- **One set failing** never stops the run — it's recorded under *Failed Sets*.

## Validation

Reports (never fatal): missing required fields, invalid card numbers, empty names,
missing/invalid set references, unrecognised card types, and missing/malformed (or,
with `--check-images`, broken) image URLs. Genuine duplicate records are flagged and
collapsed to one item.

## Verified

A full `--dry-run` fetches **21 sets / ~3,485 printings in ~3s** with 0 structural
errors; the write path uses the same Supabase patterns as the app's bulk importer.
Test a real sync on a single set first (`--set OP-01`) before a full run.
