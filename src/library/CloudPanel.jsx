// OneDrive-Ordner verbinden: anmelden, Ordner auswählen, aktualisieren.
import { useEffect, useState } from 'react'
import Sheet from '../components/Sheet.jsx'
import Icon from '../components/Icon.jsx'
import { timeAgo } from '../lib/format.js'
import {
  useCloudState, signIn, signOut, listFolder, chooseFolder, forgetFolder, refreshLibrary, clearError,
} from '../services/cloud/cloudLibrary.js'
import { BOOK_EXT } from '../services/cloud/onedrive.js'

export default function CloudPanel({ onClose }) {
  const c = useCloudState()
  const [choosing, setChoosing] = useState(!c.folder)

  useEffect(() => () => clearError(), [])

  let body
  if (!c.configured) {
    body = (
      <div className="settings sync-panel">
        <p>Die Verbindung zu OneDrive ist vorbereitet, aber noch nicht bei Microsoft angemeldet.
          Sobald die App dort registriert ist, kannst du hier deinen Bücher-Ordner verbinden.</p>
      </div>
    )
  } else if (!c.signedIn) {
    body = (
      <div className="settings sync-panel">
        {c.folder
          ? <p>Die Anmeldung bei OneDrive ist abgelaufen (Microsoft erlaubt nur ca. 24 Stunden).
              Heruntergeladene Bücher kannst du weiter lesen. Für neue Downloads bitte kurz neu anmelden.</p>
          : <p>Verbinde einen OneDrive-Ordner: Alle EPUBs und Hörbücher darin erscheinen in deiner
              Bibliothek. Herunterladen musst du nur die Bücher, die du gerade brauchst.</p>}
        <button className="btn btn-primary" onClick={() => signIn().catch(() => {})}>Mit Microsoft anmelden</button>
        <p className="muted small">Die App darf deine Dateien nur lesen, nie ändern oder löschen.</p>
        {c.error && <p className="notice notice-error">{c.error}</p>}
      </div>
    )
  } else if (choosing || !c.folder) {
    body = <FolderBrowser onChoose={async f => { setChoosing(false); await chooseFolder(f).catch(() => {}) }}
      onCancel={c.folder ? () => setChoosing(false) : null} error={c.error} />
  } else {
    body = (
      <div className="settings sync-panel">
        <p>✓ Angemeldet{c.account ? <> als <b>{c.account}</b></> : ''}</p>
        <label>Bücher-Ordner</label>
        <p className="cloud-folder"><Icon name="folder" size={18} /> {c.folder.path || c.folder.name}</p>
        <p className={`small ${c.error ? 'sync-error' : 'muted'}`}>
          {c.refreshing ? 'Lese Ordner …' : c.error || (c.lastRefresh ? `Aktualisiert ${timeAgo(c.lastRefresh)}` : '')}
        </p>
        <div className="sync-buttons">
          <button className="btn" onClick={() => refreshLibrary().catch(() => {})} disabled={c.refreshing}>Aktualisieren</button>
          <button className="btn" onClick={() => setChoosing(true)}>Ordner ändern</button>
        </div>
        <div className="sync-buttons">
          <button className="btn" onClick={() => {
            if (confirm('Ordner trennen? Nicht heruntergeladene Bücher verschwinden aus der Bibliothek, heruntergeladene bleiben.')) forgetFolder()
          }}>Ordner trennen</button>
          <button className="btn" onClick={signOut}>Abmelden</button>
        </div>
        <p className="muted small">Neue Bücher im Ordner erscheinen beim Öffnen der App automatisch.
          Tippe auf ein Buch mit Wolke, um es herunterzuladen.</p>
      </div>
    )
  }

  return <Sheet title="OneDrive-Ordner" onClose={onClose}>{body}</Sheet>
}

function FolderBrowser({ onChoose, onCancel, error }) {
  const [stack, setStack] = useState([{ id: 'root', name: 'OneDrive' }])
  const [items, setItems] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const current = stack[stack.length - 1]

  useEffect(() => {
    let alive = true
    setItems(null); setLoadError(null)
    listFolder(current.id)
      .then(list => alive && setItems(list))
      .catch(err => alive && setLoadError(err.message || String(err)))
    return () => { alive = false }
  }, [current.id])

  const folders = (items ?? []).filter(i => i.folder).sort((a, b) => a.name.localeCompare(b.name, 'de'))
  const bookCount = (items ?? []).filter(i => i.file && BOOK_EXT.test(i.name)).length
  const path = stack.slice(1).map(s => s.name).join(' / ')

  return (
    <div className="folder-browser">
      <div className="folder-crumbs">
        {stack.length > 1 && (
          <button className="icon-btn small" onClick={() => setStack(s => s.slice(0, -1))} aria-label="Zurück"><Icon name="back" size={18} /></button>
        )}
        <span>{path || 'OneDrive'}</span>
      </div>

      {!items && !loadError && <p className="muted pad">Lade …</p>}
      {(loadError || error) && <p className="notice notice-error" style={{ margin: '8px 16px' }}>{loadError || error}</p>}

      {items && (
        <>
          <ul className="folder-list">
            {folders.map(f => (
              <li key={f.id}>
                <button onClick={() => setStack(s => [...s, { id: f.id, name: f.name }])}>
                  <Icon name="folder" size={20} /> <span>{f.name}</span>
                  <span className="muted small">{f.folder.childCount ?? ''}</span>
                </button>
              </li>
            ))}
            {!folders.length && <li className="muted pad small">Keine Unterordner</li>}
          </ul>
          <div className="folder-actions">
            <p className="muted small">
              {bookCount === 1 ? '1 Buch' : `${bookCount} Bücher`} direkt in diesem Ordner
              (Unterordner werden mit durchsucht)
            </p>
            <div className="sync-buttons">
              {onCancel && <button className="btn" onClick={onCancel}>Abbrechen</button>}
              <button className="btn btn-primary" disabled={stack.length === 1 && !bookCount && !folders.length}
                onClick={() => onChoose({ id: current.id, name: current.name, path: path || 'OneDrive' })}>
                Diesen Ordner verwenden
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
