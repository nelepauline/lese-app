// Importiert Dateien aus der Dateiauswahl in die lokale Bibliothek.
// Cloud-Bücher (services/cloud) nutzen analyzeFile() nach dem Herunterladen.
import { addBook, listBooks, newId, requestPersistentStorage } from '../db/db.js'
import { isZip, readEpubInfo } from '../formats/epub/epubInfo.js'
import { isMp4, readAudiobookInfo } from '../formats/m4b/mp4.js'
import { fingerprint } from './sync/fingerprint.js'

// Verkleinert das Cover, damit die Bibliothek schnell lädt.
async function makeThumbnail(blob, maxHeight = 600) {
  if (!blob) return null
  try {
    const bmp = await createImageBitmap(blob)
    const scale = Math.min(1, maxHeight / bmp.height)
    if (scale === 1 && blob.size < 300_000) return blob
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bmp.width * scale)
    canvas.height = Math.round(bmp.height * scale)
    canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height)
    return await new Promise(res => canvas.toBlob(b => res(b ?? blob), 'image/jpeg', 0.85))
  } catch {
    return blob
  }
}

export async function detectType(file) {
  if (await isZip(file)) return 'epub'
  if (await isMp4(file)) return 'audiobook'
  return null
}

// Liest Typ, Titel, Autor, Kapitel und Cover aus einer Datei.
export async function analyzeFile(file) {
  const type = await detectType(file)
  if (!type) throw new Error(`„${file.name}“ ist weder EPUB noch M4B.`)
  const info = type === 'epub' ? await readEpubInfo(file) : await readAudiobookInfo(file)
  const { cover, ...meta } = info
  // Als Blob mit passendem Typ speichern (wichtig für die Wiedergabe in Safari)
  const mime = type === 'epub' ? 'application/epub+zip' : 'audio/mp4'
  return {
    type, meta,
    blob: new Blob([file], { type: mime }),
    cover: await makeThumbnail(cover),
    syncKey: await fingerprint(file), // erkennt das Buch auf anderen Geräten wieder
  }
}

/**
 * Importiert eine Datei. Gibt das neue Buch zurück oder wirft einen Fehler.
 */
export async function importFile(file) {
  const existing = await listBooks()
  const dup = existing.find(b => b.fileName === file.name && b.size === file.size)
  if (dup) return { book: dup, duplicate: true }

  const { type, meta, blob, cover, syncKey } = await analyzeFile(file)
  const book = {
    id: newId(),
    type,
    ...meta,
    fileName: file.name,
    size: file.size,
    syncKey,
    source: 'local',
    fileStored: true,
    addedAt: Date.now(),
    lastOpenedAt: 0,
  }
  await addBook(book, blob, cover)
  requestPersistentStorage()
  return { book, duplicate: false }
}
