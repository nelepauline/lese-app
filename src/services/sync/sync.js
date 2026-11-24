// Abgleich zwischen Geräten (Etappe 3) über einen privaten GitHub-Gist.
//
// Was abgeglichen wird:
//  - Lese-/Hörposition je Buch: die neueste gewinnt. Ist ein anderes Gerät
//    weiter, wird beim Öffnen gefragt (checkForNewerPosition).
//  - Lesezeichen: werden zusammengeführt; gelöschte werden als "gelöscht"
//    vermerkt, damit sie nicht von einem anderen Gerät zurückkommen.
//  - Selbst bearbeitete Angaben (Titel, Autor/in, Serie, Band) und eigene
//    Cover: die neueste Änderung gewinnt. Cover liegen in einem zweiten Gist.
//
// Ablauf: gelesen wird beim Start, beim Zurückkehren in die App und beim
// Öffnen eines Buchs. Geschrieben wird gesammelt (höchstens alle 30 Sek.)
// und sofort, wenn die App in den Hintergrund geht.
import { useSyncExternalStore } from 'react'
import { listBooks, getAllProgress, listBookmarks, addBookmark, deleteBookmark, getBook, getProgress, newId, updateBook, getCover, putCover } from '../../db/db.js'
import { registerSyncTarget } from '../progress.js'
import { bookKey } from './fingerprint.js'
import * as gist from './githubGist.js'

const CONF_KEY = 'lese-app:sync'            // { token, gistId, login }
const DEVICE_KEY = 'lese-app:device'        // { id, name }
const TOMB_KEY = 'lese-app:sync-deleted'    // { lesezeichenId: zeitpunkt }
const LAST_KEY = 'lese-app:sync-last'

const load = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback } catch { return fallback } }
const save = (key, v) => { try { v == null ? localStorage.removeItem(key) : localStorage.setItem(key, JSON.stringify(v)) } catch { /* egal */ } }

// ---- Gerät ----
export function guessDeviceName() {
  const ua = navigator.userAgent
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'iPad'
  if (/iPhone/.test(ua)) return 'iPhone'
  if (/Macintosh/.test(ua)) return 'Mac'
  return 'Gerät'
}
function device() {
  let d = load(DEVICE_KEY, null)
  if (!d?.id) { d = { id: newId(), name: guessDeviceName() }; save(DEVICE_KEY, d) }
  return d
}

// ---- Zustand für die Oberfläche ----
let conf = load(CONF_KEY, null)
let state = {
  connected: !!conf?.token,
  login: conf?.login ?? null,
  deviceName: device().name,
  syncing: false,
  lastSyncAt: load(LAST_KEY, 0),
  error: null,
  dataVersion: 0,   // zählt hoch, wenn der Abgleich Bücher auf diesem Gerät geändert hat
}
const listeners = new Set()
function setState(patch) {
  state = { ...state, ...patch }
  listeners.forEach(l => l())
}
const subscribe = cb => { listeners.add(cb); return () => listeners.delete(cb) }
export const useSyncState = () => useSyncExternalStore(subscribe, () => state)

// ---- Abgleich ----
let cache = null           // zuletzt von GitHub gelesener Stand
const held = new Set()     // Bücher, deren Position gerade nicht hochgeladen wird (Rückfrage offen)
let chain = Promise.resolve()
let timer = null, dueAt = 0

export function syncNow() {
  if (!conf?.token) return Promise.resolve(false)
  const run = chain.then(doSync)
  chain = run.catch(() => {})
  return run
}

// Abgleich vormerken. Ein bereits früher geplanter Termin bleibt bestehen.
export function scheduleSync(delay = 30_000) {
  if (!conf?.token) return
  if (document.visibilityState === 'hidden') delay = 0 // App geht in den Hintergrund → sofort
  const at = Date.now() + delay
  if (timer && dueAt <= at) return
  clearTimeout(timer)
  dueAt = at
  timer = setTimeout(() => { timer = null; syncNow().catch(() => {}) }, delay)
}

async function doSync() {
  clearTimeout(timer); timer = null
  setState({ syncing: true })
  try {
    let remote
    try {
      remote = await gist.read(conf.token, conf.gistId)
    } catch (err) {
      if (err.code !== 'notfound') throw err
      conf = { ...conf, gistId: await gist.findOrCreate(conf.token) }
      save(CONF_KEY, conf)
      remote = await gist.read(conf.token, conf.gistId)
    }
    const tombs = load(TOMB_KEY, {})
    const { changed, localChanged } = await merge(remote, tombs)
    if (changed) await gist.write(conf.token, conf.gistId, remote)
    if (localChanged) setState({ dataVersion: state.dataVersion + 1 })
    // nur die verarbeiteten Löschvermerke entfernen
    const rest = load(TOMB_KEY, {})
    for (const id of Object.keys(tombs)) delete rest[id]
    save(TOMB_KEY, rest)
    cache = remote
    const now = Date.now()
    save(LAST_KEY, now)
    setState({ syncing: false, lastSyncAt: now, error: null })
    return true
  } catch (err) {
    console.warn('Abgleich fehlgeschlagen', err)
    setState({ syncing: false, error: err.message || String(err) })
    throw err
  }
}

function samePlace(a, b) {
  if (!a || !b) return false
  if (a.position != null || b.position != null) return Math.abs((a.position ?? 0) - (b.position ?? 0)) < 1
  return a.cfi === b.cfi
}

const META = ['title', 'author', 'series', 'seriesIndex']
const pick = (obj, keys) => Object.fromEntries(keys.map(k => [k, obj?.[k] ?? '']))

const blobToDataUrl = blob => new Promise((res, rej) => {
  const r = new FileReader()
  r.onload = () => res(r.result)
  r.onerror = () => rej(r.error)
  r.readAsDataURL(blob)
})
const dataUrlToBlob = async url => (await fetch(url)).blob()

async function merge(remote, tombs) {
  remote.app = 'lesezeit'
  remote.version = 1
  remote.books ??= {}
  const me = device()
  const [books, progress] = await Promise.all([listBooks(), getAllProgress()])
  let changed = false, localChanged = false
  const coverUploads = {}, coverDownloads = []

  for (const book of books) {
    const key = await bookKey(book)
    if (!key) continue
    let entry = remote.books[key]
    if (!entry) {
      entry = remote.books[key] = { title: book.title, author: book.author ?? '', type: book.type, bookmarks: {} }
      changed = true
    }
    entry.bookmarks ??= {}

    // Bearbeitete Angaben: die neuere Änderung gewinnt
    const lm = book.metaEditedAt ?? 0, rm = entry.meta
    if (lm && (!rm || lm > rm.updatedAt)) {
      entry.meta = { ...pick(book, META), updatedAt: lm, deviceId: me.id }
      entry.title = book.title; entry.author = book.author ?? ''
      changed = true
    } else if (rm && rm.updatedAt > lm) {
      await updateBook(book.id, { ...pick(rm, META), metaEditedAt: rm.updatedAt })
      localChanged = true
    }

    // Eigenes Cover: die neuere Änderung gewinnt
    const lc = book.coverEditedAt ?? 0, rc = entry.cover?.updatedAt ?? 0
    if (lc > rc) {
      const blob = await getCover(book.id)
      if (blob) {
        coverUploads[`${key}.txt`] = await blobToDataUrl(blob)
        entry.cover = { updatedAt: lc, deviceId: me.id }
        changed = true
      }
    } else if (rc > lc) {
      coverDownloads.push({ book, key, updatedAt: rc })
    }

    // Position: die neuere gewinnt
    const lp = progress[book.id], rp = entry.progress
    if (lp && !held.has(key) && (!rp || lp.updatedAt > rp.updatedAt) && !samePlace(lp, rp)) {
      entry.progress = {
        fraction: lp.fraction ?? 0,
        chapter: lp.chapter ?? '',
        ...(lp.cfi ? { cfi: lp.cfi } : {}),
        ...(lp.position != null ? { position: lp.position } : {}),
        updatedAt: lp.updatedAt,
        deviceId: me.id,
        device: me.name,
      }
      changed = true
    }

    // Lesezeichen zusammenführen
    const local = await listBookmarks(book.id)
    const localIds = new Set(local.map(b => b.id))
    for (const bm of local) {
      const r = entry.bookmarks[bm.id]
      if (r?.deleted) await deleteBookmark(bm.id)
      else if (!r) {
        entry.bookmarks[bm.id] = {
          cfi: bm.cfi, label: bm.label ?? '', excerpt: bm.excerpt ?? '',
          fraction: bm.fraction ?? 0, createdAt: bm.createdAt,
        }
        changed = true
      }
    }
    for (const [id, r] of Object.entries(entry.bookmarks)) {
      if (r.deleted || localIds.has(id)) continue
      if (tombs[id]) { entry.bookmarks[id] = { deleted: tombs[id] }; changed = true }
      else await addBookmark({ id, bookId: book.id, ...r })
    }
  }

  // Cover hochladen (vor der Hauptdatei, damit nie auf ein fehlendes Bild verwiesen wird)
  if (Object.keys(coverUploads).length) {
    remote.coversGist ||= await gist.createCoversGist(conf.token)
    await gist.writeFiles(conf.token, remote.coversGist, coverUploads)
  }
  // Neuere Cover von anderen Geräten holen
  if (coverDownloads.length && remote.coversGist) {
    try {
      const files = await gist.readFiles(conf.token, remote.coversGist)
      for (const { book, key, updatedAt } of coverDownloads) {
        const url = files[`${key}.txt`]
        if (!url?.startsWith('data:image/')) continue
        await putCover(book.id, await dataUrlToBlob(url))
        await updateBook(book.id, { coverEditedAt: updatedAt })
        localChanged = true
      }
    } catch (err) {
      console.warn('Cover konnten nicht geladen werden', err)
    }
  }
  return { changed, localChanged }
}

// ---- Beim Öffnen eines Buchs: war ein anderes Gerät weiter? ----
// baseline = lokaler Stand vor dem Öffnen (undefined → wird gelesen).
// Ergebnis: null oder { remote, release }. release() muss aufgerufen werden,
// sobald entschieden ist (oder das Buch geschlossen wird).
export async function checkForNewerPosition(bookId, baseline) {
  if (!conf?.token) return null
  const book = await getBook(bookId)
  const key = book && await bookKey(book)
  if (!key) return null

  held.add(key)
  const release = () => { if (held.delete(key)) scheduleSync(2000) }
  try {
    await Promise.race([syncNow(), new Promise((_, rej) => setTimeout(() => rej(new Error('Zeitüberschreitung')), 10_000))])
  } catch {
    release()
    return null
  }
  const rp = cache?.books?.[key]?.progress
  const local = baseline === undefined ? await getProgress(bookId) : baseline
  const differs = !local ? true
    : rp?.position != null ? Math.abs((local.position ?? 0) - rp.position) >= 15
    : Math.abs((local.fraction ?? 0) - (rp?.fraction ?? 0)) >= 0.001
  const newer = rp && rp.deviceId !== device().id
    && rp.updatedAt > (local?.updatedAt ?? 0)
    && !samePlace(local, rp) && differs
  if (!newer) { release(); return null }
  return { remote: rp, release }
}

// Lesezeichen gelöscht → vermerken, damit es auch auf anderen Geräten verschwindet
export function noteBookmarkDeleted(id) {
  if (!conf?.token) return
  const t = load(TOMB_KEY, {})
  t[id] = Date.now()
  save(TOMB_KEY, t)
  scheduleSync(2000)
}

// ---- Verbinden / Trennen ----
export async function connect(token, deviceName) {
  token = token.trim()
  const login = await gist.whoami(token)
  const gistId = await gist.findOrCreate(token)
  conf = { token, gistId, login }
  save(CONF_KEY, conf)
  renameDevice(deviceName)
  setState({ connected: true, login, error: null })
  await syncNow()
}

export function disconnect() {
  clearTimeout(timer); timer = null
  conf = null
  cache = null
  save(CONF_KEY, null)
  save(TOMB_KEY, null)
  save(LAST_KEY, null)
  setState({ connected: false, login: null, lastSyncAt: 0, error: null })
}

export function renameDevice(name) {
  const d = device()
  d.name = name?.trim() || guessDeviceName()
  save(DEVICE_KEY, d)
  setState({ deviceName: d.name })
}

// ---- Start (einmal in main.jsx) ----
let started = false
export function initSync() {
  if (started) return
  started = true
  // Jede gespeicherte Position (Reader & Player) plant einen Abgleich ein
  registerSyncTarget({ push: async () => scheduleSync() })
  document.addEventListener('visibilitychange', () => {
    if (!conf?.token) return
    if (document.visibilityState === 'visible') syncNow().catch(() => {})
    else if (timer) syncNow().catch(() => {}) // offene Änderungen sofort hochladen
  })
  addEventListener('pagehide', () => { if (timer) syncNow().catch(() => {}) })
  if (conf?.token) syncNow().catch(() => {})
}
