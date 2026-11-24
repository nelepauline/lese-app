// Einstellungen (Theme, Schrift, Wiedergabe …) – gespeichert im Browser (localStorage).
import { useEffect, useState, useSyncExternalStore } from 'react'

const KEY = 'lese-app:settings'

export const DEFAULTS = {
  appearance: 'auto',    // 'auto' (wie das Gerät) | 'light' | 'dark'
  lightScheme: 'creme',  // Farbschema für hell (Schlüssel aus SCHEMES)
  darkScheme: 'night',   // Farbschema für dunkel
  theme: 'scheme',       // Buchseite: 'scheme' (passend zum Farbschema) | 'light' | 'sepia' | 'dark'
  font: 'original',      // Schlüssel aus FONTS
  fontSize: 100,         // Prozent
  lineHeight: 1.5,
  margin: 'medium',      // 'small' | 'medium' | 'large'
  justify: true,         // Blocksatz
  flow: 'paginated',     // 'paginated' (Blättern) | 'scrolled' (Scrollen)
  playbackRate: 1,       // Hörbuch-Geschwindigkeit
}

// Farbschemata der App (Pastell). page = Farben der Buchseite bei "passend".
export const SCHEMES = {
  // hell
  creme:    { label: 'Creme',    dark: false, bg: '#fbfaf7', surface: '#ffffff', surface2: '#f1eee8', fg: '#1f1f1f', muted: '#6f6b66', line: '#e4dfd6', accent: '#8b5e3c', accentFg: '#ffffff', shelfTop: '#d9bf9b', shelfFront: '#b88f62', page: { bg: '#fbfaf7', fg: '#1f1f1f', link: '#2a5db0' } },
  sage:     { label: 'Salbei',   dark: false, bg: '#f2f6ef', surface: '#fbfcf9', surface2: '#e4ecdd', fg: '#1e261f', muted: '#61705d', line: '#d5dfcd', accent: '#5b8756', accentFg: '#ffffff', shelfTop: '#d6c49f', shelfFront: '#b09a70', page: { bg: '#f5f8f2', fg: '#1e261f', link: '#3f6f52' } },
  lavender: { label: 'Lavendel', dark: false, bg: '#f5f3fa', surface: '#fdfcff', surface2: '#ebe6f5', fg: '#24202e', muted: '#6b6580', line: '#ddd6ec', accent: '#7860ae', accentFg: '#ffffff', shelfTop: '#d8c3a2', shelfFront: '#b39673', page: { bg: '#f7f5fb', fg: '#24202e', link: '#6a4fb0' } },
  rose:     { label: 'Rosé',     dark: false, bg: '#fbf3f4', surface: '#fffbfb', surface2: '#f4e4e7', fg: '#2b1f22', muted: '#7a6266', line: '#ecd6db', accent: '#ad5d77', accentFg: '#ffffff', shelfTop: '#dcc2a2', shelfFront: '#b8977a', page: { bg: '#fcf6f6', fg: '#2b1f22', link: '#a24c6a' } },
  sky:      { label: 'Himmel',   dark: false, bg: '#f1f6fa', surface: '#fbfdff', surface2: '#e1ecf5', fg: '#1b2530', muted: '#5e6e7d', line: '#d1dfea', accent: '#3d76a6', accentFg: '#ffffff', shelfTop: '#d5c3a4', shelfFront: '#ae9876', page: { bg: '#f4f8fb', fg: '#1b2530', link: '#2f68a0' } },
  peach:    { label: 'Pfirsich', dark: false, bg: '#fcf5ef', surface: '#fffcf9', surface2: '#f6e7da', fg: '#2d221b', muted: '#7b6757', line: '#eedbcb', accent: '#bc6c3c', accentFg: '#ffffff', shelfTop: '#d9bf9b', shelfFront: '#b88f62', page: { bg: '#fcf7f2', fg: '#2d221b', link: '#a5582c' } },
  // dunkel
  night:    { label: 'Nacht',      dark: true, bg: '#18181a', surface: '#232326', surface2: '#2c2c30', fg: '#e4e0d8', muted: '#98948c', line: '#34343a', accent: '#d6a77a', accentFg: '#1b1408', shelfTop: '#5a4634', shelfFront: '#3e3024', page: { bg: '#18181a', fg: '#d8d4cc', link: '#8fb4ff' } },
  forest:   { label: 'Waldnacht',  dark: true, bg: '#131915', surface: '#1b231e', surface2: '#242f28', fg: '#dfe8df', muted: '#8ea092', line: '#2d3a31', accent: '#9fcb9c', accentFg: '#122014', shelfTop: '#4f4632', shelfFront: '#363022', page: { bg: '#141a16', fg: '#d5ded5', link: '#9fcb9c' } },
  plum:     { label: 'Pflaume',    dark: true, bg: '#19141f', surface: '#221b2a', surface2: '#2c2436', fg: '#e9e1f0', muted: '#9c91aa', line: '#362d41', accent: '#c5a8e8', accentFg: '#1c1326', shelfTop: '#4e3f3a', shelfFront: '#352a27', page: { bg: '#1a1520', fg: '#ddd4e6', link: '#c5a8e8' } },
  deepsea:  { label: 'Tiefsee',    dark: true, bg: '#11171f', surface: '#18212b', surface2: '#212c38', fg: '#dce6ef', muted: '#8999aa', line: '#2a3543', accent: '#90c3ea', accentFg: '#0e1923', shelfTop: '#4a4236', shelfFront: '#332d25', page: { bg: '#121820', fg: '#d4dde7', link: '#90c3ea' } },
  rosewood: { label: 'Rosenholz',  dark: true, bg: '#1d1516', surface: '#271d1f', surface2: '#322629', fg: '#f0e3e4', muted: '#a8959a', line: '#3b2d30', accent: '#eaa7b6', accentFg: '#261418', shelfTop: '#57423a', shelfFront: '#3c2d27', page: { bg: '#1e1617', fg: '#e6d8da', link: '#eaa7b6' } },
}
export const LIGHT_SCHEMES = Object.keys(SCHEMES).filter(k => !SCHEMES[k].dark)
export const DARK_SCHEMES = Object.keys(SCHEMES).filter(k => SCHEMES[k].dark)

// Buchseiten-Farben (im Reader wählbar)
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

// Ist das Gerät gerade im Dunkelmodus?
const darkQuery = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null
export function useSystemDark() {
  const [dark, setDark] = useState(() => !!darkQuery?.matches)
  useEffect(() => {
    if (!darkQuery) return
    const on = e => setDark(e.matches)
    darkQuery.addEventListener('change', on)
    return () => darkQuery.removeEventListener('change', on)
  }, [])
  return dark
}

// Welches Farbschema gilt gerade?
export function activeScheme(s, systemDark) {
  const dark = s.appearance === 'dark' || (s.appearance !== 'light' && systemDark)
  const key = dark ? s.darkScheme : s.lightScheme
  return SCHEMES[key] ?? SCHEMES[dark ? 'night' : 'creme']
}

// Farben der Buchseite: passend zum Schema oder eines der festen Reader-Themes
export function pageTheme(s, scheme) {
  if (s.theme !== 'scheme' && THEMES[s.theme]) return THEMES[s.theme]
  return { label: 'Passend', ...scheme.page, muted: scheme.muted, dark: scheme.dark }
}

// Schema als CSS-Variablen (für <html> bzw. den Reader)
export const schemeVars = sc => ({
  '--bg': sc.bg, '--surface': sc.surface, '--surface-2': sc.surface2, '--fg': sc.fg,
  '--muted': sc.muted, '--line': sc.line, '--accent': sc.accent, '--accent-fg': sc.accentFg,
  '--shelf-top': sc.shelfTop, '--shelf-front': sc.shelfFront,
})

// Ein festes Reader-Theme als (vereinfachtes) Schema, damit die Leisten im
// Reader zur Seite passen
export function schemeFromPage(t, base) {
  const mix = (a, b, p) => `color-mix(in srgb, ${a} ${p}%, ${b})`
  return {
    ...base, dark: t.dark, bg: t.bg, fg: t.fg, muted: t.muted, accent: t.link, accentFg: t.bg,
    surface: t.dark ? mix(t.bg, '#ffffff', 92) : mix(t.bg, '#ffffff', 40),
    surface2: mix(t.bg, t.fg, 90), line: mix(t.bg, t.fg, 84),
  }
}
