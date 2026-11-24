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
import { reactionEmoji, REACTIONS, getCategoryData } from '../highlights.js'

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

// Welche Ausgabe (Edition) zählt? Die der Lese-Runde, sonst die im Regal
// gewählte, sonst die Standard-Ausgabe passend zum Format.
function pickEdition(st, audio, link) {
  if (audio) {
    const e = [st.read.edition, st.userEdition, st.defaults.audio].find(x => x?.seconds)
    return { edition: e ?? null, total: e?.seconds ?? st.defaults.seconds ?? link.audioSeconds ?? null }
  }
  const e = [st.read.edition, st.userEdition, st.defaults.ebook, st.defaults.physical].find(x => x?.pages)
  return { edition: e ?? null, total: e?.pages ?? st.defaults.pages ?? link.pages ?? null }
}

const report = (book, text, extra = {}) => setState({ lastSent: { title: book.title, text, at: Date.now(), ...extra } })

// force: Minuten-Regel und "schon gesendet" ignorieren (Knopf "jetzt senden")
export async function pushProgress(bookId, { force = false } = {}) {
  if (!hardcoverReady()) return
  const book = await getBook(bookId)
  const link = linkOf(book)
  if (!link) { if (force) report(book ?? { title: '?' }, 'nicht gesendet – Buch ist nicht mit Hardcover verknüpft', { skipped: true }); return }
  const progress = await getProgress(bookId)
  if (!progress) { if (force) report(book, 'nicht gesendet – noch kein Fortschritt gespeichert', { skipped: true }); return }
  lastPush.set(bookId, Date.now())
  backfillJournal(bookId).catch(fail)
  const user = await ensureUser()
  let st = await cachedState(user.id, link.bookId, force)
  if (!st || st.statusId !== 2 || !st.read) st = await cachedState(user.id, link.bookId, true)
  if (!st) return report(book, 'nicht gesendet – das Buch ist nicht in deiner Hardcover-Bibliothek', { skipped: true })
  if (st.statusId !== 2) return report(book, 'nicht gesendet – steht auf Hardcover nicht auf „Lese ich“', { skipped: true })
  if (!st.read) return report(book, 'nicht gesendet – Hardcover hat keine laufende Lese-Runde (Status einmal neu auf „Lese ich“ setzen)', { skipped: true })

  const audio = book.type === 'audiobook'
  const { edition, total } = pickEdition(st, audio, link)
  const frac = Math.min(1, Math.max(0, progress.fraction ?? 0))
  const object = {}
  let label
  if (audio) {
    const seconds = Math.round(total ? frac * total : (progress.position ?? 0))
    if (!force && seconds === st.read.seconds) return
    object.progress_seconds = seconds
    label = `${Math.round(frac * 100)} % gehört`
  } else {
    if (!total) return report(book, 'nicht gesendet – Hardcover kennt die Seitenzahl nicht (auf Hardcover eine Ausgabe wählen)', { skipped: true })
    // Nicht versehentlich "fertig" melden, solange das Ende nicht erreicht ist
    const pages = frac >= 0.995 ? total : Math.min(total - 1, Math.max(1, Math.round(frac * total)))
    if (!force && pages === st.read.pages) return
    object.progress_pages = pages
    label = `Seite ${pages} von ${total}`
  }
  // Lese-Runde ohne Ausgabe: passende Ausgabe mitschicken, sonst zählt Hardcover die Seiten nicht
  if (!st.read.edition && edition?.id) object.edition_id = edition.id

  const sent = load(SENT_KEY, {})
  const value = JSON.stringify(object)
  if (!force && sent[bookId]?.value === value) return
  try {
    const r = await api.updateRead(st.read.id, object)
    if (r && object.progress_pages != null && r.progress_pages != null && r.progress_pages !== object.progress_pages)
      throw new api.HardcoverError('graphql', `Hardcover hat ${r.progress_pages} statt ${object.progress_pages} Seiten gespeichert`)
  } catch (err) {
    report(book, `Fehler beim Senden: ${err.message || err}`, { failed: true })
    throw err
  }
  st.read = {
    ...st.read,
    pages: object.progress_pages ?? st.read.pages,
    seconds: object.progress_seconds ?? st.read.seconds,
    edition: st.read.edition ?? (object.edition_id ? edition : null),
  }
  sent[bookId] = { value, at: Date.now() }
  save(SENT_KEY, sent)
  report(book, label)
  setState({ error: null })
}

// Knopf im Einstellungsfenster: zuletzt geöffnetes verknüpftes Buch sofort senden
export async function pushLatestNow() {
  const { listBooks } = await import('../../db/db.js')
  const books = (await listBooks()).filter(b => linkOf(b)).sort((a, b) => (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0))
  if (!books.length) { setState({ lastSent: { title: '–', text: 'Noch kein Buch mit Hardcover verknüpft', at: Date.now(), skipped: true } }); return }
  await pushProgress(books[0].id, { force: true }).catch(fail)
}

// ---- Lesetagebuch: Zitate und Momente ----
// Was soll aus dieser Markierung werden? → { event, entry } oder null
//  - Zitate (Kategorie "Zitate"): EIN Eintrag als "quote"; Reaktion und
//    Notiz stehen darunter, z. B. "— 🤯 krass · meine Notiz"
//  - Momente (Kategorie "Momente" oder Markierung mit Reaktion): "note",
//    z. B. "🤯 krass: „…“"
export function journalFor(h, categories = getCategoryData().list) {
  if (h.position != null) return null // Hörbuch-Markierungen: nicht gewünscht
  const text = (h.text ?? '').trim()
  if (!text) return null
  const emo = h.reaction ? `${reactionEmoji(h.reaction)} ${REACTIONS.find(r => r[0] === h.reaction)?.[2] ?? ''}`.trim() : ''
  const note = (h.note ?? '').trim()
  if (h.catId === 'quotes') {
    const extra = [emo, note].filter(Boolean).join(' · ')
    return { event: 'quote', entry: extra ? `${text}\n\n— ${extra}` : text }
  }
  const isMomentCat = /^moment/i.test(categories.find(c => c.id === h.catId)?.name ?? '')
  if (isMomentCat || h.reaction) {
    return { event: 'note', entry: `${emo ? `${emo}: ` : ''}„${text}“${note ? `\n${note}` : ''}` }
  }
  return null
}

const journalQueue = new Map() // highlightId → Promise (nacheinander)
// Sofort gemerkte Hardcover-IDs (zusätzlich zur Datenbank) – verhindert
// doppeltes Hochladen, falls die Markierung gerade parallel gespeichert wird
const journalIds = new Map()  // highlightId → { id, event }

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
  const known = journalIds.get(h.id)
  let hcJournalId = h.hcJournalId ?? known?.id ?? null
  const hcEvent = h.hcJournalId ? h.hcEvent : known?.event ?? h.hcEvent
  if (!want && hcJournalId) { await api.deleteJournal(hcJournalId); hcJournalId = null; journalIds.delete(h.id) }
  else if (want && hcJournalId && hcEvent === want.event) await api.updateJournal(hcJournalId, want.entry, PRIVACY_FOLLOWERS)
  else if (want) {
    if (hcJournalId) await api.deleteJournal(hcJournalId).catch(() => {})
    hcJournalId = await api.insertJournal({ bookId: link.bookId, event: want.event, entry: want.entry, privacy: PRIVACY_FOLLOWERS })
    journalIds.set(h.id, { id: hcJournalId, event: want.event })
  }
  // Merken, was gesendet wurde (läuft über den Geräte-Abgleich mit, damit
  // andere Geräte nicht doppelt hochladen)
  // Frisch lesen und nur die Hardcover-Angaben ergänzen (nichts überschreiben)
  const latest = (await getHighlight(h.id)) ?? h
  await putHighlight({ ...latest, hcJournalId, hcEvent: want?.event ?? null, hcSent: sentText, updatedAt: Date.now() })
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
