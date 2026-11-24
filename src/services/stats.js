// Lese- und Hörzeit, Tagesziel und Streak.
//
// Jedes Gerät zählt seine eigene Zeit (Sekunden je Tag, getrennt nach Lesen
// und Hören). Über den Geräte-Abgleich schreibt jedes Gerät nur seinen eigenen
// Eintrag – zusammengezählt wird beim Anzeigen. So gibt es keine Konflikte.
import { useSyncExternalStore } from 'react'

const LOCAL_KEY = 'lese-app:stats'          // { days: { '2026-11-24': { read, listen } }, books: { bookId: { read, listen, title } } }
const REMOTE_KEY = 'lese-app:stats-remote'  // { [deviceId]: { name, days, books } } – andere Geräte (Kopie für offline)
const GOAL_KEY = 'lese-app:stats-goal'      // { minutes, updatedAt }

const load = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback } catch { return fallback } }
const save = (key, v) => { try { localStorage.setItem(key, JSON.stringify(v)) } catch { /* egal */ } }

let local = load(LOCAL_KEY, { days: {}, books: {} })
let remote = load(REMOTE_KEY, {})
let goal = load(GOAL_KEY, { minutes: 10, updatedAt: 0 })

const listeners = new Set()
let version = 0
const emit = () => { version++; listeners.forEach(l => l()) }
const subscribe = cb => { listeners.add(cb); return () => listeners.delete(cb) }

// Lokales Datum als "JJJJ-MM-TT"
export const dayKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

// ---- Zeit zählen ----
let dirty = false
let saveTimer = null
let onSync = () => {}
export const setStatsSyncHook = fn => { onSync = fn }

function add(kind, book, seconds) {
  const k = dayKey()
  const d = local.days[k] ??= { read: 0, listen: 0 }
  d[kind] += seconds
  if (book) {
    const b = local.books[book.id] ??= { read: 0, listen: 0 }
    b[kind] += seconds
    b.title = book.title
    b.type = book.type
  }
  dirty = true
  if (!saveTimer) saveTimer = setTimeout(flush, 30_000)
}

export function flush() {
  clearTimeout(saveTimer); saveTimer = null
  if (!dirty) return
  dirty = false
  save(LOCAL_KEY, local)
  emit()
  onSync()
}

// Lesen: zählt, solange die Seite sichtbar ist und in den letzten 2 Minuten
// geblättert/gescrollt/getippt wurde (wer einschläft, sammelt keine Zeit).
// Hören: zählt, solange das Hörbuch läuft – auch bei gesperrtem Bildschirm.
export function startTracking(kind, book, isActive) {
  let last = Date.now()
  let lastActivity = Date.now()
  const tick = () => {
    const now = Date.now()
    const delta = Math.min(now - last, 15_000) / 1000 // nach Pausen nicht nachzählen
    last = now
    const active = kind === 'listen'
      ? isActive()
      : document.visibilityState === 'visible' && now - lastActivity < 120_000
    if (active && delta > 0) add(kind, book, delta)
  }
  const timer = setInterval(tick, 5000)
  const onHide = () => { if (document.visibilityState === 'hidden') { tick(); flush() } }
  document.addEventListener('visibilitychange', onHide)
  return {
    activity: () => { lastActivity = Date.now() },
    stop: () => { tick(); clearInterval(timer); document.removeEventListener('visibilitychange', onHide); flush() },
  }
}

// ---- Tagesziel ----
export function setGoal(minutes) {
  goal = { minutes, updatedAt: Date.now() }
  save(GOAL_KEY, goal)
  emit()
  onSync()
}

// ---- Für den Abgleich ----
export const localStatsForSync = () => ({ days: local.days, books: local.books })
export const goalForSync = () => goal
export function applyRemoteStats(devices, myId, remoteGoal) {
  const others = Object.fromEntries(Object.entries(devices ?? {}).filter(([id]) => id !== myId))
  let changed = JSON.stringify(others) !== JSON.stringify(remote)
  if (changed) { remote = others; save(REMOTE_KEY, remote) }
  if (remoteGoal?.updatedAt > goal.updatedAt) { goal = remoteGoal; save(GOAL_KEY, goal); changed = true }
  if (changed) emit()
}
export const forgetRemoteStats = () => { remote = {}; save(REMOTE_KEY, remote); emit() }

// ---- Auswertung ----
function mergedDays() {
  const out = {}
  for (const src of [local, ...Object.values(remote)]) {
    for (const [k, d] of Object.entries(src.days ?? {})) {
      const o = out[k] ??= { read: 0, listen: 0 }
      o.read += d.read ?? 0
      o.listen += d.listen ?? 0
    }
  }
  return out
}

const total = d => (d?.read ?? 0) + (d?.listen ?? 0)
const addDays = (date, n) => { const d = new Date(date); d.setDate(d.getDate() + n); return d }

function computeStats() {
  const days = mergedDays()
  const goalSec = goal.minutes * 60
  const met = k => total(days[k]) >= goalSec
  const today = dayKey()

  // Aktueller Streak: heute zählt mit, wenn das Ziel schon erreicht ist –
  // sonst ist der Streak bis heute Abend noch "offen" und zählt ab gestern.
  let streak = 0
  let d = new Date()
  if (!met(today)) d = addDays(d, -1)
  while (met(dayKey(d))) { streak++; d = addDays(d, -1) }

  // Längster Streak
  let longest = 0, run = 0, prev = null
  for (const k of Object.keys(days).filter(met).sort()) {
    const expected = prev && dayKey(addDays(new Date(prev + 'T12:00'), 1))
    run = expected === k ? run + 1 : 1
    longest = Math.max(longest, run)
    prev = k
  }

  const sumSince = from => Object.entries(days).filter(([k]) => k >= from)
    .reduce((s, [, v]) => ({ read: s.read + v.read, listen: s.listen + v.listen }), { read: 0, listen: 0 })
  const now = new Date()
  const monday = addDays(now, -((now.getDay() + 6) % 7))
  const all = sumSince('')

  // Bücher (dieses Gerät per bookId, andere Geräte per Titel zusammengeführt)
  const books = {}
  for (const b of Object.values(local.books)) {
    const o = books[b.title] ??= { title: b.title, type: b.type, read: 0, listen: 0 }
    o.read += b.read; o.listen += b.listen
  }
  for (const dev of Object.values(remote)) for (const b of Object.values(dev.books ?? {})) {
    const o = books[b.title] ??= { title: b.title, type: b.type, read: 0, listen: 0 }
    o.read += b.read ?? 0; o.listen += b.listen ?? 0
  }
  const topBooks = Object.values(books).sort((a, b) => total(b) - total(a)).slice(0, 5)

  return {
    days, goal: goal.minutes, today: days[today] ?? { read: 0, listen: 0 },
    streak, longest, metToday: met(today),
    week: sumSince(dayKey(monday)),
    month: sumSince(dayKey(new Date(now.getFullYear(), now.getMonth(), 1))),
    all, topBooks,
    activeDays: Object.values(days).filter(v => total(v) > 0).length,
  }
}

let cache = { v: -1, value: null }
const snapshot = () => {
  if (cache.v !== version) cache = { v: version, value: computeStats() }
  return cache.value
}
export const useStats = () => useSyncExternalStore(subscribe, snapshot)

// Neuer Tag → Werte neu berechnen (z. B. wenn die App über Mitternacht offen ist)
setInterval(() => { if (cache.value && dayKey() !== cache.day) { cache.day = dayKey(); emit() } }, 60_000)
