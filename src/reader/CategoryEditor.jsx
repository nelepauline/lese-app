// Markier-Kategorien anlegen, umbenennen, umfärben, sortieren und löschen.
import { useState } from 'react'
import { PALETTE, colorOf, saveCategories, newCategory, DEFAULT_CATEGORIES } from '../services/highlights.js'

export default function CategoryEditor({ categories, highlights, onDone }) {
  const [list, setList] = useState(categories)
  const [picking, setPicking] = useState(null) // id der Kategorie, deren Farbe gewählt wird

  const update = (id, changes) => setList(l => l.map(c => c.id === id ? { ...c, ...changes } : c))
  const move = (i, d) => setList(l => {
    const n = [...l]; const j = i + d
    if (j < 0 || j >= n.length) return l
    ;[n[i], n[j]] = [n[j], n[i]]
    return n
  })
  function remove(c) {
    const used = highlights.filter(h => h.catId === c.id).length
    if (used && !confirm(`„${c.name}“ löschen? ${used} Markierung${used > 1 ? 'en stehen' : ' steht'} in diesem Buch danach unter „Ohne Kategorie“.`)) return
    setList(l => l.filter(x => x.id !== c.id))
  }
  function save() {
    saveCategories(list.map(c => ({ ...c, name: c.name.trim() || 'Ohne Namen' })))
    onDone()
  }

  return (
    <div className="settings cat-editor">
      <p className="muted small">Gilt für alle Bücher. „Zusammenfassen“ sammelt gleiche Wörter
        (z. B. alle Stellen mit „Anna“) unter einem Eintrag – praktisch für Namen und Orte.</p>
      <ul className="cat-list">
        {list.map((c, i) => (
          <li key={c.id} className="cat-row">
            <div className="cat-main">
              <button className="cat-color" style={{ background: colorOf(c.color).chip }}
                onClick={() => setPicking(picking === c.id ? null : c.id)} aria-label="Farbe wählen" />
              <input className="input" value={c.name} onChange={e => update(c.id, { name: e.target.value })} aria-label="Name" />
              <div className="cat-order">
                <button className="icon-btn small" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Nach oben">▲</button>
                <button className="icon-btn small" onClick={() => move(i, 1)} disabled={i === list.length - 1} aria-label="Nach unten">▼</button>
              </div>
            </div>
            {picking === c.id && (
              <div className="cat-palette">
                {Object.entries(PALETTE).map(([key, p]) => (
                  <button key={key} className={key === c.color ? 'active' : ''} style={{ background: p.chip }}
                    onClick={() => { update(c.id, { color: key }); setPicking(null) }} aria-label={p.name} title={p.name} />
                ))}
              </div>
            )}
            <div className="cat-options">
              <label className="check">
                <input type="checkbox" checked={!!c.group} onChange={e => update(c.id, { group: e.target.checked })} />
                Gleiche zusammenfassen
              </label>
              <button className="btn small btn-danger" onClick={() => remove(c)} disabled={list.length <= 1}>Löschen</button>
            </div>
          </li>
        ))}
      </ul>
      <button className="btn" onClick={() => setList(l => [...l, newCategory(l)])}>＋ Kategorie hinzufügen</button>
      <div className="sync-buttons">
        <button className="btn" onClick={onDone}>Abbrechen</button>
        <button className="btn btn-primary" onClick={save}>Speichern</button>
      </div>
      <button className="btn small cat-reset" onClick={() => { if (confirm('Kategorien auf den Anfangszustand zurücksetzen?')) setList(DEFAULT_CATEGORIES) }}>
        Zurücksetzen
      </button>
    </div>
  )
}
