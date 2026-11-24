// EPUB-Reader: zeigt das Buch mit foliate-js an und steuert Blättern,
// Fortschritt, Inhaltsverzeichnis, Lesezeichen, Suche und Einstellungen.
import { useCallback, useEffect, useRef, useState } from 'react'
import { getBook, getFile, updateBook, listBookmarks, addBookmark, deleteBookmark, newId } from '../db/db.js'
import { saveProgress, getProgress } from '../services/progress.js'
import { useSettings, useSystemDark, activeScheme, pageTheme, schemeVars, schemeFromPage, MARGINS } from '../settings/settings.js'
import { navigate } from '../lib/router.js'
import { percent } from '../lib/format.js'
import { bookCss } from './bookStyles.js'
import Icon from '../components/Icon.jsx'
import TocPanel from './TocPanel.jsx'
import SearchPanel from './SearchPanel.jsx'
import SettingsPanel from './SettingsPanel.jsx'
import NotebookPanel from './NotebookPanel.jsx'
import HighlightSheet from './HighlightSheet.jsx'
import { SelectionBar, ReactBar } from './HighlightBar.jsx'
import SyncOffer from '../components/SyncOffer.jsx'
import { checkForNewerPosition, noteBookmarkDeleted, scheduleSync, useSyncState } from '../services/sync/sync.js'
import { startTracking } from '../services/stats.js'
import HardcoverLinkSheet, { HardcoverLinkBanner } from '../components/HardcoverLink.jsx'
import { useHardcover, needsLink, linkBook, pushNow } from '../services/hardcover/hardcover.js'
import { useCategories, colorOf, listHighlights, createHighlight, updateHighlight, removeHighlight } from '../services/highlights.js'

export default function Reader({ id }) {
  const containerRef = useRef()
  const viewRef = useRef()
  const settings = useSettings()
  const settingsRef = useRef(settings)
  settingsRef.current = settings
  const systemDark = useSystemDark()
  const scheme = activeScheme(settings, systemDark)
  const page = pageTheme(settings, scheme)        // Farben der Buchseite
  const pageRef = useRef(page)
  pageRef.current = page

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
  const [edge, setEdge] = useState(null)     // Scroll-Modus: 'end' / 'start' eines Kapitels erreicht

  // Markierungen
  const categories = useCategories()
  const categoriesRef = useRef(categories)
  categoriesRef.current = categories
  const [highlights, setHighlights] = useState([])
  const highlightsRef = useRef([])
  highlightsRef.current = highlights
  const [selection, setSelection] = useState(null)   // { index, range, doc, text }
  const [reactFor, setReactFor] = useState(null)     // gerade erstellte Markierung (Reaktions-Leiste)
  const [hlSheet, setHlSheet] = useState(null)       // { h, note } – Markierung bearbeiten
  const [notebookTab, setNotebookTab] = useState('highlights')
  const annotationTapped = useRef(false)
  // Zurück nach einem Sprung (Link, Inhaltsverzeichnis, Suche …)
  const [canJumpBack, setCanJumpBack] = useState(false)
  const jumping = useRef(false)
  const sync = useSyncState()
  const tracker = useRef(null)   // Lesezeit
  const hc = useHardcover()
  const [hcLink, setHcLink] = useState(false)   // Auswahl-Fenster offen

  // ---- Buch laden ----
  useEffect(() => {
    let alive = true
    let view
    let saveTimer
    let pendingSave = null   // noch nicht gespeicherte Position
    // Offene Position sofort speichern und an Hardcover senden
    const leave = async () => {
      clearTimeout(saveTimer)
      if (pendingSave) { const p = pendingSave; pendingSave = null; await saveProgress(id, p) }
      pushNow(id)
    }
    const onHide = () => { if (document.visibilityState === 'hidden') leave() }
    document.addEventListener('visibilitychange', onHide)
    addEventListener('pagehide', leave)

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
      applySettings(view, settingsRef.current, pageRef.current)

      // ---- Markierungen zeichnen ----
      const { Overlayer } = await import('../vendor/foliate-js/overlayer.js')
      view.addEventListener('draw-annotation', e => {
        const { draw, annotation } = e.detail
        draw(Overlayer.highlight, { color: annotation.color })
      })
      // Kapitel geladen → seine Markierungen einzeichnen
      view.addEventListener('create-overlay', e => {
        for (const h of highlightsRef.current)
          if (view.resolveNavigation(h.cfi)?.index === e.detail.index) view.addAnnotation(annotationFor(h))
      })
      view.addEventListener('show-annotation', e => {
        const h = highlightsRef.current.find(x => x.cfi === e.detail.value)
        if (!h) return
        annotationTapped.current = true
        setHlSheet({ h })
      })
      // Sprünge merken → "Zurück"-Knopf
      view.addEventListener('link', () => markJump())
      view.history.addEventListener('index-change', () => {
        if (!view.history.canGoBack) setCanJumpBack(false)
      })
      const hls = await listHighlights(id)
      highlightsRef.current = hls
      setHighlights(hls)

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
        setEdge(scrollEdge(view))
        tracker.current?.activity()
        // Fortschritt speichern (gebündelt, nicht bei jedem Scrollschritt)
        clearTimeout(saveTimer)
        pendingSave = { fraction: next.fraction, cfi: next.cfi, chapter: next.chapter }
        saveTimer = setTimeout(() => { const p = pendingSave; pendingSave = null; if (p) saveProgress(id, p) }, 800)
      })

      view.addEventListener('load', e => attachPageHandlers(e.detail.doc))
      // Mausrad/Trackpad über dem Rand neben dem Text
      view.addEventListener('wheel', onWheel, { passive: true })

      // Ohne gespeicherten Stand: am Anfang des eigentlichen Textes beginnen
      await view.init({ lastLocation: progress?.cfi, showTextStart: true })
      if (!alive) return
      tracker.current = startTracking('read', book)
      setToc(view.book.toc ?? [])
      setReady(true)

      const o = await offerPromise
      if (!alive) { o?.release(); return }
      offerRef.current = o
      setOffer(o)
      setBookmarks(await listBookmarks(id)) // evtl. neue Lesezeichen von anderen Geräten
      reloadHighlights()
    }

    open().catch(err => { console.error(err); if (alive) setError(err.message || String(err)) })

    return () => {
      alive = false
      document.removeEventListener('visibilitychange', onHide)
      removeEventListener('pagehide', leave)
      offerRef.current?.release()
      offerRef.current = null
      tracker.current?.stop()
      tracker.current = null
      leave()  // Buch verlassen → Position speichern und sofort an Hardcover
      scheduleSync(1500)
      view?.close()
      view?.remove()
      viewRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // ---- Einstellungen anwenden, wenn sie sich ändern ----
  useEffect(() => {
    if (ready && viewRef.current) applySettings(viewRef.current, settings, page)
  }, [settings, ready, page.bg, page.fg, page.link]) // eslint-disable-line react-hooks/exhaustive-deps

  // Statusleiste in Seitenfarbe
  useEffect(() => {
    document.documentElement.style.setProperty('--status-bg', page.bg)
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', page.bg)
    return () => {
      document.documentElement.style.removeProperty('--status-bg')
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', getComputedStyle(document.documentElement).getPropertyValue('--bg').trim())
    }
  }, [page.bg])

  // ---- Tippen auf die Seite: links/rechts blättern, Mitte = Leisten ein/aus ----
  const attachPageHandlers = useCallback(doc => {
    doc.addEventListener('click', e => {
      if (e.defaultPrevented || e.target.closest?.('a[href]')) return
      if (!doc.getSelection()?.isCollapsed) return
      const frame = doc.defaultView.frameElement
      const rect = frame?.getBoundingClientRect()
      const x = (rect?.left ?? 0) + e.clientX
      const y = (rect?.top ?? 0) + e.clientY
      const w = window.innerWidth, hgt = window.innerHeight
      // Blättern nur an den schmalen Rändern links/rechts (je 20 %) – die ganze
      // Mitte und die Streifen oben/unten blenden nur die Leisten ein/aus
      const edgeBand = y < hgt * 0.18 || y > hgt * 0.82
      // Kurz warten: Tippen auf eine Markierung öffnet diese statt zu blättern
      annotationTapped.current = false
      setTimeout(() => {
        if (annotationTapped.current) return
        const view = viewRef.current
        if (settingsRef.current.flow === 'paginated' && !edgeBand && x < w * 0.2) view?.goLeft()
        else if (settingsRef.current.flow === 'paginated' && !edgeBand && x > w * 0.8) view?.goRight()
        else setChrome(c => !c)
      }, 0)
    })
    // Text markiert → Leiste mit Kategorien zeigen
    let selTimer
    doc.addEventListener('selectionchange', () => {
      clearTimeout(selTimer)
      selTimer = setTimeout(() => {
        const sel = doc.getSelection()
        const text = sel?.toString().trim()
        if (!sel || sel.isCollapsed || !text) { setSelection(s => s?.doc === doc ? null : s); return }
        const index = viewRef.current?.renderer.getContents().find(c => c.doc === doc)?.index
        if (index == null) return
        setReactFor(null)
        setSelection({ index, range: sel.getRangeAt(0).cloneRange(), doc, text })
      }, 250)
    })
    doc.addEventListener('keydown', onKey)
    // Scroll-Modus: am Kapitelende weiterziehen → nächstes Kapitel
    doc.addEventListener('wheel', onWheel, { passive: true })
    doc.addEventListener('touchstart', onTouchStart, { passive: true })
    doc.addEventListener('pointerdown', () => tracker.current?.activity(), { passive: true })
    doc.addEventListener('touchend', onTouchEnd, { passive: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---- Scroll-Modus: Kapitelwechsel durch Weiterscrollen ----
  // foliate-js zeigt im Scroll-Modus immer nur ein Kapitel. Ist man an dessen
  // Ende (oder Anfang) und scrollt weiter, wird das nächste (vorige) geladen.
  const turning = useRef(false)
  const wheelSum = useRef(0)
  const wheelTimer = useRef(null)
  const touch = useRef(null)

  const turnSection = useCallback(async dir => {
    const view = viewRef.current
    if (!view || turning.current) return
    // Vor dem ersten bzw. nach dem letzten Kapitel gibt es nichts – foliate-js
    // würde sonst hängen bleiben.
    if (!hasAdjacentSection(view, dir)) return
    turning.current = true
    wheelSum.current = 0
    try { await (dir > 0 ? view.renderer.next() : view.renderer.prev()) }
    catch (err) { console.warn(err) }
    finally { setTimeout(() => { turning.current = false }, 500) }
  }, [])

  const onWheel = useCallback(e => {
    const view = viewRef.current
    if (settingsRef.current.flow !== 'scrolled' || !view) return
    const at = edgeOf(view.renderer)
    const dir = e.deltaY > 0 ? 1 : e.deltaY < 0 ? -1 : 0
    if (!dir || (dir > 0 && at !== 'end') || (dir < 0 && at !== 'start')) { wheelSum.current = 0; return }
    // erst nach einem deutlichen "Weiterdrücken" umschalten
    wheelSum.current += Math.abs(e.deltaY)
    clearTimeout(wheelTimer.current)
    wheelTimer.current = setTimeout(() => { wheelSum.current = 0 }, 400)
    if (wheelSum.current > 220) turnSection(dir)
  }, [turnSection])

  const onTouchStart = useCallback(e => {
    const view = viewRef.current
    if (settingsRef.current.flow !== 'scrolled' || !view) return
    touch.current = { y: e.touches[0]?.screenY ?? 0, at: edgeOf(view.renderer) }
  }, [])

  const onTouchEnd = useCallback(e => {
    const view = viewRef.current, t = touch.current
    touch.current = null
    if (!t || !view || settingsRef.current.flow !== 'scrolled') return
    const dy = t.y - (e.changedTouches[0]?.screenY ?? t.y) // > 0: nach oben gewischt (weiterlesen)
    const at = edgeOf(view.renderer)
    if (dy > 70 && t.at === 'end' && at === 'end') turnSection(1)
    else if (dy < -70 && t.at === 'start' && at === 'start') turnSection(-1)
  }, [turnSection])

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

  // ---- Markierungen ----
  function annotationFor(h) {
    const cat = categoriesRef.current.find(c => c.id === h.catId)
    return { value: h.cfi, color: colorOf(cat?.color).mark }
  }
  async function reloadHighlights() {
    const view = viewRef.current
    const fresh = await listHighlights(id)
    const old = highlightsRef.current
    // Weggefallene entfernen, alle anderen (neu) zeichnen
    for (const h of old) if (!fresh.some(f => f.cfi === h.cfi)) view?.deleteAnnotation({ value: h.cfi })
    highlightsRef.current = fresh
    setHighlights(fresh)
    for (const h of fresh) view?.addAnnotation(annotationFor(h))
  }
  // Farbe einer Kategorie geändert → neu zeichnen
  useEffect(() => {
    if (!ready) return
    for (const h of highlightsRef.current) viewRef.current?.addAnnotation(annotationFor(h))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories, ready])
  // Abgleich hat Daten geändert → neu laden
  useEffect(() => { if (ready) reloadHighlights() }, [sync.dataVersion]) // eslint-disable-line react-hooks/exhaustive-deps

  async function highlightSelection(cat) {
    const view = viewRef.current, s = selection
    if (!view || !s) return null
    const cfi = view.getCFI(s.index, s.range)
    const existing = highlightsRef.current.find(h => h.cfi === cfi)
    const h = existing
      ? await updateHighlight(existing, { catId: cat.id })
      : await createHighlight({
        bookId: id, cfi, text: s.text.replace(/\s+/g, ' ').slice(0, 2000), context: contextOf(s.range),
        chapter: loc?.chapter ?? '', fraction: loc?.fraction ?? null, catId: cat.id,
      })
    s.doc.getSelection()?.removeAllRanges()
    setSelection(null)
    const list = [...highlightsRef.current.filter(x => x.id !== h.id), h].sort((a, b) => (a.fraction ?? 0) - (b.fraction ?? 0))
    highlightsRef.current = list
    setHighlights(list)
    view.addAnnotation(annotationFor(h))
    return h
  }
  async function pickCategory(cat) {
    const h = await highlightSelection(cat)
    if (h) setReactFor(h)
  }
  async function noteFromSelection() {
    const cat = categoriesRef.current.find(c => c.id === 'other') ?? categoriesRef.current.at(-1)
    const h = await highlightSelection(cat)
    if (h) setHlSheet({ h, note: true })
  }
  function replaceHighlight(h) {
    const list = highlightsRef.current.map(x => x.id === h.id ? h : x)
    highlightsRef.current = list
    setHighlights(list)
    viewRef.current?.addAnnotation(annotationFor(h))
    setReactFor(r => r?.id === h.id ? h : r)
  }
  async function react(key) {
    const h = reactFor
    if (!h) return
    replaceHighlight(await updateHighlight(h, { reaction: h.reaction === key ? '' : key }))
  }
  async function deleteHl(h) {
    if (!confirm('Markierung löschen?')) return
    await removeHighlight(h)
    viewRef.current?.deleteAnnotation({ value: h.cfi })
    const list = highlightsRef.current.filter(x => x.id !== h.id)
    highlightsRef.current = list
    setHighlights(list)
    setHlSheet(null)
  }
  function searchFor(text) {
    searchState.current = { query: text.trim(), results: [], autoRun: true }
    setHlSheet(null)
    setPanel('search')
  }

  // ---- Sprünge & Zurück ----
  function markJump() {
    jumping.current = true
    setTimeout(() => {
      jumping.current = false
      if (viewRef.current?.history.canGoBack) setCanJumpBack(true)
    }, 400)
  }
  function jumpBack() {
    viewRef.current?.history.back()
    setCanJumpBack(false)
  }

  const goTo = target => { markJump(); viewRef.current?.goTo(target); setPanel(null) }
  const closePanel = useCallback(() => setPanel(null), [])

  return (
    <div className={`reader ${chrome ? 'chrome-visible' : 'chrome-hidden'}`}
      data-theme={page.dark ? 'dark' : 'light'}
      style={settings.theme === 'scheme' ? undefined : schemeVars(schemeFromPage(page, scheme))}>
      <header className="reader-bar reader-top">
        <button className="icon-btn" onClick={() => navigate('/')} aria-label="Zur Bibliothek"><Icon name="back" /></button>
        <div className="reader-title">{meta?.title}</div>
        <button className="icon-btn" onClick={() => setPanel('toc')} aria-label="Inhalt"><Icon name="list" /></button>
        <button className="icon-btn" onClick={() => setPanel('search')} aria-label="Suchen"><Icon name="search" /></button>
        <button className="icon-btn" onClick={() => { setNotebookTab('highlights'); setPanel('notebook') }} aria-label="Notizbuch: Markierungen, Lesezeichen, Bilder" title="Notizbuch">
          <Icon name="notebook" />
        </button>
        <button className="icon-btn" onClick={() => setPanel('settings')} aria-label="Darstellung"><Icon name="text" /></button>
      </header>

      <button className={`bookmark-ribbon ${current ? 'active' : ''}`} onClick={toggleBookmark}
        aria-label={current ? 'Lesezeichen entfernen' : 'Lesezeichen setzen'} disabled={!ready}>
        <Icon name={current ? 'bookmarkFilled' : 'bookmark'} />
      </button>

      {canJumpBack && (
        <div className="jump-back">
          <button className="btn" onClick={jumpBack}><Icon name="back" size={16} /> Zurück</button>
          <button className="icon-btn small" onClick={() => setCanJumpBack(false)} aria-label="Ausblenden"><Icon name="close" size={14} /></button>
        </div>
      )}

      {selection && !panel && (
        <SelectionBar categories={categories} onPick={pickCategory} onNote={noteFromSelection}
          onCancel={() => { selection.doc.getSelection()?.removeAllRanges(); setSelection(null) }} />
      )}
      {reactFor && !selection && !panel && !hlSheet && (
        <ReactBar highlight={reactFor} category={categories.find(c => c.id === reactFor.catId)}
          onReact={react} onOpen={() => { setHlSheet({ h: reactFor, note: true }); setReactFor(null) }}
          onClose={() => setReactFor(null)} />
      )}

      {meta && !offer && needsLink(meta) && hc.user && !hcLink && (
        <HardcoverLinkBanner onLink={() => setHcLink(true)}
          onSkip={async () => setMeta({ ...meta, hardcover: await linkBook(id, null) })} />
      )}
      {hcLink && meta && (
        <HardcoverLinkSheet book={meta} onClose={() => setHcLink(false)}
          onDone={hit => setMeta(m => ({ ...m, hardcover: { bookId: hit.id } }))} />
      )}

      {offer && <SyncOffer offer={offer} onJump={() => answerOffer(true)} onStay={() => answerOffer(false)} />}

      {settings.flow === 'scrolled' && edge === 'end' && (
        <button className="section-continue" onClick={() => turnSection(1)}>
          Weiterziehen oder tippen für das nächste Kapitel
        </button>
      )}

      <main className="reader-view" ref={containerRef}>
        {!ready && !error && <div className="reader-loading">Buch wird geöffnet …</div>}
        {error && <div className="reader-loading">Fehler: {error}</div>}
      </main>

      <footer className="reader-bar reader-bottom">
        {chrome && ready && (
          <input type="range" className="slider" min="0" max="1" step="0.001"
            style={{ '--p': `${(loc?.fraction ?? 0) * 100}%` }}
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
      {panel === 'notebook' && (
        <NotebookPanel bookId={id} tab={notebookTab} highlights={highlights} categories={categories} bookmarks={bookmarks}
          onSelect={goTo} onDeleteBookmark={removeBookmark} onClose={closePanel}
          onOpenHighlight={h => { setPanel(null); setHlSheet({ h }) }} onSearch={searchFor} />
      )}
      {hlSheet && (
        <HighlightSheet key={hlSheet.h.id} highlight={hlSheet.h} categories={categories} autoFocusNote={hlSheet.note}
          onChange={replaceHighlight} onDelete={deleteHl} onSearch={searchFor} onClose={() => setHlSheet(null)} />
      )}
      {panel === 'settings' && <SettingsPanel onClose={closePanel} />}
    </div>
  )
}

// Etwas Text vor und nach der Markierung (für die Übersicht)
function contextOf(range) {
  try {
    const block = range.startContainer.parentElement?.closest('p, li, blockquote, div, h1, h2, h3, h4, td') ?? range.startContainer.parentElement
    const before = range.cloneRange(); before.selectNodeContents(block); before.setEnd(range.startContainer, range.startOffset)
    const after = range.cloneRange(); after.selectNodeContents(block); after.setStart(range.endContainer, range.endOffset)
    const clean = t => t.replace(/\s+/g, ' ')
    return { pre: clean(before.toString()).slice(-60).trimStart(), post: clean(after.toString()).slice(0, 60).trimEnd() }
  } catch { return null }
}

// Im Scroll-Modus: Steht man am Anfang oder Ende des aktuellen Kapitels?
// (Ein Kapitel, das ganz auf den Bildschirm passt, zählt als beides → 'end')
function edgeOf(renderer) {
  if (!renderer?.scrolled) return null
  const { start, end, viewSize } = renderer
  if (viewSize - end <= 4) return 'end'
  if (start <= 1) return 'start'
  return null
}

// Gibt es vor (dir -1) bzw. nach (dir 1) dem aktuellen Kapitel noch eins?
function hasAdjacentSection(view, dir) {
  const sections = view.book?.sections ?? []
  const current = view.lastLocation?.section?.current
  if (current == null) return false
  for (let i = current + dir; i >= 0 && i < sections.length; i += dir)
    if (sections[i]?.linear !== 'no') return true
  return false
}

function scrollEdge(view) {
  const at = edgeOf(view.renderer)
  // nach dem letzten Kapitel gibt es nichts mehr
  if (at === 'end' && !hasAdjacentSection(view, 1)) return null
  return at
}

function applySettings(view, s, page) {
  const r = view.renderer
  if (!r) return
  const m = MARGINS[s.margin] ?? MARGINS.medium
  r.setAttribute('flow', s.flow)
  r.setAttribute('gap', m.gap)
  r.setAttribute('margin', m.margin)
  r.setAttribute('max-inline-size', '720px')
  r.setAttribute('max-column-count', '2')
  r.setStyles?.(bookCss(s, page))
  // Pastellfarben: auf hellem Papier "multiplizieren", im Dunkeln etwas zurücknehmen
  const dark = !!page.dark
  view.style.setProperty('--overlayer-highlight-opacity', dark ? '.38' : '.6')
  view.style.setProperty('--overlayer-highlight-blend-mode', dark ? 'normal' : 'multiply')
}
