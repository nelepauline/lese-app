// Zeigt das gespeicherte Cover eines Buchs – oder ein schlichtes Platzhalter-Cover.
import { useEffect, useState } from 'react'
import { getCover } from '../db/db.js'

const HUES = [24, 200, 140, 340, 260, 40, 170]
const hueFor = text => HUES[[...(text || '')].reduce((a, c) => a + c.charCodeAt(0), 0) % HUES.length]

// version: ändert sich, wenn ein neues Cover gespeichert wurde (book.coverEditedAt)
export function useCoverUrl(bookId, version) {
  const [url, setUrl] = useState(null)
  useEffect(() => {
    let objectUrl, alive = true
    getCover(bookId).then(blob => {
      if (!alive) return
      if (!blob) { setUrl(null); return }
      objectUrl = URL.createObjectURL(blob)
      setUrl(objectUrl)
    })
    return () => { alive = false; if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [bookId, version])
  return url
}

export default function Cover({ book, className = '' }) {
  const url = useCoverUrl(book.id, book.coverEditedAt)
  if (url) return <img className={`cover ${className}`} src={url} alt="" draggable="false" />
  return (
    <div className={`cover cover-placeholder ${className}`} style={{ '--hue': hueFor(book.title) }}>
      <span className="cover-title">{book.title}</span>
      {book.author && <span className="cover-author">{book.author}</span>}
    </div>
  )
}
