// Pokémon importer — fetch sets → fetch each card's full detail → map →
// validate → (optionally) sync. Same shape as the One Piece importer; the
// validator and sync service are game-agnostic and reused unchanged.
import { writeFileSync } from 'node:fs'
import { TcgdexClient } from '../api/tcgdexClient.ts'
import { pokemonMapper } from '../mappers/pokemonMapper.ts'
import { validateCard, checkImagesLive } from '../validators/cardValidator.ts'
import type { SupabaseSync } from '../services/syncService.ts'
import type { Logger } from '../services/logger.ts'
import type { NordvikCard, SyncReport } from '../types.ts'
import type { ImportOptions } from './onePieceImporter.ts'

export async function runPokemonImport(
  sync: SupabaseSync | null,
  log: Logger,
  opts: ImportOptions,
): Promise<SyncReport> {
  const start = Date.now()
  const client = new TcgdexClient()
  const report: SyncReport = {
    importedSets: 0, failedSets: [], cardsSeen: 0,
    cardsImported: 0, cardsUpdated: 0, cardsSkipped: 0,
    validationIssues: [], durationMs: 0,
  }

  log.info('Fetching set list (GET /v2/en/sets)…')
  const allSets = await client.getAllSets()
  const sets = opts.setFilter ? allSets.filter((s) => opts.setFilter!.includes(s.id)) : allSets
  log.info(`${sets.length} of ${allSets.length} set(s) selected for import.`)

  const mapped: NordvikCard[] = []
  for (const setResume of sets) {
    try {
      // One /sets call + a bounded fan-out of /cards/{id} for full detail.
      const { set, cards } = await client.getSetCardsFull(setResume.id)
      for (const apiCard of cards) {
        const nv = pokemonMapper.mapCard(apiCard, set)
        report.cardsSeen += 1
        report.validationIssues.push(...validateCard(nv, pokemonMapper.validItemTypes))
        mapped.push(nv)
      }
      report.importedSets += 1
      log.debug(`  ${setResume.id.padEnd(12)} ${setResume.name} — ${cards.length} cards`)
    } catch (err) {
      report.failedSets.push(setResume.id)
      log.error(`Set ${setResume.id} failed, continuing: ${String(err)}`)
    }
  }
  log.info(`Parsed ${mapped.length} cards across ${report.importedSets} set(s).`)

  // card.id is globally unique in TCGdex, so any repeat is a true duplicate.
  const seenSrc = new Set<string>()
  for (const c of mapped) {
    if (seenSrc.has(c.sourceId)) {
      report.validationIssues.push({
        sourceId: c.sourceId, cardNumber: c.cardNumber, field: 'duplicate', severity: 'warning',
        message: 'Duplicate card id — collapsed to one item',
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
  await sync.prepareTaxonomy(pokemonMapper.taxonomy)
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
