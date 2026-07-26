// TCGdex API client (Pokémon) — the only place that knows about tcgdex.net.
// Mirrors the tiny surface of OptcgClient. Note: the set endpoint returns only
// BRIEF cards (id, localId, name, image); full gameplay detail (hp, attacks,
// weaknesses, legalities, variants, …) requires a per-card GET /cards/{id}.
import type { TcgdexSetResume, TcgdexSetFull, TcgdexCard } from '../types.ts'

const BASE_URL = 'https://api.tcgdex.net/v2/en'

interface HttpOptions { retries?: number; timeoutMs?: number }

async function getJson<T>(url: string, opts: HttpOptions = {}): Promise<T> {
  const retries = opts.retries ?? 3
  const timeoutMs = opts.timeoutMs ?? 30000
  let lastErr: unknown
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetch(url, {
        headers: { Accept: 'application/json', 'User-Agent': 'NORDVIK-Importer/1.0' },
        signal: controller.signal,
      })
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
      return (await res.json()) as T
    } catch (err) {
      lastErr = err
      if (attempt < retries) await new Promise((r) => setTimeout(r, 500 * 2 ** attempt))
    } finally {
      clearTimeout(timer)
    }
  }
  throw new Error(`Failed after ${retries + 1} attempts: ${url} — ${String(lastErr)}`)
}

/** Run tasks with bounded concurrency (TCGdex is CDN-backed, but be polite). */
async function pool<I, O>(items: I[], limit: number, fn: (item: I) => Promise<O>): Promise<O[]> {
  const out: O[] = new Array(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = next++
      if (i >= items.length) break
      out[i] = await fn(items[i])
    }
  })
  await Promise.all(workers)
  return out
}

export class TcgdexClient {
  private readonly baseUrl: string
  private readonly concurrency: number
  constructor(baseUrl: string = BASE_URL, concurrency = 8) {
    this.baseUrl = baseUrl
    this.concurrency = concurrency
  }

  /** GET /sets → every set (brief: id, name, logo, symbol, cardCount). */
  async getAllSets(): Promise<TcgdexSetResume[]> {
    const data = await getJson<TcgdexSetResume[]>(`${this.baseUrl}/sets`)
    if (!Array.isArray(data)) throw new Error('getAllSets: expected an array')
    return data
  }

  /** GET /sets/{id} → the set with its BRIEF card list. */
  async getSet(setId: string): Promise<TcgdexSetFull> {
    return getJson<TcgdexSetFull>(`${this.baseUrl}/sets/${encodeURIComponent(setId)}`)
  }

  /** GET /cards/{id} → one card's FULL detail. */
  async getCard(cardId: string): Promise<TcgdexCard> {
    return getJson<TcgdexCard>(`${this.baseUrl}/cards/${encodeURIComponent(cardId)}`)
  }

  /**
   * Fetch every card in a set with full detail: one /sets call for the brief
   * list, then a bounded-concurrency fan-out of /cards/{id}. Individual card
   * failures are skipped (logged by the caller via the returned nulls filter).
   */
  async getSetCardsFull(setId: string): Promise<{ set: TcgdexSetFull; cards: TcgdexCard[] }> {
    const set = await this.getSet(setId)
    const briefs = Array.isArray(set.cards) ? set.cards : []
    const results = await pool(briefs, this.concurrency, async (b) => {
      try { return await this.getCard(b.id) } catch { return null }
    })
    const cards = results.filter((c): c is TcgdexCard => c != null)
    return { set, cards }
  }
}
