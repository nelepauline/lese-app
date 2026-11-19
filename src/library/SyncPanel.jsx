// Einstellungen für den Abgleich zwischen Geräten (über GitHub)
import { useState } from 'react'
import Sheet from '../components/Sheet.jsx'
import { useSyncState, connect, disconnect, renameDevice, syncNow } from '../services/sync/sync.js'
import { timeAgo } from '../lib/format.js'

const tokenUrl = name =>
  `https://github.com/settings/tokens/new?scopes=gist&description=${encodeURIComponent(`Lesezeit (${name || 'Gerät'})`)}`

export default function SyncPanel({ onClose }) {
  const s = useSyncState()
  const [token, setToken] = useState('')
  const [name, setName] = useState(s.deviceName)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function onConnect(e) {
    e.preventDefault()
    setBusy(true); setError(null)
    try { await connect(token, name); setToken('') }
    catch (err) { setError(err.message || String(err)) }
    finally { setBusy(false) }
  }

  function onDisconnect() {
    if (confirm('Abgleich auf diesem Gerät beenden? Deine Bücher und Positionen bleiben hier erhalten.')) disconnect()
  }

  if (!s.connected) return (
    <Sheet title="Geräte abgleichen" onClose={onClose}>
      <form className="settings sync-panel" onSubmit={onConnect}>
        <p>Gleicht deine Lese- und Hörpositionen und Lesezeichen über dein GitHub-Konto zwischen
          deinen Geräten ab. Die Bücher selbst werden nicht hochgeladen.</p>

        <label htmlFor="sync-name">1. Name dieses Geräts</label>
        <input id="sync-name" className="input" value={name} onChange={e => setName(e.target.value)} />

        <label>2. Schlüssel bei GitHub erstellen</label>
        <ol className="sync-steps">
          <li>Auf „GitHub öffnen“ tippen (das Häkchen bei <b>gist</b> ist schon gesetzt).</li>
          <li>Bei <b>Expiration</b> am besten „No expiration“ wählen.</li>
          <li>Ganz unten auf <b>Generate token</b> tippen.</li>
          <li>Den Schlüssel (beginnt mit <code>ghp_</code>) kopieren und hierher zurückkommen.</li>
        </ol>
        <a className="btn" href={tokenUrl(name)} target="_blank" rel="noopener noreferrer">GitHub öffnen</a>

        <label htmlFor="sync-token">3. Schlüssel einfügen</label>
        <input id="sync-token" className="input" type="password" value={token} placeholder="ghp_…"
          autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck="false"
          onChange={e => setToken(e.target.value)} />

        <button className="btn btn-primary sync-connect" type="submit" disabled={!token.trim() || busy}>
          {busy ? 'Verbinde …' : 'Verbinden'}
        </button>
        {error && <p className="notice notice-error">{error}</p>}
        <p className="muted small">Auf jedem Gerät einmal einrichten – am einfachsten mit je einem eigenen Schlüssel.
          Der Schlüssel bleibt nur auf diesem Gerät gespeichert und erlaubt ausschließlich Zugriff auf Gists.</p>
      </form>
    </Sheet>
  )

  const status = s.syncing ? 'Gleiche ab …'
    : s.error ? s.error
    : s.lastSyncAt ? `Zuletzt abgeglichen ${timeAgo(s.lastSyncAt)}` : ''

  return (
    <Sheet title="Geräte abgleichen" onClose={onClose}>
      <div className="settings sync-panel">
        <p>✓ Verbunden mit GitHub als <b>{s.login}</b></p>
        <p className={`small ${s.error ? 'sync-error' : 'muted'}`}>{status}</p>

        <label htmlFor="sync-name">Name dieses Geräts</label>
        <input id="sync-name" className="input" value={name} onChange={e => setName(e.target.value)}
          onBlur={() => renameDevice(name)} />

        <div className="sync-buttons">
          <button className="btn" onClick={() => syncNow().catch(() => {})} disabled={s.syncing}>Jetzt abgleichen</button>
          <button className="btn" onClick={onDisconnect}>Trennen</button>
        </div>
        <p className="muted small">Öffnest du ein Buch, das auf einem anderen Gerät an einer anderen Stelle ist,
          fragt die App, ob du dorthin springen möchtest.</p>
      </div>
    </Sheet>
  )
}
