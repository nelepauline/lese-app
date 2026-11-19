// Steuerung über Sperrbildschirm, Kontrollzentrum, Kopfhörer und Mac-Medientasten
// (Media Session API).
const ms = typeof navigator !== 'undefined' ? navigator.mediaSession : null

export function setMetadata({ title, artist, album, artworkUrl, artworkType }) {
  if (!ms) return
  ms.metadata = new MediaMetadata({
    title, artist, album,
    artwork: artworkUrl ? [
      { src: artworkUrl, sizes: '512x512', type: artworkType || 'image/jpeg' },
    ] : [],
  })
}

export function setHandlers(handlers) {
  if (!ms) return
  for (const [action, handler] of Object.entries(handlers)) {
    try { ms.setActionHandler(action, handler) } catch { /* Aktion nicht unterstützt */ }
  }
}

export function clearSession() {
  if (!ms) return
  ms.metadata = null
  for (const a of ['play', 'pause', 'seekbackward', 'seekforward', 'seekto', 'stop'])
    try { ms.setActionHandler(a, null) } catch { /* egal */ }
}

export function setPlaybackState(playing) {
  if (ms) ms.playbackState = playing ? 'playing' : 'paused'
}

export function setPosition(audio) {
  if (!ms?.setPositionState || !isFinite(audio.duration) || !audio.duration) return
  try {
    ms.setPositionState({
      duration: audio.duration,
      playbackRate: audio.playbackRate || 1,
      position: Math.min(audio.currentTime, audio.duration),
    })
  } catch { /* egal */ }
}

// Für den Sperrbildschirm ist eine data:-URL zuverlässiger als eine blob:-URL
export function blobToDataUrl(blob) {
  return new Promise(resolve => {
    const r = new FileReader()
    r.onload = () => resolve(r.result)
    r.onerror = () => resolve(null)
    r.readAsDataURL(blob)
  })
}
