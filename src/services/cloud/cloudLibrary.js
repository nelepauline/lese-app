// OneDrive-Ordner als Bibliothek (Etappe 2).
// Alle EPUB/M4B-Dateien im gewählten Ordner erscheinen in der Bibliothek –
// zunächst nur als Eintrag (fileStored: false). Ein Tipp lädt das Buch aufs
// Gerät; "Download entfernen" löscht nur die lokale Kopie.
import { useSyncExternalStore } from 'react'
import { listBooks, putBook, deleteBook, storeDownload, removeDownload as dbRemoveDownload, newId, requestPersistentStorage } from '../../db/db.js'
import { analyzeFile } from '../importer.js'
import * as od from './onedrive.js'

const FOLDER_KEY = 'lese-app:onedrive-folder'   // { id, name, path }
const ACCOUNT_KEY = 'lese-app:onedrive-account'  // Anzeigename

const load = key => { try { return JSON.parse(localStorage.getItem(key)) } catch { return null } }
const save = (key, v) => { try { v == null ? localStorage.removeItem(key) : localStorage.setItem(key, JSON.stringify(v)) } catch { /* egal */ } }

// ---- Zustand für die Oberfläche ----
let state = {
  configured: od.isConfigured(),
  signedIn: od.hasSession(),
  account: load(ACCOUNT_KEY),
  folder: load(FOLDER_KEY),
  refreshing: false,
  lastRefresh: 0,
  error: null,
  version: 0,          // zählt hoch, wenn sich die Bibliothek geändert hat
  downloads: {},       // bookId → Fortschritt 0..1
}
const listeners = new Set()
function setState(patch) {
  state = { ...state, ...patch }
  listeners.forEach(l => l())
}
const subscribe = cb => { listeners.add(cb); return () => listeners.delete(cb) }
export const useCloudState = () => useSyncExternalStore(subscribe, () => state)
const bump = () => setState({ version: state.version + 1 })

function handleError(err) {
  if (err.code === 'login') setState({ signedIn: false })
  setState({ error: err.message || String(err) })
  throw err
}

// ---- Anmeldung ----
export const signIn = () => od.signIn().catch(handleError)

export async function signOut() {
  od.signOut()
  save(ACCOUNT_KEY, null)
  setState({ signedIn: false, account: null, error: null })
}

// Beim Start: Rückkehr von der Microsoft-Anmeldeseite verarbeiten
export async function initCloud() {
  try {
    if (await od.handleRedirect()) {
      const account = await od.me().catch(() => null)
      save(ACCOUNT_KEY, account)
      setState({ signedIn: true, account, error: null, justSignedIn: true })
    }
  } catch (err) {
    setState({ error: err.message || String(err) })
  }
  if (state.folder && od.hasSession()) refreshLibrary().catch(() => {})
}

// ---- Ordner wählen ----
export const listFolder = id => od.listChildren(id).catch(handleError)

export async function chooseFolder(folder) {
  save(FOLDER_KEY, folder)
  setState({ folder, error: null })
  await refreshLibrary()
}

export async function forgetFolder() {
  save(FOLDER_KEY, null)
  // nicht heruntergeladene Cloud-Einträge entfernen, heruntergeladene behalten
  for (const b of await listBooks()) {
    if (b.source !== 'onedrive') continue
    if (b.fileStored) await putBook({ ...b, source: 'local' })
    else await deleteBook(b.id)
  }
  setState({ folder: null })
  bump()
}

// ---- Ordner mit der Bibliothek abgleichen ----
const titleFromName = name => name.replace(od.BOOK_EXT, '').replace(/[_]+/g, ' ').trim()

let refreshing = null
export function refreshLibrary() {
  refreshing ??= doRefresh().finally(() => { refreshing = null })
  return refreshing
}

async function doRefresh() {
  const folder = state.folder
  if (!folder) return
  setState({ refreshing: true, error: null })
  try {
    const files = await od.listBooksInFolder(folder.id)
    const books = await listBooks()
    const seen = new Set()
    for (const f of files) {
      seen.add(f.id)
      const remote = { provider: 'onedrive', itemId: f.id, name: f.name, size: f.size, modified: f.lastModifiedDateTime }
      const known = books.find(b => b.remote?.itemId === f.id)
        ?? books.find(b => !b.remote && b.fileName === f.name && b.size === f.size) // schon lokal importiert
      if (known) {
        if (known.remote?.size !== f.size || known.remote?.name !== f.name || known.source !== 'onedrive')
          await putBook({ ...known, source: 'onedrive', remote })
        continue
      }
      await putBook({
        id: newId(),
        type: /\.epub$/i.test(f.name) ? 'epub' : 'audiobook',
        title: titleFromName(f.name),
        author: '',
        fileName: f.name,
        size: f.size,
        source: 'onedrive',
        fileStored: false,
        remote,
        addedAt: Date.now(),
        lastOpenedAt: 0,
      })
    }
    // Aus dem Ordner verschwunden: Einträge ohne Download entfernen,
    // heruntergeladene Bücher bleiben als lokale Bücher erhalten.
    for (const b of books) {
      if (b.source !== 'onedrive' || seen.has(b.remote?.itemId)) continue
      if (b.fileStored) await putBook({ ...b, source: 'local', remote: undefined })
      else await deleteBook(b.id)
    }
    setState({ refreshing: false, lastRefresh: Date.now(), signedIn: true })
    bump()
  } catch (err) {
    setState({ refreshing: false })
    handleError(err)
  }
}

// ---- Herunterladen / Download entfernen ----
export async function download(book) {
  if (state.downloads[book.id] != null) return
  setState({ downloads: { ...state.downloads, [book.id]: 0 } })
  const progress = p => setState({ downloads: { ...state.downloads, [book.id]: p } })
  try {
    const blob = await od.downloadFile(book.remote.itemId, progress)
    const file = new File([blob], book.fileName)
    const { type, meta, blob: stored, cover, syncKey } = await analyzeFile(file)
    await storeDownload({ ...book, type, ...meta, size: file.size, syncKey, fileStored: true }, stored, cover)
    requestPersistentStorage()
    bump()
  } catch (err) {
    handleError(err)
  } finally {
    const { [book.id]: _, ...rest } = state.downloads
    setState({ downloads: rest })
  }
}

export async function removeDownload(book) {
  await dbRemoveDownload(book.id)
  bump()
}

export const clearError = () => setState({ error: null })
