// Lokaler Speicher (IndexedDB) – hier liegen Bücher, Cover, Fortschritt und Lesezeichen.
// Alles bleibt auf dem Gerät und funktioniert offline.
import { openDB } from 'idb'

const DB_NAME = 'lese-app'
const DB_VERSION = 2

/*
  Tabellen ("Stores"):
  - books:     Metadaten je Buch  { id, type, title, author, ... }
  - files:     die eigentliche Datei (EPUB/M4B) als Blob, Schlüssel = book.id
  - covers:    Coverbild als Blob, Schlüssel = book.id
  - progress:  Lese-/Hörstand, Schlüssel = book.id
  - bookmarks: Lesezeichen { id, bookId, cfi, label, excerpt, fraction, createdAt }
  - highlights: Markierungen { id, bookId, cfi, text, chapter, fraction, catId, reaction, note,
                createdAt, updatedAt }                                          (ab Version 2)
  - images:    eigene Bilder zum Buch, z. B. Karten { id, bookId, name, blob, createdAt, updatedAt }

  Buch-Typen:
  - 'epub'       normales E-Book
  - 'audiobook'  M4B-Hörbuch
  (später: EPUBs mit Media Overlays werden als 'epub' mit hasMediaOverlay=true geführt)

  Herkunft (source):
  - 'local'      über die Dateiauswahl importiert
  - 'dropbox'    aus dem verbundenen Cloud-Ordner; remote = { provider, itemId, name, size }.
                 Ohne Download ist fileStored=false (nur Eintrag, keine Datei).
*/

let dbPromise
function db() {
  dbPromise ??= openDB(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        db.createObjectStore('books', { keyPath: 'id' })
        db.createObjectStore('files')
        db.createObjectStore('covers')
        db.createObjectStore('progress')
        const bm = db.createObjectStore('bookmarks', { keyPath: 'id' })
        bm.createIndex('bookId', 'bookId')
      }
      if (oldVersion < 2) {
        db.createObjectStore('highlights', { keyPath: 'id' }).createIndex('bookId', 'bookId')
        db.createObjectStore('images', { keyPath: 'id' }).createIndex('bookId', 'bookId')
      }
    },
  })
  return dbPromise
}

export const newId = () =>
  (crypto.randomUUID?.() ?? Date.now().toString(36) + Math.random().toString(36).slice(2))

// ---- Bücher ----
export async function listBooks() {
  return (await db()).getAll('books')
}
export async function getBook(id) {
  return (await db()).get('books', id)
}
export async function putBook(book) {
  return (await db()).put('books', book)
}
export async function updateBook(id, changes) {
  const d = await db()
  const book = await d.get('books', id)
  if (book) await d.put('books', { ...book, ...changes })
}

export async function addBook(book, file, cover) {
  const d = await db()
  const tx = d.transaction(['books', 'files', 'covers'], 'readwrite')
  tx.objectStore('books').put(book)
  if (file) tx.objectStore('files').put(file, book.id)
  if (cover) tx.objectStore('covers').put(cover, book.id)
  await tx.done
}

export async function deleteBook(id) {
  const d = await db()
  const bms = await d.getAllKeysFromIndex('bookmarks', 'bookId', id)
  const hls = await d.getAllKeysFromIndex('highlights', 'bookId', id)
  const imgs = await d.getAllKeysFromIndex('images', 'bookId', id)
  const tx = d.transaction(['books', 'files', 'covers', 'progress', 'bookmarks', 'highlights', 'images'], 'readwrite')
  tx.objectStore('books').delete(id)
  tx.objectStore('files').delete(id)
  tx.objectStore('covers').delete(id)
  tx.objectStore('progress').delete(id)
  for (const key of bms) tx.objectStore('bookmarks').delete(key)
  for (const key of hls) tx.objectStore('highlights').delete(key)
  for (const key of imgs) tx.objectStore('images').delete(key)
  await tx.done
}

// Heruntergeladenes Cloud-Buch speichern: Datei + Cover + aktualisierte Angaben
export async function storeDownload(book, file, cover) {
  const d = await db()
  const tx = d.transaction(['books', 'files', 'covers'], 'readwrite')
  tx.objectStore('books').put(book)
  tx.objectStore('files').put(file, book.id)
  if (cover) tx.objectStore('covers').put(cover, book.id)
  await tx.done
}

// Download entfernen: Datei weg, Buch (mit Cover, Fortschritt, Lesezeichen) bleibt
export async function removeDownload(id) {
  const d = await db()
  const tx = d.transaction(['books', 'files'], 'readwrite')
  const book = await tx.objectStore('books').get(id)
  tx.objectStore('files').delete(id)
  if (book) tx.objectStore('books').put({ ...book, fileStored: false })
  await tx.done
}

// ---- Dateien & Cover ----
export async function putCover(id, blob) {
  return (await db()).put('covers', blob, id)
}
export async function getFile(id) {
  return (await db()).get('files', id)
}
export async function getCover(id) {
  return (await db()).get('covers', id)
}

// ---- Fortschritt ----
export async function getProgress(id) {
  return (await db()).get('progress', id)
}
export async function putProgress(id, progress) {
  return (await db()).put('progress', progress, id)
}
export async function getAllProgress() {
  const d = await db()
  const keys = await d.getAllKeys('progress')
  const values = await d.getAll('progress')
  return Object.fromEntries(keys.map((k, i) => [k, values[i]]))
}

// ---- Lesezeichen ----
export async function listBookmarks(bookId) {
  const list = await (await db()).getAllFromIndex('bookmarks', 'bookId', bookId)
  return list.sort((a, b) => a.fraction - b.fraction)
}
export async function addBookmark(bookmark) {
  return (await db()).put('bookmarks', bookmark)
}
export async function deleteBookmark(id) {
  return (await db()).delete('bookmarks', id)
}

// ---- Markierungen ----
export async function listHighlights(bookId) {
  const list = await (await db()).getAllFromIndex('highlights', 'bookId', bookId)
  return list.sort((a, b) => (a.fraction ?? 0) - (b.fraction ?? 0))
}
export async function getHighlight(id) {
  return (await db()).get('highlights', id)
}
export async function putHighlight(h) {
  return (await db()).put('highlights', h)
}
export async function deleteHighlight(id) {
  return (await db()).delete('highlights', id)
}

// ---- Eigene Bilder ----
export async function listImages(bookId) {
  const list = await (await db()).getAllFromIndex('images', 'bookId', bookId)
  return list.sort((a, b) => a.createdAt - b.createdAt)
}
export async function putImage(img) {
  return (await db()).put('images', img)
}
export async function deleteImage(id) {
  return (await db()).delete('images', id)
}

// ---- Für die Datensicherung: ganze Tabellen lesen ----
// Liefert [[schlüssel, wert], …]
export async function dumpStore(name) {
  const d = await db()
  const [keys, values] = await Promise.all([d.getAllKeys(name), d.getAll(name)])
  return keys.map((k, i) => [k, values[i]])
}
export async function putRaw(name, value, key) {
  const d = await db()
  return key === undefined ? d.put(name, value) : d.put(name, value, key)
}

// Bittet den Browser, die Daten nicht automatisch zu löschen,
// wenn der Speicher knapp wird (wichtig für Safari).
export async function requestPersistentStorage() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted()))
      await navigator.storage.persist()
  } catch { /* nicht unterstützt – egal */ }
}
