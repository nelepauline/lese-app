// Volltextsuche im Buch (foliate-js durchsucht Kapitel für Kapitel)
import { useEffect, useRef, useState } from 'react'
import Sheet from '../components/Sheet.jsx'

export default function SearchPanel({ view, state, onSelect, onClose }) {
  // "state" lebt im Reader weiter, damit Ergebnisse beim erneuten Öffnen noch da sind
  const [query, setQuery] = useState(state.query)
  const [results, setResults] = useState(state.results)
  const [progress, setProgress] = useState(null)
  const runId = useRef(0)
  const inputRef = useRef()

  useEffect(() => {
    // Aus dem Notizbuch "Im Buch suchen" → gleich loslegen
    if (state.autoRun) search() // autoRun bleibt gesetzt, bis die Suche fertig ist
    else if (!state.results.length) inputRef.current?.focus()
  }, [state]) // eslint-disable-line react-hooks/exhaustive-deps
  // Beim Schließen: laufende Suche abbrechen, Treffer-Rahmen im Text entfernen
  useEffect(() => () => { runId.current++; view?.clearSearch?.() }, [view])

  async function search(e) {
    e?.preventDefault()
    const q = query.trim()
    if (!view || q.length < 2) return
    const myRun = ++runId.current
    const found = []
    setResults([])
    setProgress(0)
    for await (const r of view.search({ query: q })) {
      if (myRun !== runId.current) return
      if (r === 'done') break
      if (r.progress != null) setProgress(r.progress)
      if (r.subitems) {
        found.push({ label: r.label, items: r.subitems })
        setResults([...found])
      }
    }
    setProgress(null)
    state.autoRun = false
    state.query = q
    state.results = found
  }

  const total = results.reduce((n, g) => n + g.items.length, 0)

  return (
    <Sheet title="Suchen" onClose={onClose}>
      <form className="search-form" onSubmit={search}>
        <input ref={inputRef} type="search" value={query} placeholder="Wort oder Satz im Buch …"
          onChange={e => setQuery(e.target.value)} enterKeyHint="search" />
        <button className="btn" type="submit">Suchen</button>
      </form>
      {progress != null && <p className="muted pad">Suche … {Math.round(progress * 100)} %</p>}
      {progress == null && state.query && (
        <p className="muted pad">{total ? `${total} Treffer` : 'Keine Treffer.'}</p>
      )}
      {results.map((group, gi) => (
        <section key={gi} className="search-group">
          {group.label && <h3>{group.label.trim()}</h3>}
          {group.items.map((item, i) => (
            <button key={i} className="search-hit" onClick={() => onSelect(item.cfi)}>
              {item.excerpt.pre}<mark>{item.excerpt.match}</mark>{item.excerpt.post}
            </button>
          ))}
        </section>
      ))}
    </Sheet>
  )
}
