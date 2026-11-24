// Angaben eines Buchs bearbeiten: Titel, Autor/in, Serie, Band, Cover.
// Geändert wird nur der Eintrag in Lesezeit – die EPUB-/M4B-Datei bleibt, wie sie ist.
import { getBook, putBook, putCover } from '../db/db.js'
import { makeThumbnail } from './importer.js'
import { scheduleSync } from './sync/sync.js'

export const META_FIELDS = ['title', 'author', 'series', 'seriesIndex']

// "3", "3,5" oder "2.1" → als Text speichern, Komma zu Punkt
const cleanIndex = v => String(v ?? '').trim().replace(',', '.')

export function cleanMeta(fields) {
  return {
    title: String(fields.title ?? '').trim(),
    author: String(fields.author ?? '').trim(),
    series: String(fields.series ?? '').trim(),
    seriesIndex: fields.series?.trim() ? cleanIndex(fields.seriesIndex) : '',
  }
}

// Speichert geänderte Angaben (und optional ein neues Cover-Bild).
export async function saveBookMeta(bookId, fields, coverFile) {
  const book = await getBook(bookId)
  if (!book) return null
  const meta = cleanMeta(fields)
  if (!meta.title) meta.title = book.title
  const changed = META_FIELDS.some(k => (book[k] ?? '') !== meta[k])
  const now = Date.now()
  const next = { ...book }
  if (changed) Object.assign(next, meta, { metaEditedAt: now })
  if (coverFile) {
    // Klein halten: wird auch für den Geräte-Abgleich verwendet
    const thumb = await makeThumbnail(coverFile, 600)
    await putCover(bookId, thumb)
    next.coverEditedAt = now
  }
  if (changed || coverFile) {
    await putBook(next)
    scheduleSync(2000)
  }
  return next
}

// Für Sortierung und Gruppen: Band als Zahl (unbekannt → ganz hinten)
export const seriesNumber = b => {
  const n = parseFloat(b.seriesIndex)
  return Number.isFinite(n) ? n : Infinity
}

// Band für die Anzeige: "2.5" → "Band 2,5"
export const bandLabel = b => b.seriesIndex ? `Band ${String(b.seriesIndex).replace('.', ',')}` : ''

// "Serie · Band 3" (ohne Serie: "")
export const seriesLabel = b => b.series
  ? `${b.series}${b.seriesIndex ? ` · ${bandLabel(b)}` : ''}`
  : ''
