// Zentrale Audio-Steuerung. Liegt über der ganzen App, damit ein Hörbuch
// weiterläuft, während man in der Bibliothek stöbert.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { getBook, getFile, getCover, updateBook } from '../db/db.js'
import { saveProgress, getProgress } from '../services/progress.js'
import { getSettings, updateSettings } from '../settings/settings.js'
import * as session from './mediaSession.js'
import { startTracking } from '../services/stats.js'
import { pushNow } from '../services/hardcover/hardcover.js'

const AudioCtx = createContext(null)      // Buch, Steuerfunktionen (ändert sich selten)
const TimeCtx = createContext(null)       // Position (ändert sich ständig)

export const useAudio = () => useContext(AudioCtx)
export const useAudioTime = () => useContext(TimeCtx)

export const SKIP_SECONDS = 30

export function chapterIndexAt(chapters, t) {
  let idx = 0
  for (let i = 0; i < chapters.length; i++) if (chapters[i].start <= t + 0.25) idx = i
  return idx
}

export function AudioProvider({ children }) {
  const audioRef = useRef(null)
  const [book, setBook] = useState(null)
  const [coverUrl, setCoverUrl] = useState(null)
  const [playing, setPlaying] = useState(false)
  const [rate, setRateState] = useState(getSettings().playbackRate)
  const [time, setTime] = useState({ position: 0, duration: 0 })
  const [sleep, setSleepState] = useState(null) // { kind: 'minutes', endsAt } | { kind: 'chapter' }
  const [, forceTick] = useState(0)

  const bookRef = useRef(null)
  const sleepRef = useRef(null)
  const lastSave = useRef(0)
  const lastChapter = useRef(-1)
  const loadingRef = useRef(null)

  const chapters = useMemo(() => book?.chapters ?? [], [book])

  // Hörzeit zählen, solange ein Hörbuch geladen ist und läuft
  useEffect(() => {
    if (!book) return
    const t = startTracking('listen', book, () => audioRef.current && !audioRef.current.paused)
    return () => t.stop()
  }, [book?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Endzeit (Sekunden) des Kapitels, das gerade läuft
  const currentChapterEnd = useCallback(() => {
    const a = audioRef.current, chs = bookRef.current?.chapters ?? []
    const t = a?.currentTime ?? 0
    const next = chs.find(c => c.start > t + 0.5)
    return next ? next.start : (a?.duration ?? Infinity)
  }, [])

  // ---- Speichern ----
  const persist = useCallback(() => {
    const a = audioRef.current, b = bookRef.current
    if (!a || !b || !isFinite(a.duration) || !a.duration) return
    const idx = chapterIndexAt(b.chapters ?? [], a.currentTime)
    lastSave.current = Date.now()
    return saveProgress(b.id, {
      position: a.currentTime,
      fraction: a.currentTime / a.duration,
      chapter: b.chapters?.[idx]?.title ?? '',
    })
  }, [])

  // ---- Hörbuch laden ----
  const load = useCallback(async (id) => {
    if (bookRef.current?.id === id) return
    if (loadingRef.current === id) return
    loadingRef.current = id
    const a = audioRef.current
    if (bookRef.current) { persist(); a.pause() }

    const [b, file, progress, cover] = await Promise.all([getBook(id), getFile(id), getProgress(id), getCover(id)])
    loadingRef.current = null
    if (!b || !file) throw new Error('Hörbuch nicht gefunden.')

    if (a.src) URL.revokeObjectURL(a.src)
    bookRef.current = b
    lastChapter.current = -1
    setBook(b)
    setSleep(null)
    setCoverUrl(old => { if (old) URL.revokeObjectURL(old); return cover ? URL.createObjectURL(cover) : null })
    updateBook(id, { lastOpenedAt: Date.now() })

    a.src = URL.createObjectURL(file)
    a.load()
    const start = progress?.position ?? 0
    await new Promise(resolve => a.addEventListener('loadedmetadata', resolve, { once: true }))
    // kurz vor das Ende gerutscht? → von vorne
    a.currentTime = start < (a.duration || Infinity) - 5 ? start : 0
    a.playbackRate = a.defaultPlaybackRate = getSettings().playbackRate
    setTime({ position: a.currentTime, duration: a.duration })
    lastSave.current = Date.now() // nicht sofort wieder speichern (Position ist unverändert)

    const artworkUrl = cover ? await session.blobToDataUrl(cover) : null
    session.setMetadata({ title: b.title, artist: b.author, album: '', artworkUrl, artworkType: cover?.type })
    session.setPosition(a)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persist])

  // ---- Steuerung ----
  const play = useCallback(() => audioRef.current?.play().catch(err => console.warn(err)), [])
  const pause = useCallback(() => audioRef.current?.pause(), [])
  const toggle = useCallback(() => (audioRef.current?.paused ? play() : pause()), [play, pause])
  const seekTo = useCallback(t => {
    const a = audioRef.current
    if (!a || !isFinite(a.duration)) return
    a.currentTime = Math.max(0, Math.min(a.duration - 0.5, t))
    setTime({ position: a.currentTime, duration: a.duration })
  }, [])
  const seekBy = useCallback(d => seekTo((audioRef.current?.currentTime ?? 0) + d), [seekTo])
  const setRate = useCallback(r => {
    const a = audioRef.current
    if (a) a.playbackRate = a.defaultPlaybackRate = r
    setRateState(r)
    updateSettings({ playbackRate: r })
  }, [])
  const goToChapter = useCallback(i => {
    const ch = bookRef.current?.chapters?.[i]
    if (ch) seekTo(ch.start)
  }, [seekTo])

  const setSleep = useCallback(opt => {
    // opt: null | { minutes: 15 } | { chapter: true }
    const value = !opt ? null
      : opt.chapter ? { kind: 'chapter', end: currentChapterEnd() }
      : { kind: 'minutes', endsAt: Date.now() + opt.minutes * 60_000 }
    sleepRef.current = value
    setSleepState(value)
  }, [])

  const close = useCallback(() => {
    const a = audioRef.current
    persist()
    a.pause()
    if (a.src) URL.revokeObjectURL(a.src)
    a.removeAttribute('src')
    a.load()
    bookRef.current = null
    setBook(null)
    setSleep(null)
    session.clearSession()
  }, [persist, setSleep])

  // ---- Ereignisse des <audio>-Elements ----
  useEffect(() => {
    const a = audioRef.current

    const onTime = () => {
      const b = bookRef.current
      if (!b) return
      setTime({ position: a.currentTime, duration: a.duration })
      if (Date.now() - lastSave.current > 5000) persist()

      // Kapitel für den Sperrbildschirm aktualisieren
      const idx = chapterIndexAt(b.chapters ?? [], a.currentTime)
      if (idx !== lastChapter.current && b.chapters?.length) {
        lastChapter.current = idx
        if (navigator.mediaSession?.metadata) navigator.mediaSession.metadata.album = b.chapters[idx].title
      }

      // Sleep-Timer prüfen
      const s = sleepRef.current
      if (s?.kind === 'minutes' && Date.now() >= s.endsAt) {
        a.pause(); setSleep(null)
      } else if (s?.kind === 'chapter' && a.currentTime >= s.end - 0.3) {
        a.pause(); setSleep(null)
      }
    }
    const onPlay = () => { setPlaying(true); session.setPlaybackState(true); session.setPosition(a) }
    // Pause → Position speichern und sofort an Hardcover (ohne Minuten-Regel)
    const onPause = () => {
      setPlaying(false); session.setPlaybackState(false)
      const id = bookRef.current?.id
      Promise.resolve(persist()).then(() => id && pushNow(id))
    }
    const onEnded = () => { onPause(); setSleep(null) }
    const onPos = () => session.setPosition(a)
    const onSeeked = () => {
      onPos()
      // Sleep-Timer "Kapitelende": nach einem Sprung gilt das neue Kapitel
      if (sleepRef.current?.kind === 'chapter') {
        sleepRef.current = { kind: 'chapter', end: currentChapterEnd() }
        setSleepState(sleepRef.current)
      }
    }
    const onHide = () => { if (document.visibilityState === 'hidden') persist() }

    a.addEventListener('timeupdate', onTime)
    a.addEventListener('play', onPlay)
    a.addEventListener('pause', onPause)
    a.addEventListener('ended', onEnded)
    a.addEventListener('seeked', onSeeked)
    a.addEventListener('ratechange', onPos)
    document.addEventListener('visibilitychange', onHide)
    addEventListener('pagehide', persist)

    session.setHandlers({
      play: () => play(),
      pause: () => pause(),
      stop: () => pause(),
      seekbackward: d => seekBy(-(d?.seekOffset || SKIP_SECONDS)),
      seekforward: d => seekBy(d?.seekOffset || SKIP_SECONDS),
      seekto: d => { if (d?.seekTime != null) seekTo(d.seekTime) },
    })

    return () => {
      a.removeEventListener('timeupdate', onTime)
      a.removeEventListener('play', onPlay)
      a.removeEventListener('pause', onPause)
      a.removeEventListener('ended', onEnded)
      a.removeEventListener('seeked', onSeeked)
      a.removeEventListener('ratechange', onPos)
      document.removeEventListener('visibilitychange', onHide)
      removeEventListener('pagehide', persist)
    }
  }, [persist, play, pause, seekBy, seekTo, setSleep, currentChapterEnd])

  // Countdown des Sleep-Timers jede Sekunde neu anzeigen
  useEffect(() => {
    if (sleep?.kind !== 'minutes') return
    const t = setInterval(() => {
      forceTick(n => n + 1)
      if (Date.now() >= sleep.endsAt) { audioRef.current?.pause(); setSleep(null) }
    }, 1000)
    return () => clearInterval(t)
  }, [sleep, setSleep])

  const controls = useMemo(() => ({
    book, chapters, coverUrl, playing, rate, sleep,
    load, play, pause, toggle, seekTo, seekBy, setRate, goToChapter, setSleep, close,
  }), [book, chapters, coverUrl, playing, rate, sleep, load, play, pause, toggle, seekTo, seekBy, setRate, goToChapter, setSleep, close])

  return (
    <AudioCtx.Provider value={controls}>
      <TimeCtx.Provider value={time}>
        {children}
        <audio ref={audioRef} preload="metadata" playsInline />
      </TimeCtx.Provider>
    </AudioCtx.Provider>
  )
}
