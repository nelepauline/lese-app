// Liest Titel, Autor, Cover und weitere Infos aus einer EPUB-Datei (mit foliate-js).
import { makeBook } from '../../vendor/foliate-js/view.js'

// foliate-js liefert Texte manchmal als { de: '...', en: '...' }
export const langString = x => {
  if (!x) return ''
  if (typeof x === 'string') return x
  return x[Object.keys(x)[0]] ?? ''
}

const contributorName = c => typeof c === 'string' ? c : langString(c?.name)

export const formatAuthor = author => Array.isArray(author)
  ? author.map(contributorName).filter(Boolean).join(', ')
  : contributorName(author)

export async function isZip(file) {
  const b = new Uint8Array(await file.slice(0, 4).arrayBuffer())
  return b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04
}

export async function readEpubInfo(file) {
  const book = await makeBook(file)
  const cover = await Promise.resolve(book.getCover?.()).catch(() => null)
  return {
    title: langString(book.metadata?.title) || file.name.replace(/\.epub$/i, ''),
    author: formatAuthor(book.metadata?.author),
    language: book.metadata?.language ?? '',
    // Vorbereitung Etappe 1: EPUB 3 mit Media Overlays (z. B. von Storyteller)
    hasMediaOverlay: book.sections?.some(s => s.mediaOverlay) ?? false,
    cover: cover ?? null,
  }
}
