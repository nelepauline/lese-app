// Kleine Hilfsfunktionen für Anzeige von Zeit und Prozent.

export const percent = fraction =>
  `${Math.round(Math.max(0, Math.min(1, fraction || 0)) * 100)} %`

// 3725 → "1:02:05", 125 → "2:05"
export function clock(seconds) {
  if (!isFinite(seconds) || seconds < 0) seconds = 0
  const s = Math.floor(seconds % 60)
  const m = Math.floor((seconds / 60) % 60)
  const h = Math.floor(seconds / 3600)
  const pad = n => String(n).padStart(2, '0')
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

// 5400 → "1 Std. 30 Min.", 600 → "10 Min."
export function duration(seconds) {
  if (!isFinite(seconds) || seconds <= 0) return '0 Min.'
  const totalMin = Math.round(seconds / 60)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (!h) return `${Math.max(1, m)} Min.`
  return m ? `${h} Std. ${m} Min.` : `${h} Std.`
}

// Zeitpunkt → "gerade eben", "vor 5 Min.", "vor 3 Std.", "gestern", "vor 4 Tagen"
export function timeAgo(ts) {
  const min = Math.round((Date.now() - ts) / 60_000)
  if (min < 1) return 'gerade eben'
  if (min < 60) return `vor ${min} Min.`
  const h = Math.round(min / 60)
  if (h < 24) return `vor ${h} Std.`
  const d = Math.round(h / 24)
  if (d === 1) return 'gestern'
  if (d < 14) return `vor ${d} Tagen`
  return new Date(ts).toLocaleDateString('de-DE')
}
