// Ein Buch mit dem passenden Buch auf Hardcover verknüpfen:
// Vorschläge (nach ISBN bzw. Titel + Autor/in) mit Cover – einmal antippen.
import { useEffect, useRef, useState } from 'react'
import Sheet from './Sheet.jsx'
import { search, searchQueryFor, linkBook } from '../services/hardcover/hardcover.js'

// Kleiner Hinweis oben im Reader/Player
export function HardcoverLinkBanner({ onLink, onSkip }) {
  return (
    <div className="sync-offer hc-banner" role="status">
      <p>
        <strong>Mit Hardcover verknüpfen?</strong>
        <span className="muted">Dann wird dein Fortschritt dorthin gemeldet.</span>
      </p>
      <div className="sync-offer-actions">
        <button className="btn" onClick={onSkip}>Nicht für dieses Buch</button>
        <button className="btn btn-primary" onClick={onLink}>Auswählen</button>
      </div>
    </div>
  )
}

export default function HardcoverLinkSheet({ book, onDone, onClose }) {
  const [query, setQuery] = useState(() => searchQueryFor(book))
  const [results, setResults] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const run = useRef(0)

  async function doSearch(q) {
    const my = ++run.current
    setResults(null); setError(null)
    try {
      let hits = await search(q)
      // ISBN ohne Treffer → mit Titel + Autor/in noch einmal versuchen
      if (!hits.length && q === book.isbn) hits = await search([book.title, book.author?.split(',')[0]].filter(Boolean).join(' '))
      if (my === run.current) setResults(hits)
    } catch (err) {
      if (my === run.current) { setError(err.message || String(err)); setResults([]) }
    }
  }
  useEffect(() => { doSearch(query) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function pick(hit) {
    setBusy(true)
    await linkBook(book.id, hit)
    onDone?.(hit)
    onClose()
  }

  return (
    <Sheet title="Auf Hardcover finden" onClose={onClose}>
      <form className="search-form" onSubmit={e => { e.preventDefault(); if (query.trim()) doSearch(query.trim()) }}>
        <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Titel, Autor/in oder ISBN" enterKeyHint="search" />
        <button className="btn" type="submit">Suchen</button>
      </form>
      {!results && !error && <p className="muted pad">Suche bei Hardcover …</p>}
      {error && <p className="notice notice-error" style={{ margin: '8px 16px' }}>{error}</p>}
      {results && !results.length && !error && <p className="muted pad">Nichts gefunden. Probier einen anderen Suchbegriff.</p>}
      <ul className="hc-results">
        {(results ?? []).map(hit => (
          <li key={hit.id}>
            <button onClick={() => pick(hit)} disabled={busy}>
              {hit.image ? <img src={hit.image} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span className="hc-noimg" />}
              <span className="hc-info">
                <b>{hit.title}</b>
                <span className="muted small">{[hit.authors, hit.year].filter(Boolean).join(' · ')}</span>
                {hit.series && <span className="small hc-series">{hit.series}</span>}
                <span className="muted small">{book.type === 'audiobook'
                  ? (hit.audioSeconds ? `Hörbuch ${Math.round(hit.audioSeconds / 3600)} Std.` : '')
                  : (hit.pages ? `${hit.pages} Seiten` : '')}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <p className="muted small pad">Wähle das Buch, das du gerade liest. Die Verknüpfung gilt auch auf deinen anderen Geräten.</p>
    </Sheet>
  )
}
