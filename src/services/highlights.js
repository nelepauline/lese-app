// Markierungen: Kategorien (selbst anlegbar), Pastellfarben, Reaktionen.
// Die Markierungen selbst liegen in der Datenbank (db.js → highlights).
import { useSyncExternalStore } from 'react'
import { listHighlights, putHighlight, deleteHighlight as dbDelete, newId } from '../db/db.js'
import { noteDeleted, scheduleSync } from './sync/sync.js'

// Pastellfarben zur Auswahl. "mark" ist die Farbe im Buch (wird halbtransparent
// über den Text gelegt), "chip" die kräftigere Variante für Punkte und Schildchen.
export const PALETTE = {
  sage:     { name: 'Salbei',    mark: '#a8d5a2', chip: '#7fbf78' },
  sky:      { name: 'Himmel',    mark: '#a9cdf0', chip: '#7aafe3' },
  lavender: { name: 'Lavendel',  mark: '#cdb8ec', chip: '#ad92de' },
  butter:   { name: 'Butter',    mark: '#f6e08e', chip: '#e8c955' },
  rose:     { name: 'Rosé',      mark: '#f4b8c8', chip: '#e891a8' },
  peach:    { name: 'Pfirsich',  mark: '#f8c9a4', chip: '#efa878' },
  mint:     { name: 'Minze',     mark: '#a6e3d4', chip: '#6fcab5' },
  lilac:    { name: 'Flieder',   mark: '#e6b9e6', chip: '#cf8fcf' },
  sand:     { name: 'Sand',      mark: '#e3d3b8', chip: '#c9b28c' },
  stone:    { name: 'Stein',     mark: '#cfd3d8', chip: '#a3aab3' },
}
export const colorOf = key => PALETTE[key] ?? PALETTE.stone

export const REACTIONS = [
  ['sad', '😢', 'traurig'],
  ['ohh', '😮', 'ohh'],
  ['wow', '🤯', 'krass'],
  ['love', '😍', 'toll'],
  ['funny', '😂', 'lustig'],
  ['angry', '😠', 'wütend'],
]
export const reactionEmoji = key => REACTIONS.find(r => r[0] === key)?.[1] ?? ''

// ---- Kategorien (für alle Bücher gleich) ----
const CAT_KEY = 'lese-app:highlight-cats'   // { list: [{ id, name, color, group }], updatedAt }

// group: gleiche Texte zusammenfassen (sinnvoll für Namen und Orte)
export const DEFAULT_CATEGORIES = [
  { id: 'people', name: 'Personen', color: 'sage', group: true },
  { id: 'places', name: 'Orte', color: 'sky', group: true },
  { id: 'lore', name: 'Lore & Wissen', color: 'lavender', group: false },
  { id: 'quotes', name: 'Zitate', color: 'butter', group: false },
  { id: 'other', name: 'Einfach markiert', color: 'rose', group: false },
]

function loadCats() {
  try {
    const v = JSON.parse(localStorage.getItem(CAT_KEY))
    if (v?.list?.length) return v
  } catch { /* egal */ }
  return { list: DEFAULT_CATEGORIES, updatedAt: 0 }
}
let cats = loadCats()
const listeners = new Set()
const emit = () => listeners.forEach(l => l())
const subscribe = cb => { listeners.add(cb); return () => listeners.delete(cb) }
export const useCategories = () => useSyncExternalStore(subscribe, () => cats.list)
export const getCategoryData = () => cats

// Vom Abgleich: neuere Kategorien von einem anderen Gerät übernehmen
export function applyRemoteCategories(data) {
  if (!data?.list?.length || data.updatedAt <= cats.updatedAt) return false
  cats = { list: data.list, updatedAt: data.updatedAt }
  try { localStorage.setItem(CAT_KEY, JSON.stringify(cats)) } catch { /* egal */ }
  emit()
  return true
}

export function saveCategories(list) {
  cats = { list, updatedAt: Date.now() }
  try { localStorage.setItem(CAT_KEY, JSON.stringify(cats)) } catch { /* egal */ }
  emit()
  scheduleSync(2000)
}

export const newCategory = (list) => {
  const used = new Set(list.map(c => c.color))
  const color = Object.keys(PALETTE).find(k => !used.has(k)) ?? 'stone'
  return { id: newId(), name: 'Neue Kategorie', color, group: false }
}

// ---- Markierungen ----
export { listHighlights }

export async function createHighlight(data) {
  const now = Date.now()
  const h = { id: newId(), reaction: '', note: '', ...data, createdAt: now, updatedAt: now }
  await putHighlight(h)
  scheduleSync(3000)
  return h
}

export async function updateHighlight(h, changes) {
  const next = { ...h, ...changes, updatedAt: Date.now() }
  await putHighlight(next)
  scheduleSync(3000)
  return next
}

export async function removeHighlight(h) {
  await dbDelete(h.id)
  noteDeleted(h.id)
}

// "Anna," / "anna" / "Anna’s" → gleiche Gruppe
export function groupKey(text) {
  return (text || '')
    .toLocaleLowerCase('de')
    .replace(/[’']s\b/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}
