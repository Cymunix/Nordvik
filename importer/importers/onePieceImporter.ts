// One Piece importer — orchestrates the pipeline: fetch sets → map → validate →
// (optionally) sync. The validator and sync service are game-agnostic, so a new
// TCG only needs its own API client + mapper and can reuse this same shape.
import { writeFileSync } from 'node:fs'
import { OptcgClient } from '../api/client.ts'
import { onePieceMapper } from '../mappers/onePieceMapper.ts'
import { validateCard, checkImagesLive } from '../validators/cardValidator.ts'
import type { SupabaseSync } from '../services/syncService.ts'
import type { Logger } from '../services/logger.ts'
import type { NordvikCard, SyncReport } from '../types.ts'

export interface ImportOptions {
  dryRun: boolean
  setFilter: string[] | null // only these set_ids (e.g. ["OP-16"] to import one new set)
  checkImages: boolean
  jsonOut: string | null
  verbose: boolean
}

export async function runOnePieceImport(
  sync: SupabaseSync | null,
  log: Logger,
  opts: ImportOptions,
): Promise<SyncReport> {
  const start = Date.now()
  const client = new OptcgClient()
  const report: SyncReport = {
    importedSets: 0, failedSets: [], cardsSeen: 0,
    cardsImported: 0, cardsUpdated: 0, cardsSkipped: 0,
    validationIssues: [], durationMs: 0,
  }

  log.info('Fetching set list (GET /api/allSets/)…')
  const allSets = await client.getAllSets()
  const sets = opts.setFilter ? allSets.filter((s) => opts.setFilter!.includes(s.set_id)) : allSets
  log.info(`${sets.length} of ${allSets.length} set(s) selected for import.`)

  const mapped: NordvikCard[] = []
  for (const set of sets) {
    try {
      const cards = await client.getSet(set.set_id)
      for (const apiCard of cards) {
        const nv = onePieceMapper.mapCard(apiCard, set)
        report.cardsSeen += 1
        report.validationIssues.push(...validateCard(nv))
        mapped.push(nv)
      }
      report.importedSets += 1
      log.debug(`  ${set.set_id.padEnd(10)} ${set.set_name} — ${cards.length} cards`)
    } catch (err) {
      // One bad set must not stop the run.
      report.failedSets.push(set.set_id)
      log.error(`Set ${set.set_id} failed, continuing: ${String(err)}`)
    }
  }
  log.info(`Parsed ${mapped.length} card printings across ${report.importedSets} set(s).`)

  // Duplicate detection: with the (image-id + set-id) key, any repeat is a true
  // duplicate record from the API. Flag it; the sync collapses it to one item.
  const seenSrc = new Set<string>()
  for (const c of mapped) {
    if (seenSrc.has(c.sourceId)) {
      report.validationIssues.push({
        sourceId: c.sourceId, cardNumber: c.cardNumber, field: 'duplicate', severity: 'warning',
        message: 'Duplicate printing (same card_image_id + set) — collapsed to one item',
      })
    } else {
      seenSrc.add(c.sourceId)
    }
  }

  if (opts.checkImages) {
    log.info('Validating image URLs (live HEAD checks)…')
    report.validationIssues.push(...(await checkImagesLive(mapped)))
  }

  if (opts.jsonOut) {
    writeFileSync(opts.jsonOut, JSON.stringify(mapped, null, 2))
    log.info(`Wrote ${mapped.length} DB-ready cards → ${opts.jsonOut}`)
  }

  if (opts.dryRun || !sync) {
    log.info('Dry run — no database writes performed.')
    report.durationMs = Date.now() - start
    return report
  }

  if (!mapped.length) {
    log.warn('No cards mapped — nothing to sync.')
    report.durationMs = Date.now() - start
    return report
  }

  log.info('Resolving NORDVIK taxonomy…')
  await sync.prepareTaxonomy(onePieceMapper.taxonomy)
  await sync.preloadCaches(mapped)
  log.info('Loading existing catalogue items…')
  const existing = await sync.loadExisting()
  log.info(`${existing.size} existing item(s) in this subcategory. Syncing…`)
  const res = await sync.sync(mapped, existing)
  report.cardsImported = res.imported
  report.cardsUpdated = res.updated
  report.cardsSkipped = res.skipped
  report.durationMs = Date.now() - start
  return report
}
