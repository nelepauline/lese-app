// Inhaltsverzeichnis (verschachtelt)
import { useEffect, useRef } from 'react'
import Sheet from '../components/Sheet.jsx'

function Items({ items, currentHref, onSelect, depth = 0 }) {
  return (
    <ul className="toc-list">
      {items.map((item, i) => (
        <li key={item.href ?? i}>
          <button
            className={`toc-item ${item.href && item.href === currentHref ? 'current' : ''}`}
            style={{ paddingLeft: 16 + depth * 16 }}
            onClick={() => item.href && onSelect(item.href)}
          >
            {item.label?.trim() || '—'}
          </button>
          {item.subitems?.length > 0 && (
            <Items items={item.subitems} currentHref={currentHref} onSelect={onSelect} depth={depth + 1} />
          )}
        </li>
      ))}
    </ul>
  )
}

export default function TocPanel({ toc, currentHref, onSelect, onClose }) {
  const ref = useRef()
  useEffect(() => {
    ref.current?.querySelector('.current')?.scrollIntoView({ block: 'center' })
  }, [])
  return (
    <Sheet title="Inhalt" onClose={onClose} side="left">
      <div ref={ref}>
        {toc.length ? <Items items={toc} currentHref={currentHref} onSelect={onSelect} />
          : <p className="muted pad">Dieses Buch hat kein Inhaltsverzeichnis.</p>}
      </div>
    </Sheet>
  )
}
