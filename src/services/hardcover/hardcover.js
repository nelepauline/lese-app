// Hardcover-Abgleich (Etappe 4):
//  - Fortschritt: höchstens einmal pro Minute (und beim Schließen) an Hardcover,
//    nur für Bücher, die dort auf "Lese ich" stehen. Den Status setzt du selbst.
//  - Zitate (Kategorie "Zitate") → Lesetagebuch als "quote",
//    Momente (Markierung mit Reaktion) → "note". Sichtbar nur für Follower.
//    Ändern/Löschen der Markierung ändert/löscht auch den Eintrag.
//  - Jedes Buch wird einmal mit einem Hardcover-Buch verknüpft (Vorschlag +
//    Bestätigen). Die Verknüpfung läuft über den Geräte-Abgleich mit.
import { useSyncExternalStore } from 'react'
import * as api from './api.js'
import { getBook, updateBook, getProgress, listHighlights, putHighlight, getHighlight } from '../../db/db.js'
import { registerSyncTarget } from '../progress.js'
import { reactionEmoji, REACTIONS } from '../highlights.js'

const USER_KEY = 'lese-app:hc-user'        // { id, username }
const OPTS_KEY = 'lese-app:hc-options'     // { journal: true }
const SENT_KEY = 'lese-app:hc-sent'        // { bookId: { value, at } } zuletzt gesendeter Fortschritt

const load = (key, fb) => { try { return JSON.parse(localStorage.getItem(key)) ?? fb } catch { return fb } }
const save = (key, v) => { try { v == null ? localStorage.removeItem(key) : localStorage.setItem(key, JSON.stringify(v)) } catch { /* egal */ } }

export const PROGRESS_INTERVAL = 60_000
export const PRIVACY_FOLLOWERS = 2

// ---- Zustand für die Oberfläche ----
let state = {
  configured: api.isConfigured(),
  signedIn: api.hasSession(),
  user: load(USER_KEY, null),
  options: { journal: true, ...load(OPTS_KEY, {}) },
  lastSent: null,         // { title, text, at }
  error: null,
  justSignedIn: false,
}
const listeners = new Set()
function setState(patch) { state = { ...state, ...patch }; listeners.forEach(l => l()) }
const subscribe = cb => { listeners.add(cb); return () => listeners.delete(cb) }
export const useHardcover = () => useSyncExternalStore(subscribe, () => state)
export const hardcoverReady = () => state.configured && state.signedIn && !!state.user

function fail(err) {
  if (err?.code === 'login') setState({ signedIn: false })
  setState({ error: err?.message || String(err) })
}

// ---- Anmelden / Abmelden ----
export const signIn = () => api.signIn().catch(err => { fail(err); throw err })
export function signOut() {
  api.signOut()
  save(USER_KEY, null)
  setState({ signedIn: false, user: null, error: null })
}
export function setOptions(patch) {
  const options = { ...state.options, ...patch }
  save(OPTS_KEY, options)
  setState({ options })
}

async function ensureUser() {
  if (state.user?.id) return state.user
  const user = await api.me()
  if (!user) throw new api.HardcoverError('auth', 'Hardcover-Konto konnte nicht gelesen werden.')
  save(USER_KEY, user)
  setState({ user })
  return user
}

// ---- Bücher verknüpfen ----
// book.hardcover = { bookId, title, authors, image, pages, audioSeconds, linkedAt } | { skipped: true, linkedAt }
export const linkOf = book => (book?.hardcover?.bookId ? book.hardcover : null)
export const needsLink = book => hardcoverReady() && !book?.hardcover?.bookId && !book?.hardcover?.skipped

export function searchQueryFor(book) {
  if (book.isbn) return book.isbn
  return [book.title, book.author?.split(',')[0]].filter(Boolean).join(' ')
}
export const search = q => api.searchBooks(q).catch(err => { fail(err); throw err })

export async function linkBook(bookId, hit) {
  const link = hit
    ? { bookId: hit.id, title: hit.title, authors: hit.authors, image: hit.image, pages: hit.pages, audioSeconds: hit.audioSeconds, linkedAt: Date.now() }
    : { skipped: true, linkedAt: Date.now() }
  await updateBook(bookId, { hardcover: link })
  scheduleDeviceSync()
  if (hit) { backfillJournal(bookId).catch(fail); pushProgressSoon(bookId, 2000) }
  return link
}
// Lösen: als "entfernt" merken (damit es auch auf anderen Geräten gelöst wird)
export const unlinkBook = bookId => updateBook(bookId, { hardcover: { removed: true, linkedAt: Date.now() } }).then(scheduleDeviceSync)

// Geräte-Abgleich anstoßen (ohne harte Abhängigkeit, um Zyklen klein zu halten)
let deviceSync = () => {}
export const setDeviceSyncHook = fn => { deviceSync = fn }
const scheduleDeviceSync = () => deviceSync()

// ---- Fortschritt ----
const timers = new Map()      // bookId → Timer
const lastPush = new Map()    // bookId → Zeitpunkt
const stateCache = new Map()  // bookId → { value, at } (user_book/read für 10 Min. merken)

function pushProgressSoon(bookId, delay) {
  if (!hardcoverReady()) return
  const since = Date.now() - (lastPush.get(bookId) ?? 0)
  const wait = delay ?? Math.max(0, PROGRESS_INTERVAL - since)
  if (timers.has(bookId)) return
  timers.set(bookId, setTimeout(() => { timers.delete(bookId); pushProgress(bookId).catch(fail) }, wait))
}

function flushAll() {
  for (const [bookId, t] of timers) { clearTimeout(t); timers.delete(bookId); pushProgress(bookId).catch(() => {}) }
}

async function cachedState(userId, hcBookId, fresh) {
  const c = stateCache.get(hcBookId)
  if (!fresh && c && Date.now() - c.at < 10 * 60_000) return c.value
  const value = await api.readingState(userId, hcBookId)
  stateCache.set(hcBookId, { value, at: Date.now() })
  return value
}

export async function pushProgress(bookId) {
  if (!hardcoverReady()) return
  const book = await getBook(bookId)
  const link = linkOf(book)
  if (!link) return
  const progress = await getProgress(bookId)
  if (!progress) return
  lastPush.set(bookId, Date.now())
  backfillJournal(bookId).catch(fail)
  const user = await ensureUser()
  let st = await cachedState(user.id, link.bookId)
  if (!st || st.statusId !== 2 || !st.read) st = await cachedState(user.id, link.bookId, true)
  if (!st || st.statusId !== 2 || !st.read) {
    setState({ lastSent: { title: book.title, text: 'nicht gesendet – steht auf Hardcover nicht auf „Lese ich“', at: Date.now(), skipped: true } })
    return
  }

  const frac = Math.min(1, Math.max(0, progress.fraction ?? 0))
  let object, label
  if (book.type === 'audiobook') {
    const total = st.read.editionSeconds || link.audioSeconds
    const seconds = Math.round(total ? frac * total : (progress.position ?? 0))
    if (seconds === st.read.seconds) return
    object = { progress_seconds: seconds }
    label = `${Math.round(frac * 100)} %`
  } else {
    const total = st.read.editionPages || link.pages
    if (!total) {
      setState({ lastSent: { title: book.title, text: 'nicht gesendet – Hardcover kennt die Seitenzahl nicht', at: Date.now(), skipped: true } })
      return
    }
    // Nicht versehentlich "fertig" melden, solange das Ende nicht erreicht ist
    const pages = frac >= 0.995 ? total : Math.min(total - 1, Math.max(1, Math.round(frac * total)))
    if (pages === st.read.pages) return
    object = { progress_pages: pages }
    label = `Seite ${pages} von ${total}`
  }
  const sentKey = `${bookId}`
  const sent = load(SENT_KEY, {})
  const value = JSON.stringify(object)
  if (sent[sentKey]?.value === value) return
  await api.updateRead(st.read.id, object)
  st.read = { ...st.read, pages: object.progress_pages ?? st.read.pages, seconds: object.progress_seconds ?? st.read.seconds }
  sent[sentKey] = { value, at: Date.now() }
  save(SENT_KEY, sent)
  setState({ lastSent: { title: book.title, text: label, at: Date.now() }, error: null })
}

// ---- Lesetagebuch: Zitate und Momente ----
// Was soll aus dieser Markierung werden? → { event, entry } oder null
export function journalFor(h) {
  if (h.position != null) return null // Hörbuch-Markierungen: nicht gewünscht
  const text = (h.text ?? '').trim()
  if (!text) return null
  if (h.catId === 'quotes') return { event: 'quote', entry: h.note ? `${text}\n\n— ${h.note}` : text }
  if (h.reaction) {
    const label = REACTIONS.find(r => r[0] === h.reaction)?.[2] ?? ''
    return { event: 'note', entry: `${reactionEmoji(h.reaction)} ${label}: „${text}“${h.note ? `\n${h.note}` : ''}` }
  }
  return null
}

const journalQueue = new Map() // highlightId → Promise (nacheinander)

// Nach jeder Änderung einer Markierung aufrufen
export function highlightChanged(h) {
  if (!hardcoverReady() || !state.options.journal) return
  const prev = journalQueue.get(h.id) ?? Promise.resolve()
  const next = prev.then(() => syncHighlight(h.id)).catch(fail)
  journalQueue.set(h.id, next)
}

export function highlightRemoved(h) {
  if (!hardcoverReady() || !h.hcJournalId) return
  api.deleteJournal(h.hcJournalId).catch(fail)
}

async function syncHighlight(id) {
  const h = await getHighlight(id)
  if (!h) return
  const book = await getBook(h.bookId)
  const link = linkOf(book)
  if (!link) return // wird nach dem Verknüpfen nachgeholt
  const want = journalFor(h)
  const sentText = want ? `${want.event}|${want.entry}` : ''
  if (sentText === (h.hcSent ?? '') && (!!h.hcJournalId === !!want)) return
  let hcJournalId = h.hcJournalId ?? null
  if (!want && hcJournalId) { await api.deleteJournal(hcJournalId); hcJournalId = null }
  else if (want && hcJournalId && h.hcEvent === want.event) await api.updateJournal(hcJournalId, want.entry, PRIVACY_FOLLOWERS)
  else if (want) {
    if (hcJournalId) await api.deleteJournal(hcJournalId).catch(() => {})
    hcJournalId = await api.insertJournal({ bookId: link.bookId, event: want.event, entry: want.entry, privacy: PRIVACY_FOLLOWERS })
  }
  // Merken, was gesendet wurde (läuft über den Geräte-Abgleich mit, damit
  // andere Geräte nicht doppelt hochladen)
  await putHighlight({ ...h, hcJournalId, hcEvent: want?.event ?? null, hcSent: sentText, updatedAt: Date.now() })
  if (want) setState({ lastSent: { title: book.title, text: want.event === 'quote' ? 'Zitat hochgeladen' : 'Moment hochgeladen', at: Date.now() }, error: null })
  scheduleDeviceSync()
}

// Nach dem Verknüpfen (und bei jedem Fortschritt): noch nicht hochgeladene
// oder geänderte Zitate/Momente dieses Buchs nachholen – z. B. nach einem
// Upload ohne Internet
async function backfillJournal(bookId) {
  if (!state.options.journal) return
  for (const h of await listHighlights(bookId)) {
    const want = journalFor(h)
    const sentText = want ? `${want.event}|${want.entry}` : ''
    if (sentText !== (h.hcSent ?? '') && (want || h.hcJournalId)) highlightChanged(h)
  }
}

// ---- Start (einmal in main.jsx) ----
let started = false
export async function initHardcover() {
  if (started) return
  started = true
  registerSyncTarget({ push: async bookId => pushProgressSoon(bookId) })
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushAll() })
  addEventListener('pagehide', flushAll)
  try {
    if (await api.handleRedirect()) {
      setState({ signedIn: true, justSignedIn: true, error: null })
      await ensureUser()
    }
  } catch (err) { fail(err) }
  if (hardcoverReady() || state.signedIn) ensureUser().catch(fail)
}

// Wird beim Schließen eines Buchs aufgerufen: offenen Fortschritt sofort senden
export function flushBook(bookId) {
  const t = timers.get(bookId)
  if (t) { clearTimeout(t); timers.delete(bookId); pushProgress(bookId).catch(fail) }
}

export const clearError = () => setState({ error: null })
