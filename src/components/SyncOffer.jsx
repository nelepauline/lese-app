// Hinweis beim Öffnen: Auf einem anderen Gerät warst du an einer anderen Stelle.
import { clock, percent, timeAgo } from '../lib/format.js'

export default function SyncOffer({ offer, audio = false, onJump, onStay }) {
  const r = offer.remote
  const where = audio ? clock(r.position) : percent(r.fraction)
  return (
    <div className="sync-offer" role="status">
      <p>
        <strong>Zuletzt auf „{r.device}“ {audio ? 'gehört' : 'gelesen'}</strong>
        <span className="muted">{where}{r.chapter ? ` · ${r.chapter}` : ''} · {timeAgo(r.updatedAt)}</span>
      </p>
      <div className="sync-offer-actions">
        <button className="btn" onClick={onStay}>Hier bleiben</button>
        <button className="btn btn-primary" onClick={onJump}>Dorthin springen</button>
      </div>
    </div>
  )
}
