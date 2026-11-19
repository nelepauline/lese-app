// Bibliothek: alle Bücher und Hörbücher mit Cover, Titel, Autor und Fortschritt.
import { useCallback, useEffect, useRef, useState } from 'react'
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

const FILTERS = [
  ['all', 'Alle'],
  ['epub', 'Bücher'],
  ['audiobook', 'Hörbücher'],
]

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

  const refresh = useCallback(async () => {
    const [list, prog] = await Promise.all([listBooks(), getAllProgress()])
    // Zuletzt geöffnete zuerst; nie geöffnete Cloud-Bücher alphabetisch dahinter
    const rank = b => b.lastOpenedAt || (b.fileStored === false ? 0 : b.addedAt)
    list.sort((a, b) => (rank(b) - rank(a)) || a.title.localeCompare(b.title, 'de'))
    setBooks(list)
    setProgress(prog)
  }, [])

  useEffect(() => { refresh() }, [refresh, cloud.version])
  // Gerade bei Microsoft angemeldet, aber noch kein Ordner → Auswahl öffnen
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
    refresh()
  }

  async function onRemoveDownload(book) {
    if (!confirm(`Download von „${book.title}“ entfernen? Das Buch bleibt in ${PROVIDER_NAME} und deine Position bleibt gespeichert.`)) return
    if (audio.book?.id === book.id) audio.close()
    await removeDownload(book)
  }

  async function open(book) {
    if (book.fileStored === false) {
      try { await download(book) } catch { return }
      book = { ...book, fileStored: true }
    }
    navigate(book.type === 'audiobook' ? `/listen/${book.id}` : `/read/${book.id}`)
  }

  const visible = (books ?? []).filter(b => filter === 'all' || b.type === filter)

  return (
    <div className={`library ${audio.book ? 'has-mini-player' : ''}`}>
      <header className="library-header">
        <h1>Bibliothek</h1>
        <div className="header-actions">
          <button className={`icon-btn ${cloud.folder ? (cloud.error ? 'sync-warn' : 'sync-on') : ''}`}
            onClick={() => setShowCloud(true)} aria-label={`${PROVIDER_NAME}-Ordner`} title={`${PROVIDER_NAME}-Ordner`}>
            <Icon name="cloud" />
          </button>
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
        <nav className="segmented" aria-label="Filter">
          {FILTERS.map(([key, label]) => (
            <button key={key} className={filter === key ? 'active' : ''} onClick={() => setFilter(key)}>{label}</button>
          ))}
        </nav>
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
            Oder verbinde über das Wolken-Symbol einen {PROVIDER_NAME}-Ordner.</p>
        </div>
      )}

      <ul className="book-grid">
        {visible.map(book => {
          const p = progress[book.id]
          const f = p?.fraction ?? 0
          const inCloud = book.fileStored === false
          const dl = cloud.downloads[book.id]
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
                    {book.remote ? (
                      <button className="icon-btn small" onClick={() => onRemoveDownload(book)}
                        aria-label="Download entfernen" title={`Download entfernen (bleibt in ${PROVIDER_NAME})`}>
                        <Icon name="downloadOff" size={16} />
                      </button>
                    ) : (
                      <button className="icon-btn small" onClick={() => onDelete(book)} aria-label="Löschen" title="Löschen">
                        <Icon name="trash" size={16} />
                      </button>
                    )}
                  </>
                )}
              </div>
            </li>
          )
        })}
      </ul>

      {showSync && <SyncPanel onClose={() => setShowSync(false)} />}
      {showCloud && <CloudPanel onClose={() => setShowCloud(false)} />}
    </div>
  )
}
