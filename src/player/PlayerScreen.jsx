// Vollbild-Player für Hörbücher
import { useEffect, useRef, useState } from 'react'
import { useAudio, useAudioTime, chapterIndexAt, SKIP_SECONDS } from './AudioProvider.jsx'
import { navigate } from '../lib/router.js'
import { clock, duration as fmtDuration, percent } from '../lib/format.js'
import Icon from '../components/Icon.jsx'
import Sheet from '../components/Sheet.jsx'
import Cover from '../components/Cover.jsx'
import SyncOffer from '../components/SyncOffer.jsx'
import { checkForNewerPosition } from '../services/sync/sync.js'
import { getProgress } from '../services/progress.js'
import CarMode from './CarMode.jsx'
import NotebookPanel from '../reader/NotebookPanel.jsx'
import HighlightSheet from '../reader/HighlightSheet.jsx'
import { useCategories, listHighlights, createHighlight, removeHighlight } from '../services/highlights.js'
import { useSyncState } from '../services/sync/sync.js'
import HardcoverLinkSheet, { HardcoverLinkBanner } from '../components/HardcoverLink.jsx'
import { useHardcover, needsLink, linkBook, flushBook } from '../services/hardcover/hardcover.js'
import { getBook } from '../db/db.js'

const RATES = [0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.5, 1.75, 2]
const SLEEP_OPTIONS = [5, 15, 30, 45, 60, 90]

export default function PlayerScreen({ id }) {
  const audio = useAudio()
  const { position, duration } = useAudioTime()
  const [error, setError] = useState(null)
  const [panel, setPanel] = useState(null) // 'chapters' | 'rate' | 'sleep'
  const [scrub, setScrub] = useState(null)  // Position während des Ziehens
  const [car, setCar] = useState(false)     // Autofahr-Modus
  const categories = useCategories()
  const [marks, setMarks] = useState([])    // Hörbuch-Markierungen
  const [hlSheet, setHlSheet] = useState(null)
  const sync = useSyncState()
  const reloadMarks = () => listHighlights(id).then(setMarks)
  const hc = useHardcover()
  const [hcBook, setHcBook] = useState(null)     // aktueller Buch-Eintrag (für die Verknüpfung)
  const [hcLink, setHcLink] = useState(false)
  useEffect(() => { getBook(id).then(setHcBook) }, [id, sync.dataVersion])
  useEffect(() => () => flushBook(id), [id])
  useEffect(() => { reloadMarks() }, [id, sync.dataVersion]) // eslint-disable-line react-hooks/exhaustive-deps

  // Anderes Gerät an anderer Stelle? Den lokalen Stand VOR dem Laden merken,
  // dann im Hintergrund nachsehen.
  const [offer, setOffer] = useState(null)
  const offerRef = useRef(null)
  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; offerRef.current?.release(); offerRef.current = null }
  }, [])
  const checked = useRef(false)
  useEffect(() => {
    if (checked.current) return
    checked.current = true
    getProgress(id)
      .then(baseline => checkForNewerPosition(id, baseline ?? null))
      .then(o => {
        if (!mounted.current) return o?.release()
        offerRef.current = o
        setOffer(o)
      }).catch(() => {})
  }, [id])

  useEffect(() => {
    audio.load(id).catch(err => setError(err.message || String(err)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const book = audio.book?.id === id ? audio.book : null

  function answerOffer(jump) {
    if (jump && offerRef.current) audio.seekTo(offerRef.current.remote.position ?? 0)
    offerRef.current?.release()
    offerRef.current = null
    setOffer(null)
  }
  const chapters = book ? audio.chapters : []
  const pos = scrub ?? position
  const idx = chapterIndexAt(chapters, pos)
  const chapter = chapters[idx]
  const chStart = chapter?.start ?? 0
  const chEnd = chapters[idx + 1]?.start ?? duration
  const chLen = Math.max(1, chEnd - chStart)
  const remainingTotal = (duration - pos) / (audio.rate || 1)

  // Aktuelle Stelle markieren (kurz zurück, damit der Moment nicht schon vorbei ist)
  async function markHere(openSheet) {
    if (!book) return false
    const at = Math.max(0, position - 3)
    const cat = categories.find(c => c.id === 'other') ?? categories.at(-1)
    const h = await createHighlight({
      bookId: id, position: at, fraction: duration ? at / duration : 0,
      chapter: chapters[chapterIndexAt(chapters, at)]?.title ?? '', text: '', catId: cat?.id,
    })
    await reloadMarks()
    if (openSheet) setHlSheet({ h })
    return true
  }
  async function deleteMark(h) {
    if (!confirm('Markierung löschen?')) return
    await removeHighlight(h)
    setHlSheet(null)
    reloadMarks()
  }

  const sleepLabel = !audio.sleep ? null
    : audio.sleep.kind === 'chapter' ? 'Kapitelende'
    : clock((audio.sleep.endsAt - Date.now()) / 1000)

  return (
    <div className="player">
      <header className="player-top">
        <button className="icon-btn" onClick={() => navigate('/')} aria-label="Zur Bibliothek"><Icon name="back" /></button>
        <span className="player-top-title">Hörbuch</span>
        <div className="player-top-actions">
          <button className="icon-btn" onClick={() => setCar(true)} aria-label="Autofahr-Modus" title="Autofahr-Modus" disabled={!book}>
            <Icon name="car" />
          </button>
          <button className="icon-btn" onClick={() => setPanel('notebook')} aria-label="Notizbuch: Markierungen und Bilder" title="Notizbuch">
            <Icon name="notebook" />
          </button>
          <button className="icon-btn" onClick={() => setPanel('chapters')} aria-label="Kapitel" disabled={!chapters.length}>
            <Icon name="list" />
          </button>
        </div>
      </header>

      {error && <p className="notice notice-error">{error}</p>}
      {hcBook && !offer && needsLink(hcBook) && hc.user && !hcLink && (
        <HardcoverLinkBanner onLink={() => setHcLink(true)}
          onSkip={async () => setHcBook({ ...hcBook, hardcover: await linkBook(id, null) })} />
      )}
      {hcLink && hcBook && (
        <HardcoverLinkSheet book={hcBook} onClose={() => setHcLink(false)}
          onDone={() => getBook(id).then(setHcBook)} />
      )}
      {offer && <SyncOffer offer={offer} audio onJump={() => answerOffer(true)} onStay={() => answerOffer(false)} />}

      {book && (
        <div className="player-body">
          <div className="player-cover"><Cover book={book} /></div>

          <div className="player-info">
            <h1>{book.title}</h1>
            {book.author && <p className="muted">{book.author}</p>}
            {chapter && <p className="player-chapter">{chapter.title}</p>}
          </div>

          <div className="player-scrub">
            <input type="range" className="slider" min={chStart} max={chEnd} step="1" value={pos}
              aria-label="Position im Kapitel"
              onChange={e => setScrub(parseFloat(e.target.value))}
              onPointerUp={() => { if (scrub != null) { audio.seekTo(scrub); setScrub(null) } }}
              onKeyUp={() => { if (scrub != null) { audio.seekTo(scrub); setScrub(null) } }}
              onTouchEnd={() => { if (scrub != null) { audio.seekTo(scrub); setScrub(null) } }} />
            <div className="player-times">
              <span>{clock(pos - chStart)}</span>
              <span>-{clock(chLen - (pos - chStart))}</span>
            </div>
            <p className="player-total muted">
              {percent(duration ? pos / duration : 0)} · noch {fmtDuration(remainingTotal)}
            </p>
          </div>

          <div className="player-controls">
            <button className="icon-btn" onClick={() => audio.goToChapter(pos - chStart > 3 ? idx : idx - 1)}
              aria-label="Kapitelanfang / voriges Kapitel" disabled={!chapters.length}><Icon name="prevChapter" size={24} /></button>
            <button className="icon-btn big" onClick={() => audio.seekBy(-SKIP_SECONDS)} aria-label="30 Sekunden zurück"><Icon name="back30" size={36} /></button>
            <button className="play-btn" onClick={audio.toggle} aria-label={audio.playing ? 'Pause' : 'Abspielen'}>
              <Icon name={audio.playing ? 'pause' : 'play'} size={34} />
            </button>
            <button className="icon-btn big" onClick={() => audio.seekBy(SKIP_SECONDS)} aria-label="30 Sekunden vor"><Icon name="fwd30" size={36} /></button>
            <button className="icon-btn" onClick={() => audio.goToChapter(idx + 1)}
              aria-label="Nächstes Kapitel" disabled={idx >= chapters.length - 1}><Icon name="nextChapter" size={24} /></button>
          </div>

          <div className="player-extras">
            <button className="btn" onClick={() => setPanel('rate')}>{audio.rate.toLocaleString('de-DE')}×</button>
            <button className="btn" onClick={() => markHere(true)}><Icon name="bookmark" size={16} /> Markieren</button>
            <button className={`btn ${audio.sleep ? 'btn-active' : ''}`} onClick={() => setPanel('sleep')}>
              <Icon name="moon" size={16} /> {sleepLabel ?? 'Sleep-Timer'}
            </button>
          </div>
        </div>
      )}

      {panel === 'chapters' && (
        <Sheet title="Kapitel" onClose={() => setPanel(null)}>
          <ul className="toc-list">
            {chapters.map((c, i) => (
              <li key={i}>
                <button className={`toc-item chapter-row ${i === idx ? 'current' : ''}`}
                  onClick={() => { audio.goToChapter(i); setPanel(null) }}>
                  <span>{c.title}</span>
                  <span className="muted">{clock(c.start)}</span>
                </button>
              </li>
            ))}
          </ul>
        </Sheet>
      )}

      {panel === 'notebook' && (
        <NotebookPanel bookId={id} tabs={['highlights', 'images']} highlights={marks} categories={categories}
          onSelect={t => { if (typeof t === 'number') audio.seekTo(t); setPanel(null) }}
          onOpenHighlight={h => { setPanel(null); setHlSheet({ h }) }} onClose={() => setPanel(null)} />
      )}
      {hlSheet && (
        <HighlightSheet key={hlSheet.h.id} highlight={hlSheet.h} categories={categories}
          onChange={() => reloadMarks()} onDelete={deleteMark}
          onPlay={h => { audio.seekTo(h.position); if (!audio.playing) audio.play(); setHlSheet(null) }}
          onClose={() => setHlSheet(null)} />
      )}
      {car && <CarMode onMark={() => markHere(false)} onClose={() => setCar(false)} />}

      {panel === 'rate' && (
        <Sheet title="Geschwindigkeit" onClose={() => setPanel(null)}>
          <div className="option-grid">
            {RATES.map(r => (
              <button key={r} className={audio.rate === r ? 'active' : ''}
                onClick={() => { audio.setRate(r); setPanel(null) }}>
                {r.toLocaleString('de-DE')}×
              </button>
            ))}
          </div>
        </Sheet>
      )}

      {panel === 'sleep' && (
        <Sheet title="Sleep-Timer" onClose={() => setPanel(null)}>
          <div className="option-grid">
            {SLEEP_OPTIONS.map(m => (
              <button key={m} onClick={() => { audio.setSleep({ minutes: m }); setPanel(null) }}>{m} Min.</button>
            ))}
            <button disabled={!chapters.length} onClick={() => { audio.setSleep({ chapter: true }); setPanel(null) }}>Ende des Kapitels</button>
            {audio.sleep && <button className="danger" onClick={() => { audio.setSleep(null); setPanel(null) }}>Timer aus</button>}
          </div>
        </Sheet>
      )}
    </div>
  )
}
