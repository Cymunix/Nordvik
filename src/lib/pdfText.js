import * as pdfjsLib from 'pdfjs-dist'
// Vite's ?worker import gives a real Worker constructor — the most reliable way
// to wire pdf.js's worker (a bare ?url workerSrc can fail to load and then
// extraction hangs silently).
import PdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?worker'

pdfjsLib.GlobalWorkerOptions.workerPort = new PdfjsWorker()

// Extract a PDF into text LINES, reconstructed from item positions. Items on
// the same y are one line; a wide x-gap between items becomes a double space so
// that a table's columns can be recovered downstream.
export async function extractPdfLines(arrayBuffer) {
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise
  const lines = []
  for (let p = 1; p <= pdf.numPages; p += 1) {
    const page = await pdf.getPage(p)
    const content = await page.getTextContent()
    const byRow = new Map()
    for (const item of content.items) {
      const str = item.str
      if (!str || !str.trim()) continue
      const y = Math.round(item.transform[5])
      const x = item.transform[4]
      const width = item.width || str.length * 4
      if (!byRow.has(y)) byRow.set(y, [])
      byRow.get(y).push({ x, end: x + width, str })
    }
    const ys = [...byRow.keys()].sort((a, b) => b - a) // top → bottom
    for (const y of ys) {
      const parts = byRow.get(y).sort((a, b) => a.x - b.x)
      let line = ''
      let prevEnd = null
      for (const part of parts) {
        if (prevEnd != null) line += (part.x - prevEnd > 14) ? '  ' : (/\s$/.test(line) ? '' : ' ')
        line += part.str
        prevEnd = part.end
      }
      const trimmed = line.replace(/\s+$/g, '')
      if (trimmed.trim()) lines.push(trimmed)
    }
  }
  return lines
}

const csvCell = (v) => {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

// Turn extracted PDF lines into CSV the bulk importer already understands.
// - If the content looks like a table (most lines split into ≥2 columns by a
//   wide gap), keep the first line as the header and each following line a row.
// - Otherwise treat it as a LIST: one item per line, pulling a #card-number and
//   a 4-digit year out of the line, the remainder being the name/subject.
export function pdfLinesToCsv(lines, isCard) {
  const cleaned = lines.map((l) => l.trim()).filter(Boolean)
  const split = cleaned.map((l) => l.split(/\s{2,}/).map((s) => s.trim()).filter(Boolean))
  const multiCol = split.filter((cols) => cols.length >= 2).length
  const looksTable = cleaned.length >= 2 && multiCol >= Math.max(2, Math.ceil(cleaned.length * 0.6))

  if (looksTable) {
    return split.map((cols) => cols.map(csvCell).join(',')).join('\n')
  }

  const nameHeader = isCard ? 'subject_name' : 'item_name'
  const out = [[nameHeader, 'card_number', 'release_year'].join(',')]
  for (const raw of cleaned) {
    const yearMatch = raw.match(/\b(?:19|20)\d{2}\b/)
    const numMatch = raw.match(/#\s*([A-Za-z0-9][A-Za-z0-9/-]*)/)
    let name = raw
    if (numMatch) name = name.replace(numMatch[0], ' ')
    if (yearMatch) name = name.replace(yearMatch[0], ' ')
    name = name.replace(/\s{2,}/g, ' ').replace(/[·|,-]\s*$/, '').trim()
    if (!name) continue
    out.push([csvCell(name), csvCell(numMatch ? numMatch[1] : ''), csvCell(yearMatch ? yearMatch[0] : '')].join(','))
  }
  return out.join('\n')
}
