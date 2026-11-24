// Eine Markierung ansehen und ändern: Kategorie, Reaktion, Notiz, löschen.
import { useEffect, useRef, useState } from 'react'
import Sheet from '../components/Sheet.jsx'
import { colorOf, REACTIONS, updateHighlight } from '../services/highlights.js'
import { clock } from '../lib/format.js'

// Hörbuch-Markierungen haben statt Text eine Position (Sekunden) und ein
// optionales Stichwort (z. B. ein Name) – dann gibt es "Anhören" statt "Suchen".
export default function HighlightSheet({ highlight, categories, autoFocusNote, onChange, onDelete, onSearch, onPlay, onClose }) {
  const [h, setH] = useState(highlight)
  const [note, setNote] = useState(highlight.note ?? '')
  const [label, setLabel] = useState(highlight.text ?? '')
  const noteRef = useRef()
  const latest = useRef({ h, note, label })
  latest.current = { h, note, label }
  const isAudio = highlight.position != null

  useEffect(() => { if (autoFocusNote) noteRef.current?.focus() }, [autoFocusNote])

  async function change(changes) {
    const next = await updateHighlight(latest.current.h, changes)
    setH(next)
    onChange(next)
  }

  // Notiz beim Schließen speichern
  async function close() {
    const { h: cur, note: n, label: l } = latest.current
    const changes = {}
    if ((cur.note ?? '') !== n.trim()) changes.note = n.trim()
    if (isAudio && (cur.text ?? '') !== l.trim()) changes.text = l.trim()
    if (Object.keys(changes).length) onChange(await updateHighlight(cur, changes))
    onClose()
  }

  const cat = categories.find(c => c.id === h.catId)

  return (
    <Sheet title="Markierung" onClose={close}>
      <div className="settings hl-sheet">
        {isAudio ? (
          <>
            <div className="hl-quote hl-time" style={{ borderColor: colorOf(cat?.color).chip, background: colorOf(cat?.color).mark + '40' }}>
              ⏱ {clock(h.position)}{h.chapter ? ` · ${h.chapter}` : ''}
            </div>
            <label htmlFor="hl-label">Stichwort</label>
            <input id="hl-label" className="input" value={label} placeholder="z. B. ein Name oder Ort (optional)"
              onChange={e => setLabel(e.target.value)} autoComplete="off"
              onBlur={() => { if ((h.text ?? '') !== label.trim()) change({ text: label.trim() }) }} />
          </>
        ) : (
          <>
            <blockquote className="hl-quote" style={{ borderColor: colorOf(cat?.color).chip, background: colorOf(cat?.color).mark + '40' }}>
              {h.text}
            </blockquote>
            <p className="muted small">{[h.chapter, h.fraction != null ? `${Math.round(h.fraction * 100)} %` : ''].filter(Boolean).join(' · ')}</p>
          </>
        )}

        <label>Kategorie</label>
        <div className="hl-chips wrap">
          {categories.map(c => (
            <button key={c.id} className={`hl-chip ${c.id === h.catId ? 'active' : ''}`} onClick={() => change({ catId: c.id })}>
              <span className="hl-dot" style={{ background: colorOf(c.color).chip }} />{c.name}
            </button>
          ))}
        </div>

        <label>Reaktion</label>
        <div className="hl-reactions big">
          {REACTIONS.map(([key, emoji, label]) => (
            <button key={key} className={h.reaction === key ? 'active' : ''} aria-label={label} title={label}
              onClick={() => change({ reaction: h.reaction === key ? '' : key })}>
              <span>{emoji}</span><small>{label}</small>
            </button>
          ))}
        </div>

        <label htmlFor="hl-note">Notiz</label>
        <textarea id="hl-note" ref={noteRef} className="input" rows={4} value={note}
          placeholder="Deine Gedanken dazu …" onChange={e => setNote(e.target.value)}
          onBlur={() => { if ((h.note ?? '') !== note.trim()) change({ note: note.trim() }) }} />

        <div className="sync-buttons">
          {isAudio
            ? <button className="btn" onClick={() => onPlay(h)}>▶ Anhören</button>
            : <button className="btn" onClick={() => onSearch(h.text)}>Im Buch suchen</button>}
          <button className="btn btn-danger" onClick={() => onDelete(h)}>Löschen</button>
        </div>
      </div>
    </Sheet>
  )
}
