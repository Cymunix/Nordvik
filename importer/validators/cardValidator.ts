// Game-agnostic validation of mapped NordvikCards. Operates purely on the neutral
// shape, so it's shared by every TCG mapper.
import type { NordvikCard, ValidationIssue } from '../types.ts'

function issue(
  card: NordvikCard,
  field: string,
  message: string,
  severity: 'error' | 'warning' = 'error',
): ValidationIssue {
  return { sourceId: card.sourceId, cardNumber: card.cardNumber, field, severity, message }
}

/**
 * Structural validation of one card. Returns every problem found (never throws),
 * so the importer can report them and keep going.
 */
export function validateCard(card: NordvikCard, validItemTypes?: readonly string[]): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  // Per-game vocabulary — the mapper supplies its own recognised item types, so
  // this stays game-agnostic. When none are supplied, the check is skipped.
  const validTypes = validItemTypes && validItemTypes.length
    ? new Set(validItemTypes.map((t) => t.toLowerCase()))
    : null

  if (!card.sourceId) issues.push(issue(card, 'sourceId', 'Missing unique printing id (card_image_id)'))
  if (!card.cardNumber) issues.push(issue(card, 'cardNumber', 'Missing card number (card_set_id)'))
  else if (!/^[A-Za-z0-9][A-Za-z0-9-]*$/.test(card.cardNumber)) {
    issues.push(issue(card, 'cardNumber', `Invalid card number "${card.cardNumber}"`))
  }
  if (!card.subjectName.trim()) issues.push(issue(card, 'subjectName', 'Empty card name'))
  if (!card.property.trim()) issues.push(issue(card, 'property', 'Missing set / property (invalid set reference)'))

  if (validTypes && card.itemType && !validTypes.has(card.itemType.toLowerCase())) {
    // Warning, not error: the game occasionally adds a new type — import it, flag it.
    issues.push(issue(card, 'itemType', `Unrecognised card type "${card.itemType}"`, 'warning'))
  }

  if (!card.imageUrl) {
    issues.push(issue(card, 'imageUrl', 'Missing image URL', 'warning'))
  } else if (!isPlausibleImageUrl(card.imageUrl)) {
    issues.push(issue(card, 'imageUrl', `Image URL is not a valid http(s) image: ${card.imageUrl}`, 'warning'))
  }

  return issues
}

function isPlausibleImageUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return (u.protocol === 'http:' || u.protocol === 'https:') && /\.(jpe?g|png|webp|gif|avif)$/i.test(u.pathname)
  } catch {
    return false
  }
}

/**
 * Optional LIVE image check (HEAD request). Off by default — HEAD-ing thousands of
 * images is slow — enable with --check-images. Returns broken-image issues.
 */
export async function checkImagesLive(cards: NordvikCard[], concurrency = 8): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = []
  const queue = cards.filter((c) => c.imageUrl)
  let idx = 0
  async function worker(): Promise<void> {
    while (idx < queue.length) {
      const card = queue[idx++]
      try {
        const res = await fetch(card.imageUrl, { method: 'HEAD' })
        if (!res.ok) issues.push(issue(card, 'imageUrl', `Broken image (HTTP ${res.status})`, 'warning'))
      } catch {
        issues.push(issue(card, 'imageUrl', 'Broken image (request failed)', 'warning'))
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker))
  return issues
}
