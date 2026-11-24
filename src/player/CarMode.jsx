// Autofahr-Modus: riesige Knöpfe, hoher Kontrast, Bildschirm bleibt an.
// "Merken" speichert die aktuelle Stelle mit einem Tipp – ohne Tippen von Text.
import { useEffect, useRef, useState } from 'react'
import { useAudio, useAudioTime, chapterIndexAt, SKIP_SECONDS } from './AudioProvider.jsx'
import { clock, duration as fmtDuration } from '../lib/format.js'
import Icon from '../components/Icon.jsx'

export default function CarMode({ onMark, onClose }) {
  const audio = useAudio()
  const { position, duration } = useAudioTime()
  const [toast, setToast] = useState(null)
  const toastTimer = useRef()
  const chapters = audio.chapters
  const idx = chapterIndexAt(chapters, position)
  const chapter = chapters[idx]
  const chEnd = chapters[idx + 1]?.start ?? duration
  const remainingChapter = (chEnd - position) / (audio.rate || 1)

  // Bildschirm anlassen (Wake Lock), nach dem Zurückkehren in die App erneut anfordern
  useEffect(() => {
    let lock = null, alive = true
    const request = async () => {
      try { if (alive && document.visibilityState === 'visible') lock = await navigator.wakeLock?.request('screen') } catch { /* nicht unterstützt */ }
    }
    request()
    const onVis = () => { if (document.visibilityState === 'visible') request() }
    document.addEventListener('visibilitychange', onVis)
    return () => { alive = false; document.removeEventListener('visibilitychange', onVis); lock?.release?.().catch(() => {}) }
  }, [])

  useEffect(() => () => clearTimeout(toastTimer.current), [])

  async function mark() {
    navigator.vibrate?.(40)
    const ok = await onMark()
    setToast(ok ? `Stelle gemerkt · ${clock(position)}` : 'Konnte nicht speichern')
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2500)
  }

  return (
    <div className="car-mode" role="dialog" aria-label="Autofahr-Modus">
      <header className="car-top">
        <button className="car-exit" onClick={onClose}>Fertig</button>
        <div className="car-title">
          <div className="car-chapter">{chapter?.title ?? audio.book?.title}</div>
          <div className="car-sub">Kapitel noch {fmtDuration(remainingChapter)}</div>
        </div>
      </header>

      <div className="car-main">
        <button className="car-skip" onClick={() => audio.seekBy(-SKIP_SECONDS)} aria-label="30 Sekunden zurück">
          <Icon name="back30" size={64} />
        </button>
        <button className="car-play" onClick={audio.toggle} aria-label={audio.playing ? 'Pause' : 'Abspielen'}>
          <Icon name={audio.playing ? 'pause' : 'play'} size={84} />
        </button>
        <button className="car-skip" onClick={() => audio.seekBy(SKIP_SECONDS)} aria-label="30 Sekunden vor">
          <Icon name="fwd30" size={64} />
        </button>
      </div>

      <div className="car-bottom">
        <button className="car-btn" onClick={() => audio.goToChapter(position - (chapter?.start ?? 0) > 3 ? idx : idx - 1)}
          disabled={!chapters.length} aria-label="Kapitelanfang oder voriges Kapitel">
          <Icon name="prevChapter" size={34} /><span>Kapitel</span>
        </button>
        <button className="car-btn car-mark" onClick={mark} aria-label="Stelle merken">
          <Icon name="bookmark" size={34} /><span>Merken</span>
        </button>
        <button className="car-btn" onClick={() => audio.goToChapter(idx + 1)}
          disabled={idx >= chapters.length - 1} aria-label="Nächstes Kapitel">
          <Icon name="nextChapter" size={34} /><span>Kapitel</span>
        </button>
      </div>

      {toast && <div className="car-toast" role="status">{toast}</div>}
    </div>
  )
}
