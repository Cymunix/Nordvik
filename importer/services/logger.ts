// Minimal structured logger + final-report formatter. Kept separate so the
// import pipeline never hard-codes console formatting.
import type { SyncReport } from '../types.ts'

type Level = 'debug' | 'info' | 'warn' | 'error'

export class Logger {
  private readonly verbose: boolean
  constructor(verbose = false) {
    this.verbose = verbose
  }
  private emit(level: Level, msg: string): void {
    if (level === 'debug' && !this.verbose) return
    const ts = new Date().toISOString().slice(11, 19)
    const tag = level.toUpperCase().padEnd(5)
    const line = `[${ts}] ${tag} ${msg}`
    if (level === 'error') console.error(line)
    else if (level === 'warn') console.warn(line)
    else console.log(line)
  }
  debug(msg: string): void { this.emit('debug', msg) }
  info(msg: string): void { this.emit('info', msg) }
  warn(msg: string): void { this.emit('warn', msg) }
  error(msg: string): void { this.emit('error', msg) }
}

/** Render the run summary in the report format from the spec. */
export function formatReport(report: SyncReport): string {
  const errors = report.validationIssues.filter((i) => i.severity === 'error').length
  const warnings = report.validationIssues.filter((i) => i.severity === 'warning').length
  const seconds = (report.durationMs / 1000).toFixed(1)
  const lines = [
    '──────────────  NORDVIK Import Report  ──────────────',
    `Imported Sets:     ${report.importedSets}`,
    `Cards Imported:    ${report.cardsImported}`,
    `Cards Updated:     ${report.cardsUpdated}`,
    `Cards Skipped:     ${report.cardsSkipped}`,
    `Validation Errors: ${errors}${warnings ? ` (+${warnings} warnings)` : ''}`,
    `Duration:          ${seconds} seconds`,
  ]
  if (report.failedSets.length) lines.push(`Failed Sets:       ${report.failedSets.join(', ')}`)
  lines.push('─────────────────────────────────────────────────────')
  return lines.join('\n')
}
