// Sehr kleiner "Router" über den Teil nach dem # in der Adresse.
//   #/              → Bibliothek
//   #/read/<id>     → E-Book lesen
//   #/listen/<id>   → Hörbuch hören
//   #/stats         → Übersicht (Lesezeit, Streak)
import { useEffect, useState } from 'react'

function parse() {
  const [, view = '', id] = location.hash.replace(/^#/, '').split('/')
  return { view: view || 'library', id: id ? decodeURIComponent(id) : null }
}

export function useRoute() {
  const [route, setRoute] = useState(parse)
  useEffect(() => {
    const onChange = () => setRoute(parse())
    addEventListener('hashchange', onChange)
    return () => removeEventListener('hashchange', onChange)
  }, [])
  return route
}

export function navigate(path) {
  location.hash = path
}
