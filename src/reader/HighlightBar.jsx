// Leiste unten im Reader:
//  - Text markiert → Kategorie antippen (oder gleich eine Notiz schreiben)
//  - direkt danach → schnell eine Reaktion vergeben
import { colorOf, REACTIONS } from '../services/highlights.js'

export function SelectionBar({ categories, onPick, onNote, onCancel }) {
  return (
    <div className="hl-bar" role="toolbar" aria-label="Markieren">
      <div className="hl-chips">
        {categories.map(c => (
          <button key={c.id} className="hl-chip" onClick={() => onPick(c)}>
            <span className="hl-dot" style={{ background: colorOf(c.color).chip }} />{c.name}
          </button>
        ))}
      </div>
      <div className="hl-bar-actions">
        <button className="btn small" onClick={onNote}>Notiz</button>
        <button className="btn small" onClick={onCancel} aria-label="Abbrechen">✕</button>
      </div>
    </div>
  )
}

export function ReactBar({ highlight, category, onReact, onOpen, onClose }) {
  return (
    <div className="hl-bar hl-react" role="toolbar" aria-label="Reaktion">
      <span className="hl-react-label">
        <span className="hl-dot" style={{ background: colorOf(category?.color).chip }} />
        <span className="hl-react-name">{category?.name ?? 'Markiert'}</span>
      </span>
      <div className="hl-reactions">
        {REACTIONS.map(([key, emoji, label]) => (
          <button key={key} className={highlight.reaction === key ? 'active' : ''} onClick={() => onReact(key)}
            aria-label={label} title={label}>{emoji}</button>
        ))}
      </div>
      <button className="btn small" onClick={onOpen}>Notiz</button>
      <button className="icon-btn small" onClick={onClose} aria-label="Fertig">✓</button>
    </div>
  )
}
