// Erkennt dasselbe Buch auf verschiedenen Geräten.
// Jedes Gerät vergibt eigene Buch-IDs, deshalb braucht der Abgleich einen
// "Fingerabdruck" der Datei: Größe + Anfang + Ende. Bewusst in reinem
// JavaScript (nicht crypto.subtle), damit er überall gleich berechnet wird,
// auch ohne https.
import { getFile, updateBook } from '../../db/db.js'

const CHUNK = 256 * 1024

// cyrb53: kleiner, schneller Hash (kein Sicherheitszweck, nur Wiedererkennung)
function cyrb53(bytes, seed) {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed
  for (let i = 0; i < bytes.length; i++) {
    const ch = bytes[i]
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0')
}

export async function fingerprint(blob) {
  const head = new Uint8Array(await blob.slice(0, CHUNK).arrayBuffer())
  const tail = blob.size > CHUNK
    ? new Uint8Array(await blob.slice(Math.max(CHUNK, blob.size - CHUNK)).arrayBuffer())
    : new Uint8Array(0)
  const all = new Uint8Array(head.length + tail.length)
  all.set(head)
  all.set(tail, head.length)
  return `${blob.size.toString(36)}-${cyrb53(all, 1)}${cyrb53(all, 2)}`
}

// Schlüssel eines Buchs für den Abgleich (wird einmal berechnet und gemerkt)
export async function bookKey(book) {
  if (book.syncKey) return book.syncKey
  const blob = await getFile(book.id)
  if (!blob) return null
  const key = await fingerprint(blob)
  await updateBook(book.id, { syncKey: key })
  book.syncKey = key
  return key
}
