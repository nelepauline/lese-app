// Ein Einblend-Fenster: auf dem iPhone von unten, auf großen Bildschirmen seitlich.
import { useEffect } from 'react'
import Icon from './Icon.jsx'

export default function Sheet({ title, onClose, children, side = 'right' }) {
  useEffect(() => {
    const onKey = e => e.key === 'Escape' && onClose()
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className={`sheet sheet-${side}`} onClick={e => e.stopPropagation()} role="dialog" aria-label={title}>
        <header className="sheet-header">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Schließen"><Icon name="close" /></button>
        </header>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  )
}
