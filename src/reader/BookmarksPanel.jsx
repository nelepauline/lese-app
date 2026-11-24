// Liste der Lesezeichen (im Notizbuch als eigener Reiter)
import Icon from '../components/Icon.jsx'
import { percent } from '../lib/format.js'

export function BookmarkList({ bookmarks, onSelect, onDelete }) {
  return (
    <>
      {!bookmarks.length && (
        <p className="muted pad">Noch keine Lesezeichen. Tippe oben rechts auf der Seite auf das
          Lesezeichen-Symbol, um die aktuelle Stelle zu merken.</p>
      )}
      <ul className="bm-list">
        {bookmarks.map(bm => (
          <li key={bm.id}>
            <button className="bm-item" onClick={() => onSelect(bm.cfi)}>
              <span className="bm-head">{bm.label || 'Lesezeichen'} · {percent(bm.fraction)}</span>
              {bm.excerpt && <span className="bm-excerpt">{bm.excerpt}</span>}
            </button>
            <button className="icon-btn small" onClick={() => onDelete(bm)} aria-label="Lesezeichen löschen">
              <Icon name="trash" size={16} />
            </button>
          </li>
        ))}
      </ul>
    </>
  )
}
