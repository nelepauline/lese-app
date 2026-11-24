// Bild im Vollbild ansehen – mit Zoom (zwei Finger, Doppeltippen oder +/−).
import { useEffect, useRef, useState } from 'react'
import Icon from '../components/Icon.jsx'

const MIN = 1, MAX = 6

export default function ImageViewer({ image, url, onClose, onRename, onDelete }) {
  const [zoom, setZoom] = useState(1)
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(image.name)
  const box = useRef()
  const pinch = useRef(null)
  const zoomRef = useRef(zoom)
  zoomRef.current = zoom

  useEffect(() => {
    const onKey = e => e.key === 'Escape' && onClose()
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [onClose])

  // Zoomen und dabei die Bildmitte (bzw. den Punkt unter den Fingern) festhalten
  function zoomTo(z, cx, cy) {
    const el = box.current
    if (!el) return
    z = Math.min(MAX, Math.max(MIN, z))
    const old = zoomRef.current
    const rect = el.getBoundingClientRect()
    const px = (cx ?? rect.left + rect.width / 2) - rect.left
    const py = (cy ?? rect.top + rect.height / 2) - rect.top
    const fx = (el.scrollLeft + px) / old, fy = (el.scrollTop + py) / old
    setZoom(z)
    requestAnimationFrame(() => {
      el.scrollLeft = fx * z - px
      el.scrollTop = fy * z - py
    })
  }

  // Zwei-Finger-Zoom (Safari braucht dafür nicht-passive Listener)
  useEffect(() => {
    const el = box.current
    const dist = t => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY)
    const mid = t => [(t[0].clientX + t[1].clientX) / 2, (t[0].clientY + t[1].clientY) / 2]
    const start = e => { if (e.touches.length === 2) pinch.current = { d: dist(e.touches), z: zoomRef.current } }
    const move = e => {
      if (e.touches.length !== 2 || !pinch.current) return
      e.preventDefault()
      const [cx, cy] = mid(e.touches)
      zoomTo(pinch.current.z * dist(e.touches) / pinch.current.d, cx, cy)
    }
    const end = e => { if (e.touches.length < 2) pinch.current = null }
    const gesture = e => e.preventDefault() // Safari: Seitenzoom verhindern
    el.addEventListener('touchstart', start, { passive: true })
    el.addEventListener('touchmove', move, { passive: false })
    el.addEventListener('touchend', end)
    el.addEventListener('gesturestart', gesture)
    return () => {
      el.removeEventListener('touchstart', start)
      el.removeEventListener('touchmove', move)
      el.removeEventListener('touchend', end)
      el.removeEventListener('gesturestart', gesture)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="img-viewer" role="dialog" aria-label={image.name}>
      <header className="img-viewer-bar">
        <button className="icon-btn" onClick={onClose} aria-label="Schließen"><Icon name="close" /></button>
        {editing ? (
          <form className="img-viewer-name" onSubmit={e => { e.preventDefault(); onRename(name); setEditing(false) }}>
            <input className="input" value={name} autoFocus onChange={e => setName(e.target.value)}
              onBlur={() => { onRename(name); setEditing(false) }} />
          </form>
        ) : (
          <button className="img-viewer-name" onClick={() => setEditing(true)} title="Umbenennen">{image.name}</button>
        )}
        <button className="icon-btn" onClick={onDelete} aria-label="Bild löschen"><Icon name="trash" /></button>
      </header>
      <div className="img-viewer-box" ref={box}
        onDoubleClick={e => zoomTo(zoom > 1.5 ? 1 : 2.5, e.clientX, e.clientY)}>
        <img src={url} alt={image.name} style={{ width: `${zoom * 100}%` }} draggable="false" />
      </div>
      <div className="img-viewer-zoom">
        <button className="icon-btn" onClick={() => zoomTo(zoom / 1.5)} disabled={zoom <= MIN} aria-label="Verkleinern">−</button>
        <span>{Math.round(zoom * 100)} %</span>
        <button className="icon-btn" onClick={() => zoomTo(zoom * 1.5)} disabled={zoom >= MAX} aria-label="Vergrößern">+</button>
      </div>
    </div>
  )
}
