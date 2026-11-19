// Einstellungen (Theme, Schrift, Wiedergabe …) – gespeichert im Browser (localStorage).
import { useSyncExternalStore } from 'react'

const KEY = 'lese-app:settings'

export const DEFAULTS = {
  theme: 'light',        // 'light' | 'sepia' | 'dark'
  font: 'original',      // Schlüssel aus FONTS
  fontSize: 100,         // Prozent
  lineHeight: 1.5,
  margin: 'medium',      // 'small' | 'medium' | 'large'
  justify: true,         // Blocksatz
  flow: 'paginated',     // 'paginated' (Blättern) | 'scrolled' (Scrollen)
  playbackRate: 1,       // Hörbuch-Geschwindigkeit
}

export const THEMES = {
  light: { label: 'Hell', bg: '#fbfaf7', fg: '#1f1f1f', muted: '#6b6b6b', link: '#2a5db0', dark: false },
  sepia: { label: 'Sepia', bg: '#f4ecd8', fg: '#4a3a2a', muted: '#86735c', link: '#8a4b14', dark: false },
  dark:  { label: 'Dunkel', bg: '#18181a', fg: '#d8d4cc', muted: '#8d8a84', link: '#8fb4ff', dark: true },
}

// Systemschriften – funktionieren offline ohne Download.
export const FONTS = {
  original: { label: 'Verlag', css: null },
  iowan:    { label: 'Iowan', css: '"Iowan Old Style", "Palatino Linotype", Georgia, serif' },
  georgia:  { label: 'Georgia', css: 'Georgia, "Times New Roman", serif' },
  palatino: { label: 'Palatino', css: 'Palatino, "Palatino Linotype", "Book Antiqua", serif' },
  avenir:   { label: 'Avenir', css: '"Avenir Next", Avenir, "Segoe UI", sans-serif' },
  system:   { label: 'System', css: '-apple-system, BlinkMacSystemFont, "Helvetica Neue", "Segoe UI", Roboto, sans-serif' },
}

export const MARGINS = {
  small:  { label: 'Schmal', gap: '3%', margin: '28px' },
  medium: { label: 'Mittel', gap: '6%', margin: '44px' },
  large:  { label: 'Breit',  gap: '11%', margin: '60px' },
}

function load() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }
  } catch {
    return { ...DEFAULTS }
  }
}

let current = load()
const listeners = new Set()

export function getSettings() {
  return current
}

export function updateSettings(changes) {
  current = { ...current, ...changes }
  try { localStorage.setItem(KEY, JSON.stringify(current)) } catch { /* privat-Modus */ }
  listeners.forEach(l => l())
}

function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useSettings() {
  return useSyncExternalStore(subscribe, getSettings)
}
