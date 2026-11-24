// Bibliothek: alle Bücher und Hörbücher mit Cover, Titel, Autor und Fortschritt.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { listBooks, getAllProgress, deleteBook } from '../db/db.js'
import { importFile } from '../services/importer.js'
import { navigate } from '../lib/router.js'
import { percent, fileSize } from '../lib/format.js'
import { useAudio } from '../player/AudioProvider.jsx'
import Cover from '../components/Cover.jsx'
import Icon from '../components/Icon.jsx'
import SyncPanel from './SyncPanel.jsx'
import { useSyncState } from '../services/sync/sync.js'
import CloudPanel from './CloudPanel.jsx'
import { useCloudState, download, removeDownload, signIn, clearError, PROVIDER_NAME } from '../services/cloud/cloudLibrary.js'
import EditBook from './EditBook.jsx'
import ViewPanel from './ViewPanel.jsx'
import { seriesLabel, seriesNumber, bandLabel } from '../services/bookMeta.js'

const FILTERS = [
  ['all', 'Alle'],
  ['epub', 'Bücher'],
  ['audiobook', 'Hörbücher'],
]

const SORTS = [
  ['recent', 'Zuletzt gelesen'],
  ['title', 'Titel'],
  ['author', 'Autor/in'],
  ['series', 'Serie'],
]

// Mindestbreite der Cover (px) und Abstand je Größe – schmal (iPhone) / breit
const COVER_SIZES = {
  small:  { narrow: [66, 12], wide: [100, 16] },
  medium: { narrow: [96, 16], wide: [140, 20] },
  large:  { narrow: [140, 20], wide: [190, 24] },
}
const VIEW_KEY = 'lib-view'
function loadView() {
  try { return { layout: 'grid', size: 'medium', ...JSON.parse(localStorage.getItem(VIEW_KEY)) } }
  catch { return { layout: 'grid', size: 'medium' } }
}

const byText = (a, b) => (a || '').localeCompare(b || '', 'de', { numeric: true, sensitivity: 'base' })
// Nachname zuerst sortieren: "Jane Austen" → "Austen Jane"
const authorSortKey = author => {
  const first = (author || '').split(',')[0].trim()
  const parts = first.split(/\s+/)
  return parts.length > 1 ? `${parts.at(-1)} ${parts.slice(0, -1).join(' ')}` : first
}
const bySeries = (a, b) => (seriesNumber(a) - seriesNumber(b)) || byText(a.title, b.title)

export default function Library() {
  const [books, setBooks] = useState(null)
  const [progress, setProgress] = useState({})
  const [filter, setFilter] = useState(() => sessionStorage.getItem('lib-filter') || 'all')
  const [busy, setBusy] = useState(null)
  const [message, setMessage] = useState(null)
  const fileInput = useRef()
  const audio = useAudio()
  const sync = useSyncState()
  const [showSync, setShowSync] = useState(false)
  const cloud = useCloudState()
  const [showCloud, setShowCloud] = useState(false)
  const [sort, setSort] = useState(() => localStorage.getItem('lib-sort') || 'recent')
  const [editing, setEditing] = useState(null)
  const [view, setView] = useState(loadView)
  const [showView, setShowView] = useState(false)
  const [width, setWidth] = useState(0)
  const rootRef = useRef()

  const changeView = changes => setView(v => {
    const next = { ...v, ...changes }
    try { localStorage.setItem(VIEW_KEY, JSON.stringify(next)) } catch { /* egal */ }
    return next
  })

  // Breite der Bibliothek messen (für Regal-Reihen und Cover-Größe)
  useLayoutEffect(() => {
    const el = rootRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const [coverMin, coverGap] = COVER_SIZES[view.size]?.[width >= 640 ? 'wide' : 'narrow'] ?? COVER_SIZES.medium.narrow
  const columns = Math.max(2, Math.floor((width + coverGap) / (coverMin + coverGap)) || 2)

  const refresh = useCallback(async () => {
    const [list, prog] = await Promise.all([listBooks(), getAllProgress()])
    // Zuletzt geöffnete zuerst; nie geöffnete Cloud-Bücher alphabetisch dahinter
    const rank = b => b.lastOpenedAt || (b.fileStored === false ? 0 : b.addedAt)
    list.sort((a, b) => (rank(b) - rank(a)) || a.title.localeCompare(b.title, 'de'))
    setBooks(list)
    setProgress(prog)
  }, [])

  useEffect(() => { refresh() }, [refresh, cloud.version, sync.dataVersion])
  useEffect(() => { try { localStorage.setItem('lib-sort', sort) } catch { /* egal */ } }, [sort])
  // Gerade beim Cloud-Dienst angemeldet, aber noch kein Ordner → Auswahl öffnen
  useEffect(() => { if (cloud.justSignedIn && !cloud.folder) setShowCloud(true) }, [cloud.justSignedIn, cloud.folder])
  useEffect(() => { sessionStorage.setItem('lib-filter', filter) }, [filter])

  async function onFiles(e) {
    const files = [...e.target.files]
    e.target.value = ''
    const errors = []
    let added = 0
    for (const [i, file] of files.entries()) {
      setBusy(files.length > 1 ? `Importiere ${i + 1} von ${files.length} …` : `Importiere „${file.name}“ …`)
      try {
        const { duplicate } = await importFile(file)
        if (!duplicate) added++
      } catch (err) {
        console.error(err)
        errors.push(err.message || String(err))
      }
    }
    setBusy(null)
    await refresh()
    if (errors.length) setMessage(errors.join('\n'))
    else if (!added) setMessage('Diese Datei ist schon in der Bibliothek.')
  }

  async function onDelete(book) {
    if (!confirm(`„${book.title}“ vom Gerät löschen?`)) return
    if (audio.book?.id === book.id) audio.close()
    await deleteBook(book.id)
    setEditing(null)
    refresh()
  }

  async function onRemoveDownload(book) {
    if (!confirm(`Download von „${book.title}“ entfernen? Das Buch bleibt in ${PROVIDER_NAME} und deine Position bleibt gespeichert.`)) return
    if (audio.book?.id === book.id) audio.close()
    await removeDownload(book)
    setEditing(null)
  }

  async function open(book) {
    if (book.fileStored === false) {
      try { await download(book) } catch { return }
      book = { ...book, fileStored: true }
    }
    navigate(book.type === 'audiobook' ? `/listen/${book.id}` : `/read/${book.id}`)
  }

  const visible = (books ?? []).filter(b => filter === 'all' || b.type === filter)
  if (sort === 'title') visible.sort((a, b) => byText(a.title, b.title))
  if (sort === 'author') visible.sort((a, b) => byText(authorSortKey(a.author), authorSortKey(b.author)) || bySeries(a, b))

  // Nach Serie: Gruppen mit Überschrift, Bücher ohne Serie am Ende
  let groups = [{ name: null, books: visible }]
  if (sort === 'series') {
    const map = new Map()
    for (const b of visible) {
      const k = b.series || ''
      if (!map.has(k)) map.set(k, [])
      map.get(k).push(b)
    }
    groups = [...map.entries()]
      .sort(([a], [b]) => (!a) - (!b) || byText(a, b))
      .map(([name, list]) => ({ name: name || 'Ohne Serie', books: list.sort(name ? bySeries : (a, b) => byText(a.title, b.title)) }))
  }

  const allSeries = [...new Set((books ?? []).map(b => b.series).filter(Boolean))].sort(byText)
  const allAuthors = [...new Set((books ?? []).map(b => b.author).filter(Boolean))].sort(byText)

  function renderBook(book) {
    const p = progress[book.id]
    const f = p?.fraction ?? 0
    const inCloud = book.fileStored === false
    const dl = cloud.downloads[book.id]
    const series = sort === 'series' ? bandLabel(book) : seriesLabel(book)
    return (
      <li key={book.id} className={`book-card ${inCloud ? 'in-cloud' : ''}`}>
        <button className="book-open" onClick={() => open(book)} disabled={dl != null}>
          <div className="cover-wrap">
            <Cover book={book} />
            {book.type === 'audiobook' && <span className="badge" title="Hörbuch"><Icon name="headphones" size={14} /></span>}
            {inCloud && dl == null && <span className="badge badge-left" title={`In ${PROVIDER_NAME} – zum Herunterladen tippen`}><Icon name="cloud" size={14} /></span>}
            {dl != null && (
              <div className="download-overlay">
                <div className="download-ring" style={{ '--p': dl }} />
                <span>{Math.round(dl * 100)} %</span>
              </div>
            )}
          </div>
          <div className="book-title">{book.title}</div>
          {series && <div className="book-series">{series}</div>}
          {book.author && <div className="book-author">{book.author}</div>}
        </button>
        <div className="book-meta">
          {inCloud ? (
            <>
              <span className="book-percent cloud-size">{p ? `${percent(f)} · ` : ''}{fileSize(book.size)}</span>
              <button className="icon-btn small" onClick={() => open(book)} disabled={dl != null}
                aria-label="Herunterladen" title="Herunterladen"><Icon name="download" size={16} /></button>
            </>
          ) : (
            <>
              <div className="progress-bar"><span style={{ width: `${f * 100}%` }} /></div>
              <span className="book-percent">{p ? percent(f) : 'Neu'}</span>
            </>
          )}
          <button className="icon-btn small" onClick={() => setEditing(book)}
            aria-label={`„${book.title}“ bearbeiten`} title="Bearbeiten"><Icon name="more" size={16} /></button>
        </div>
      </li>
    )
  }

  // Regal: Cover stehen auf Brettern; "…" und Fortschritt liegen auf dem Cover
  function renderShelfBook(book) {
    const p = progress[book.id]
    const f = p?.fraction ?? 0
    const inCloud = book.fileStored === false
    const dl = cloud.downloads[book.id]
    return (
      <li key={book.id} className={`shelf-book ${inCloud ? 'in-cloud' : ''}`}>
        <button className="book-open" onClick={() => open(book)} disabled={dl != null}
          aria-label={book.title} title={[book.title, seriesLabel(book), book.author].filter(Boolean).join(' – ')}>
          <div className="cover-wrap">
            <Cover book={book} />
            {book.type === 'audiobook' && <span className="badge" title="Hörbuch"><Icon name="headphones" size={14} /></span>}
            {inCloud && dl == null && <span className="badge badge-left"><Icon name="cloud" size={14} /></span>}
            {f > 0 && !inCloud && <div className="shelf-progress"><span style={{ width: `${f * 100}%` }} /></div>}
            {dl != null && (
              <div className="download-overlay">
                <div className="download-ring" style={{ '--p': dl }} />
                <span>{Math.round(dl * 100)} %</span>
              </div>
            )}
          </div>
        </button>
        <button className="shelf-more" onClick={() => setEditing(book)}
          aria-label={`„${book.title}“ bearbeiten`} title="Bearbeiten"><Icon name="more" size={16} /></button>
      </li>
    )
  }

  function renderGroup(list) {
    if (view.layout === 'shelf') {
      const rows = []
      for (let i = 0; i < list.length; i += columns) rows.push(list.slice(i, i + columns))
      return (
        <div className="shelf">
          {rows.map((row, i) => (
            <div key={i} className="shelf-row">
              <ul className="shelf-books" style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>{row.map(renderShelfBook)}</ul>
              <div className="shelf-board" aria-hidden="true" />
            </div>
          ))}
        </div>
      )
    }
    return <ul className="book-grid">{list.map(renderBook)}</ul>
  }

  return (
    <div ref={rootRef}
      className={`library layout-${view.layout} size-${view.size} ${audio.book ? 'has-mini-player' : ''}`}
      style={{ '--cover-min': `${coverMin}px`, '--cover-gap': `${coverGap}px` }}>
      <header className="library-header">
        <h1>Bibliothek</h1>
        <div className="header-actions">
          {cloud.configured && (
            <button className={`icon-btn ${cloud.folder ? (cloud.error ? 'sync-warn' : 'sync-on') : ''}`}
              onClick={() => setShowCloud(true)} aria-label={`${PROVIDER_NAME}-Ordner`} title={`${PROVIDER_NAME}-Ordner`}>
              <Icon name="cloud" />
            </button>
          )}
          <button className={`icon-btn ${sync.connected ? (sync.error ? 'sync-warn' : 'sync-on') : ''}`}
            onClick={() => setShowSync(true)} aria-label="Geräte abgleichen" title="Geräte abgleichen">
            <Icon name="sync" />
          </button>
          <button className="btn btn-primary btn-add" onClick={() => fileInput.current.click()} disabled={!!busy}
            aria-label="Hinzufügen">
            <Icon name="plus" size={18} /> <span>Hinzufügen</span>
          </button>
        </div>
        {/* kein "accept"-Filter: iOS erkennt .m4b sonst teils nicht */}
        <input ref={fileInput} type="file" multiple hidden onChange={onFiles} />
      </header>

      {books?.length > 0 && (
        <div className="library-tools">
          <nav className="segmented" aria-label="Filter">
            {FILTERS.map(([key, label]) => (
              <button key={key} className={filter === key ? 'active' : ''} onClick={() => setFilter(key)}>{label}</button>
            ))}
          </nav>
          <div className="tools-right">
            <label className="sort-select">
              <span>Sortieren</span>
              <select value={sort} onChange={e => setSort(e.target.value)}>
                {SORTS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </select>
            </label>
            <button className="icon-btn" onClick={() => setShowView(true)} aria-label="Ansicht" title="Ansicht">
              <Icon name={view.layout === 'list' ? 'list' : view.layout === 'shelf' ? 'shelf' : 'grid'} />
            </button>
          </div>
        </div>
      )}

      {busy && <div className="notice">{busy}</div>}
      {message && (
        <div className="notice notice-error" onClick={() => setMessage(null)}>
          {message}<span className="notice-close">Tippen zum Schließen</span>
        </div>
      )}

      {cloud.error && !showCloud && (
        <div className="notice notice-error" onClick={clearError}>
          {cloud.error}
          {!cloud.signedIn && cloud.configured && (
            <button className="btn btn-primary notice-action" onClick={e => { e.stopPropagation(); signIn() }}>Neu anmelden</button>
          )}
          <span className="notice-close">Tippen zum Schließen</span>
        </div>
      )}

      {books && books.length === 0 && !busy && (
        <div className="empty">
          <Icon name="book" size={44} />
          <h2>Noch keine Bücher</h2>
          <p>Tippe auf „Hinzufügen“ und wähle EPUB-Bücher oder M4B-Hörbücher aus.
            Sie werden auf diesem Gerät gespeichert und sind danach offline verfügbar.
            {cloud.configured && <> Oder verbinde über das Wolken-Symbol einen {PROVIDER_NAME}-Ordner.</>}</p>
        </div>
      )}

      {groups.map(g => (
        <section key={g.name ?? 'all'} className="book-group">
          {g.name && <h2 className="group-title">{g.name} <span className="muted">{g.books.length}</span></h2>}
          {renderGroup(g.books)}
        </section>
      ))}

      {showSync && <SyncPanel onClose={() => setShowSync(false)} />}
      {showCloud && <CloudPanel onClose={() => setShowCloud(false)} />}
      {showView && <ViewPanel view={view} onChange={changeView} onClose={() => setShowView(false)} />}
      {editing && (
        <EditBook book={editing} allSeries={allSeries} allAuthors={allAuthors} cloudName={PROVIDER_NAME}
          onClose={() => setEditing(null)} onSaved={refresh}
          onDelete={onDelete} onRemoveDownload={onRemoveDownload} />
      )}
    </div>
  )
}
