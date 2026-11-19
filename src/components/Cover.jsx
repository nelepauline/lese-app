// Zeigt das gespeicherte Cover eines Buchs – oder ein schlichtes Platzhalter-Cover.
import { useEffect, useState } from 'react'
import { getCover } from '../db/db.js'

const HUES = [24, 200, 140, 340, 260, 40, 170]
const hueFor = text => HUES[[...(text || '')].reduce((a, c) => a + c.charCodeAt(0), 0) % HUES.length]

export function useCoverUrl(bookId) {
  const [url, setUrl] = useState(null)
  useEffect(() => {
    let objectUrl, alive = true
    getCover(bookId).then(blob => {
      if (!alive || !blob) return
      objectUrl = URL.createObjectURL(blob)
      setUrl(objectUrl)
    })
    return () => { alive = false; if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [bookId])
  return url
}

export default function Cover({ book, className = '' }) {
  const url = useCoverUrl(book.id)
  if (url) return <img className={`cover ${className}`} src={url} alt="" draggable="false" />
  return (
    <div className={`cover cover-placeholder ${className}`} style={{ '--hue': hueFor(book.title) }}>
      <span className="cover-title">{book.title}</span>
      {book.author && <span className="cover-author">{book.author}</span>}
    </div>
  )
}
