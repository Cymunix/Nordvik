// CLI entry for the NORDVIK One Piece importer.
//
//   node --env-file=.env importer/run.ts [flags]
//
// Flags:
//   --dry-run           map + validate only; no DB writes (works with the anon key)
//   --set OP-16         import only these set ids (comma-separated / repeatable)
//   --json-out file     write the DB-ready mapped cards to a JSON file
//   --check-images      live HEAD-check every image URL (slow)
//   --verbose | -v      per-set logging
//
// Env:
//   SUPABASE_URL (or VITE_SUPABASE_URL)
//   SUPABASE_SERVICE_ROLE_KEY   ← required for real writes (bypasses RLS)
//   VITE_SUPABASE_ANON_KEY      ← enough for --dry-run
import { Logger, formatReport } from './services/logger.ts'
import { SupabaseSync } from './services/syncService.ts'
import { runOnePieceImport, type ImportOptions } from './importers/onePieceImporter.ts'
import { runPokemonImport } from './importers/pokemonImporter.ts'

function parseArgs(argv: string[]): ImportOptions {
  const o: ImportOptions = { game: 'one-piece', dryRun: false, setFilter: null, checkImages: false, jsonOut: null, verbose: false }
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    if (a === '--dry-run') o.dryRun = true
    else if (a === '--check-images') o.checkImages = true
    else if (a === '--verbose' || a === '-v') o.verbose = true
    else if (a === '--game') o.game = normGame(argv[++i])
    else if (a.startsWith('--game=')) o.game = normGame(a.slice(7))
    else if (a === '--set') o.setFilter = (o.setFilter || []).concat((argv[++i] || '').split(','))
    else if (a.startsWith('--set=')) o.setFilter = (o.setFilter || []).concat(a.slice(6).split(','))
    else if (a === '--json-out') o.jsonOut = argv[++i] || null
    else if (a.startsWith('--json-out=')) o.jsonOut = a.slice(11)
  }
  if (o.setFilter) o.setFilter = o.setFilter.map((s) => s.trim()).filter(Boolean)
  return o
}

function normGame(v: string | undefined): ImportOptions['game'] {
  const g = (v || '').trim().toLowerCase()
  if (g === 'pokemon' || g === 'pokémon' || g === 'pkmn') return 'pokemon'
  if (g === 'one-piece' || g === 'onepiece' || g === 'op') return 'one-piece'
  throw new Error(`Unknown --game "${v}". Use "one-piece" or "pokemon".`)
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2))
  const log = new Logger(opts.verbose)

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || ''

  let sync: SupabaseSync | null = null
  if (!opts.dryRun) {
    if (!url) { log.error('Missing SUPABASE_URL / VITE_SUPABASE_URL in the environment.'); process.exit(1) }
    const key = serviceKey || anonKey
    if (!key) { log.error('Missing a Supabase key. Set SUPABASE_SERVICE_ROLE_KEY to write.'); process.exit(1) }
    if (!serviceKey) {
      log.warn('No SUPABASE_SERVICE_ROLE_KEY set — using the anon key. RLS will likely block inserts; use the service_role key for real imports.')
    }
    sync = new SupabaseSync(url, key, true, log)
  }

  try {
    log.info(`Game: ${opts.game}`)
    const report = opts.game === 'pokemon'
      ? await runPokemonImport(sync, log, opts)
      : await runOnePieceImport(sync, log, opts)
    console.log('\n' + formatReport(report))
    const errs = report.validationIssues.filter((i) => i.severity === 'error')
    if (errs.length) {
      console.log(`\nValidation errors (${errs.length}; first 20 shown):`)
      for (const e of errs.slice(0, 20)) console.log(`  [${e.cardNumber || e.sourceId}] ${e.field}: ${e.message}`)
    }
    process.exit(0)
  } catch (err) {
    log.error(`Import aborted: ${err instanceof Error ? err.stack || err.message : String(err)}`)
    process.exit(1)
  }
}

main()
