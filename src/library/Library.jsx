// Bibliothek: alle Bücher und Hörbücher mit Cover, Titel, Autor und Fortschritt.
import { useCallback, useEffect, useRef, useState } from 'react'
import { listBooks, getAllProgress, deleteBook } from '../db/db.js'
import { importFile } from '../services/importer.js'
import { navigate } from '../lib/router.js'
import { percent } from '../lib/format.js'
import { useAudio } from '../player/AudioProvider.jsx'
import Cover from '../components/Cover.jsx'
import Icon from '../components/Icon.jsx'

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

  const refresh = useCallback(async () => {
    const [list, prog] = await Promise.all([listBooks(), getAllProgress()])
    list.sort((a, b) => (b.lastOpenedAt || b.addedAt) - (a.lastOpenedAt || a.addedAt))
    setBooks(list)
    setProgress(prog)
  }, [])

  useEffect(() => { refresh() }, [refresh])
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

  function open(book) {
    navigate(book.type === 'audiobook' ? `/listen/${book.id}` : `/read/${book.id}`)
  }

  const visible = (books ?? []).filter(b => filter === 'all' || b.type === filter)

  return (
    <div className={`library ${audio.book ? 'has-mini-player' : ''}`}>
      <header className="library-header">
        <h1>Bibliothek</h1>
        <button className="btn btn-primary" onClick={() => fileInput.current.click()} disabled={!!busy}>
          <Icon name="plus" size={18} /> Hinzufügen
        </button>
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

      {books && books.length === 0 && !busy && (
        <div className="empty">
          <Icon name="book" size={44} />
          <h2>Noch keine Bücher</h2>
          <p>Tippe auf „Hinzufügen“ und wähle EPUB-Bücher oder M4B-Hörbücher aus.
            Sie werden auf diesem Gerät gespeichert und sind danach offline verfügbar.</p>
        </div>
      )}

      <ul className="book-grid">
        {visible.map(book => {
          const p = progress[book.id]
          const f = p?.fraction ?? 0
          return (
            <li key={book.id} className="book-card">
              <button className="book-open" onClick={() => open(book)}>
                <div className="cover-wrap">
                  <Cover book={book} />
                  {book.type === 'audiobook' && <span className="badge" title="Hörbuch"><Icon name="headphones" size={14} /></span>}
                </div>
                <div className="book-title">{book.title}</div>
                {book.author && <div className="book-author">{book.author}</div>}
              </button>
              <div className="book-meta">
                <div className="progress-bar"><span style={{ width: `${f * 100}%` }} /></div>
                <span className="book-percent">{p ? percent(f) : 'Neu'}</span>
                <button className="icon-btn small" onClick={() => onDelete(book)} aria-label="Löschen" title="Löschen">
                  <Icon name="trash" size={16} />
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
