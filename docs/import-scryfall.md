# Importing the Scryfall bulk file

Scryfall ships a single bulk file with every Magic card (~2.8 GB, ~450k rows).
Because each card is ingested one row at a time through the
`create_catalog_item_via_api` RPC, this is a CLI bulk-load, not a browser
upload — it runs unattended, resumes after a crash, and can parallelise.

The file may arrive as either shape and both are supported (`.gz` too); the
format is auto-detected:

- **JSON array** — Scryfall's default `all_cards.json` (`[ {…}, {…} ]`).
- **JSONL / NDJSON** — one card object per line.

## Recommended command (full load)

```bash
node --env-file=.env scripts/import-scryfall-bulk.mjs \
  --api-key <catalog_api_key> \
  --file /path/to/all-cards.jsonl \
  --concurrency 12 \
  --checkpoint .scryfall.checkpoint
```

- `--concurrency 12` keeps ~12 RPC calls in flight — far faster than the
  default serial mode for a full load, while staying gentle on the API.
- `--checkpoint <file>` writes progress as a row index. If the run dies, just
  run the same command again — it auto-resumes from the checkpoint (unless you
  pass an explicit `--start`). The checkpoint only advances past a row once
  every earlier row has completed, so a resume never skips a card.

## Useful flags

- `--dry-run` — print mapped payloads without writing (verify the file first).
- `--limit N` / `--start N` — process a slice, e.g. a quick 100-row test.
- `--names-file cards.txt` — import only specific card names.
- `--format auto|array|jsonl` — override detection if ever needed.

Run `node scripts/import-scryfall-bulk.mjs --help` for the full option list.

## Get a catalog API key

The `--api-key` is a catalog API key created via `create_catalog_api_key`
(platform-admin). It, not your Supabase service key, authorises the ingest.
