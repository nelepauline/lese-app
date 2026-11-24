// Datensicherung: alles außer den Buchdateien in eine Datei – z. B. bevor man
// die App neu zum Home-Bildschirm hinzufügt (dabei löscht iOS ihre Daten).
//
// Enthalten: Bücher (Angaben), Cover, Positionen, Lesezeichen, Markierungen,
// eigene Bilder, Statistik, Farbschema und andere Einstellungen.
// NICHT enthalten: die EPUB-/M4B-Dateien und Zugangsschlüssel (GitHub,
// Hardcover, Dropbox) – die Datei könnte ja in einer Cloud landen.
import { dumpStore, putRaw, getBook, listBooks, getProgress } from '../db/db.js'

const STORAGE_KEYS = [
  'lese-app:settings', 'lese-app:highlight-cats',
  'lese-app:stats', 'lese-app:stats-remote', 'lese-app:stats-goal',
  'lese-app:device', 'lese-app:hc-options', 'lese-app:hc-user',
  'lib-view', 'lib-sort',
]

const blobToDataUrl = blob => new Promise((res, rej) => {
  const r = new FileReader()
  r.onload = () => res(r.result)
  r.onerror = () => rej(r.error)
  r.readAsDataURL(blob)
})
const dataUrlToBlob = async url => (await fetch(url)).blob()

export async function createBackup() {
  const [books, covers, progress, bookmarks, highlights, images] = await Promise.all(
    ['books', 'covers', 'progress', 'bookmarks', 'highlights', 'images'].map(dumpStore))
  const data = {
    app: 'lesezeit', kind: 'backup', version: 1, createdAt: Date.now(),
    books: books.map(([, b]) => b),
    covers: Object.fromEntries(await Promise.all(covers.filter(([, b]) => b).map(async ([id, b]) => [id, await blobToDataUrl(b)]))),
    progress: Object.fromEntries(progress),
    bookmarks: bookmarks.map(([, b]) => b),
    highlights: highlights.map(([, h]) => h),
    images: await Promise.all(images.map(async ([, img]) => ({ ...img, blob: await blobToDataUrl(img.blob) }))),
    storage: Object.fromEntries(STORAGE_KEYS.map(k => [k, localStorage.getItem(k)]).filter(([, v]) => v != null)),
  }
  const json = JSON.stringify(data)
  const date = new Date().toISOString().slice(0, 10)
  return {
    file: new File([json], `Lesezeit-Sicherung-${date}.json`, { type: 'application/json' }),
    counts: { books: data.books.length, highlights: data.highlights.length, images: data.images.length, bookmarks: data.bookmarks.length },
  }
}

// Datei speichern: auf iPhone/iPad über das Teilen-Menü ("In Dateien sichern"),
// sonst als normaler Download
export async function saveFile(file) {
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: file.name }); return 'shared' }
    catch (err) { if (err?.name === 'AbortError') return 'aborted' }
  }
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url; a.download = file.name
  document.body.append(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
  return 'downloaded'
}

export async function readBackup(file) {
  let data
  try { data = JSON.parse(await file.text()) } catch { throw new Error('Das ist keine Lesezeit-Sicherung (Datei unlesbar).') }
  if (data?.app !== 'lesezeit' || data.kind !== 'backup') throw new Error('Das ist keine Lesezeit-Sicherung.')
  if (data.version > 1) throw new Error('Diese Sicherung stammt aus einer neueren App-Version.')
  return data
}

// Wiederherstellen: ergänzt bzw. aktualisiert, löscht nichts.
// Bücher, die hier schon mit Datei liegen, behalten ihre Datei.
export async function restoreBackup(data) {
  const local = await listBooks()
  const idMap = new Map() // Buch-ID in der Sicherung → Buch-ID hier
  let added = 0, merged = 0

  for (const b of data.books ?? []) {
    // dasselbe Buch schon da? (gleiche ID oder gleicher Datei-Fingerabdruck)
    const existing = (await getBook(b.id)) ?? local.find(l => b.syncKey && l.syncKey === b.syncKey)
    if (existing) {
      idMap.set(b.id, existing.id)
      await putRaw('books', { ...b, id: existing.id, fileStored: existing.fileStored, source: existing.source, remote: existing.remote, fileName: existing.fileName ?? b.fileName, size: existing.size ?? b.size })
      merged++
    } else {
      idMap.set(b.id, b.id)
      // ohne Datei: erscheint in der Bibliothek mit "Datei fehlt"
      await putRaw('books', { ...b, fileStored: false, source: 'local', remote: undefined })
      added++
    }
  }
  const mapId = id => idMap.get(id) ?? id

  for (const [id, url] of Object.entries(data.covers ?? {})) await putRaw('covers', await dataUrlToBlob(url), mapId(id))
  for (const [id, p] of Object.entries(data.progress ?? {})) {
    const cur = await getProgress(mapId(id))
    if (!cur || (p.updatedAt ?? 0) > (cur.updatedAt ?? 0)) await putRaw('progress', p, mapId(id))
  }
  for (const bm of data.bookmarks ?? []) await putRaw('bookmarks', { ...bm, bookId: mapId(bm.bookId) })
  for (const h of data.highlights ?? []) await putRaw('highlights', { ...h, bookId: mapId(h.bookId) })
  for (const img of data.images ?? []) await putRaw('images', { ...img, bookId: mapId(img.bookId), blob: await dataUrlToBlob(img.blob) })
  for (const [k, v] of Object.entries(data.storage ?? {})) { try { localStorage.setItem(k, v) } catch { /* egal */ } }

  return { added, merged, highlights: data.highlights?.length ?? 0 }
}
