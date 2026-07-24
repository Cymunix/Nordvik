// OPTCG API client — the only place that knows about optcgapi.com.
// A new TCG gets its own client with the same tiny surface (list sets, get a set).
import type { OptcgSet, OptcgCard } from '../types.ts'

const BASE_URL = 'https://optcgapi.com/api'

interface HttpOptions {
  retries?: number
  timeoutMs?: number
}

/** GET JSON with a timeout and bounded exponential-backoff retries. */
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
      if (attempt < retries) {
        const backoff = 500 * 2 ** attempt
        await new Promise((r) => setTimeout(r, backoff))
      }
    } finally {
      clearTimeout(timer)
    }
  }
  throw new Error(`Failed after ${retries + 1} attempts: ${url} — ${String(lastErr)}`)
}

export class OptcgClient {
  private readonly baseUrl: string
  constructor(baseUrl: string = BASE_URL) {
    this.baseUrl = baseUrl
  }

  /** GET /api/allSets/ → every published set. */
  async getAllSets(): Promise<OptcgSet[]> {
    const data = await getJson<OptcgSet[]>(`${this.baseUrl}/allSets/`)
    if (!Array.isArray(data)) throw new Error('allSets: expected an array')
    return data
  }

  /** GET /api/sets/{set_id}/ → every card (incl. every printing) in a set. */
  async getSet(setId: string): Promise<OptcgCard[]> {
    const data = await getJson<OptcgCard[]>(`${this.baseUrl}/sets/${encodeURIComponent(setId)}/`)
    if (!Array.isArray(data)) throw new Error(`set ${setId}: expected an array`)
    return data
  }
}
