// EPUB-Reader: zeigt das Buch mit foliate-js an und steuert Blättern,
// Fortschritt, Inhaltsverzeichnis, Lesezeichen, Suche und Einstellungen.
import { useCallback, useEffect, useRef, useState } from 'react'
import { getBook, getFile, updateBook, listBookmarks, addBookmark, deleteBookmark, newId } from '../db/db.js'
import { saveProgress, getProgress } from '../services/progress.js'
import { useSettings, MARGINS } from '../settings/settings.js'
import { navigate } from '../lib/router.js'
import { percent } from '../lib/format.js'
import { bookCss } from './bookStyles.js'
import Icon from '../components/Icon.jsx'
import TocPanel from './TocPanel.jsx'
import SearchPanel from './SearchPanel.jsx'
import BookmarksPanel from './BookmarksPanel.jsx'
import SettingsPanel from './SettingsPanel.jsx'
import SyncOffer from '../components/SyncOffer.jsx'
import { checkForNewerPosition, noteBookmarkDeleted, scheduleSync } from '../services/sync/sync.js'

export default function Reader({ id }) {
  const containerRef = useRef()
  const viewRef = useRef()
  const settings = useSettings()
  const settingsRef = useRef(settings)
  settingsRef.current = settings

  const [meta, setMeta] = useState(null)
  const [error, setError] = useState(null)
  const [ready, setReady] = useState(false)
  const [loc, setLoc] = useState(null)        // aktuelle Position
  const [toc, setToc] = useState([])
  const [panel, setPanel] = useState(null)    // 'toc' | 'search' | 'bookmarks' | 'settings'
  const [chrome, setChrome] = useState(true)  // Leisten oben/unten sichtbar?
  const [bookmarks, setBookmarks] = useState([])
  const [cfiLib, setCfiLib] = useState(null)
  const searchState = useRef({ query: '', results: [] })
  const [offer, setOffer] = useState(null)   // anderes Gerät war woanders
  const offerRef = useRef(null)

  // ---- Buch laden ----
  useEffect(() => {
    let alive = true
    let view
    let saveTimer

    async function open() {
      const [book, blob, progress] = await Promise.all([getBook(id), getFile(id), getProgress(id)])
      if (!book || !blob) throw new Error('Buch nicht gefunden.')
      if (!alive) return
      // Gleich im Hintergrund nachsehen, ob ein anderes Gerät woanders ist
      const offerPromise = checkForNewerPosition(id, progress ?? null).catch(() => null)
      setMeta(book)
      updateBook(id, { lastOpenedAt: Date.now() })
      setBookmarks(await listBookmarks(id))

      const [, CFI] = await Promise.all([
        import('../vendor/foliate-js/view.js'),
        import('../vendor/foliate-js/epubcfi.js'),
      ])
      if (!alive) return
      setCfiLib(CFI)

      view = document.createElement('foliate-view')
      viewRef.current = view
      containerRef.current.append(view)
      // foliate-js braucht einen Dateinamen → Blob in File verpacken
      await view.open(new File([blob], book.fileName || 'book.epub', { type: 'application/epub+zip' }))
      if (!alive) return
      applySettings(view, settingsRef.current)

      view.addEventListener('relocate', e => {
        const d = e.detail
        const range = d.range
        let startCfi = d.cfi, endCfi = d.cfi
        try {
          const index = d.section?.current
          if (range && index != null) {
            const s = range.cloneRange(); s.collapse(true)
            const en = range.cloneRange(); en.collapse(false)
            startCfi = view.getCFI(index, s)
            endCfi = view.getCFI(index, en)
          }
        } catch { /* egal */ }
        const next = {
          fraction: d.fraction ?? 0,
          chapter: d.tocItem?.label?.trim() ?? '',
          tocHref: d.tocItem?.href,
          cfi: d.cfi,
          startCfi, endCfi,
          minutesLeftInChapter: d.time?.section,
          excerpt: range?.toString().trim().replace(/\s+/g, ' ').slice(0, 140) ?? '',
        }
        setLoc(next)
        // Fortschritt speichern (gebündelt, nicht bei jedem Scrollschritt)
        clearTimeout(saveTimer)
        saveTimer = setTimeout(() => saveProgress(id, {
          fraction: next.fraction, cfi: next.cfi, chapter: next.chapter,
        }), 800)
      })

      view.addEventListener('load', e => attachPageHandlers(e.detail.doc))

      // Ohne gespeicherten Stand: am Anfang des eigentlichen Textes beginnen
      await view.init({ lastLocation: progress?.cfi, showTextStart: true })
      setToc(view.book.toc ?? [])
      setReady(true)

      const o = await offerPromise
      if (!alive) { o?.release(); return }
      offerRef.current = o
      setOffer(o)
      setBookmarks(await listBookmarks(id)) // evtl. neue Lesezeichen von anderen Geräten
    }

    open().catch(err => { console.error(err); if (alive) setError(err.message || String(err)) })

    return () => {
      alive = false
      clearTimeout(saveTimer)
      offerRef.current?.release()
      offerRef.current = null
      scheduleSync(1500)
      view?.close()
      view?.remove()
      viewRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // ---- Einstellungen anwenden, wenn sie sich ändern ----
  useEffect(() => {
    if (ready && viewRef.current) applySettings(viewRef.current, settings)
  }, [settings, ready])

  // ---- Tippen auf die Seite: links/rechts blättern, Mitte = Leisten ein/aus ----
  const attachPageHandlers = useCallback(doc => {
    doc.addEventListener('click', e => {
      if (e.defaultPrevented || e.target.closest?.('a[href]')) return
      if (!doc.getSelection()?.isCollapsed) return
      const frame = doc.defaultView.frameElement
      const x = (frame?.getBoundingClientRect().left ?? 0) + e.clientX
      const w = window.innerWidth
      const view = viewRef.current
      if (settingsRef.current.flow === 'paginated' && x < w * 0.28) view?.goLeft()
      else if (settingsRef.current.flow === 'paginated' && x > w * 0.72) view?.goRight()
      else setChrome(c => !c)
    })
    doc.addEventListener('keydown', onKey)
  }, [])

  // ---- Tastatur (Mac) ----
  const onKey = useCallback(e => {
    const view = viewRef.current
    if (!view || e.target.closest?.('input, textarea')) return
    if (['ArrowLeft', 'PageUp'].includes(e.key)) view.goLeft()
    else if (['ArrowRight', 'PageDown', ' '].includes(e.key)) { e.preventDefault?.(); view.goRight() }
  }, [])
  useEffect(() => {
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [onKey])

  // ---- Lesezeichen ----
  const current = cfiLib && loc && bookmarks.find(b =>
    cfiLib.compare(b.cfi, loc.startCfi) >= 0 && cfiLib.compare(b.cfi, loc.endCfi) <= 0)

  async function toggleBookmark() {
    if (!loc) return
    if (current) { await deleteBookmark(current.id); noteBookmarkDeleted(current.id) }
    else await addBookmark({
      id: newId(), bookId: id, cfi: loc.startCfi, label: loc.chapter,
      excerpt: loc.excerpt, fraction: loc.fraction, createdAt: Date.now(),
    })
    setBookmarks(await listBookmarks(id))
    scheduleSync(2000)
  }
  async function removeBookmark(bm) {
    await deleteBookmark(bm.id)
    noteBookmarkDeleted(bm.id)
    setBookmarks(await listBookmarks(id))
  }

  function answerOffer(jump) {
    const o = offerRef.current
    if (jump && o) {
      if (o.remote.cfi) viewRef.current?.goTo(o.remote.cfi)
      else viewRef.current?.goToFraction(o.remote.fraction ?? 0)
    }
    o?.release()
    offerRef.current = null
    setOffer(null)
  }

  const goTo = target => { viewRef.current?.goTo(target); setPanel(null) }
  const closePanel = useCallback(() => setPanel(null), [])

  return (
    <div className={`reader ${chrome ? 'chrome-visible' : 'chrome-hidden'}`}>
      <header className="reader-bar reader-top">
        <button className="icon-btn" onClick={() => navigate('/')} aria-label="Zur Bibliothek"><Icon name="back" /></button>
        <div className="reader-title">{meta?.title}</div>
        <button className="icon-btn" onClick={() => setPanel('toc')} aria-label="Inhalt"><Icon name="list" /></button>
        <button className="icon-btn" onClick={() => setPanel('search')} aria-label="Suchen"><Icon name="search" /></button>
        <button className="icon-btn" onClick={() => setPanel('bookmarks')} aria-label="Lesezeichen-Liste"><Icon name="bookmark" /></button>
        <button className="icon-btn" onClick={() => setPanel('settings')} aria-label="Darstellung"><Icon name="text" /></button>
      </header>

      <button className={`bookmark-ribbon ${current ? 'active' : ''}`} onClick={toggleBookmark}
        aria-label={current ? 'Lesezeichen entfernen' : 'Lesezeichen setzen'} disabled={!ready}>
        <Icon name={current ? 'bookmarkFilled' : 'bookmark'} />
      </button>

      {offer && <SyncOffer offer={offer} onJump={() => answerOffer(true)} onStay={() => answerOffer(false)} />}

      <main className="reader-view" ref={containerRef}>
        {!ready && !error && <div className="reader-loading">Buch wird geöffnet …</div>}
        {error && <div className="reader-loading">Fehler: {error}</div>}
      </main>

      <footer className="reader-bar reader-bottom">
        {chrome && ready && (
          <input type="range" className="slider" min="0" max="1" step="0.001"
            value={loc?.fraction ?? 0} aria-label="Position im Buch"
            onChange={e => viewRef.current?.goToFraction(parseFloat(e.target.value))} />
        )}
        <div className="reader-status">
          <span className="reader-chapter">{loc?.chapter}</span>
          <span>
            {loc?.minutesLeftInChapter > 0.5 && chrome && <>noch {Math.round(loc.minutesLeftInChapter)} Min. im Kapitel · </>}
            {loc ? percent(loc.fraction) : ''}
          </span>
        </div>
      </footer>

      {panel === 'toc' && <TocPanel toc={toc} currentHref={loc?.tocHref} onSelect={goTo} onClose={closePanel} />}
      {panel === 'search' && <SearchPanel view={viewRef.current} state={searchState.current} onSelect={goTo} onClose={closePanel} />}
      {panel === 'bookmarks' && <BookmarksPanel bookmarks={bookmarks} onSelect={goTo} onDelete={removeBookmark} onClose={closePanel} />}
      {panel === 'settings' && <SettingsPanel onClose={closePanel} />}
    </div>
  )
}

function applySettings(view, s) {
  const r = view.renderer
  if (!r) return
  const m = MARGINS[s.margin] ?? MARGINS.medium
  r.setAttribute('flow', s.flow)
  r.setAttribute('gap', m.gap)
  r.setAttribute('margin', m.margin)
  r.setAttribute('max-inline-size', '720px')
  r.setAttribute('max-column-count', '2')
  r.setStyles?.(bookCss(s))
}
