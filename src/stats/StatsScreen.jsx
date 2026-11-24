// Übersicht: Streak, Tagesziel, letzte 7 Tage, Kalender, Zahlen, meistgelesene Bücher.
import { useMemo, useState } from 'react'
import Icon from '../components/Icon.jsx'
import { navigate } from '../lib/router.js'
import { useStats, setGoal, dayKey } from '../services/stats.js'
import { useSyncState } from '../services/sync/sync.js'

const GOALS = [5, 10, 15, 20, 30, 45, 60]
const WEEKDAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']

// 3720 Sek. → "1 Std. 2 Min.", 300 → "5 Min."
export function duration(sec, short = false) {
  const m = Math.round((sec ?? 0) / 60)
  if (m < 60) return short ? `${m} Min.` : `${m} Min.`
  const h = Math.floor(m / 60), r = m % 60
  return short ? `${(m / 60).toFixed(m < 600 ? 1 : 0).replace('.', ',')} Std.` : `${h} Std.${r ? ` ${r} Min.` : ''}`
}
const total = d => (d?.read ?? 0) + (d?.listen ?? 0)
const addDays = (date, n) => { const d = new Date(date); d.setDate(d.getDate() + n); return d }

export default function StatsScreen() {
  const s = useStats()
  const sync = useSyncState()
  const goalSec = s.goal * 60
  const todaySec = total(s.today)
  const ring = Math.min(1, todaySec / goalSec)

  return (
    <div className="stats">
      <header className="stats-header">
        <button className="icon-btn" onClick={() => navigate('/')} aria-label="Zur Bibliothek"><Icon name="back" /></button>
        <h1>Übersicht</h1>
      </header>

      <section className="stats-hero">
        <div className="streak-card">
          <Icon name="flame" size={30} className={s.streak ? 'flame-on' : 'flame-off'} />
          <div>
            <div className="streak-num">{s.streak} {s.streak === 1 ? 'Tag' : 'Tage'}</div>
            <div className="muted small">
              {s.streak ? 'in Folge' : 'Noch kein Streak'}
              {!s.metToday && s.streak > 0 ? ' · heute noch offen' : ''}
            </div>
            {s.longest > 0 && <div className="muted small">Längster Streak: {s.longest} {s.longest === 1 ? 'Tag' : 'Tage'}</div>}
          </div>
        </div>
        <div className="goal-card">
          <div className="goal-ring" style={{ '--p': ring }} role="img"
            aria-label={`Heute ${duration(todaySec)} von ${s.goal} Minuten Tagesziel`}>
            <div>
              <b>{Math.floor(todaySec / 60)}</b>
              <span>/ {s.goal} Min.</span>
            </div>
          </div>
          <div className="muted small goal-label">{s.metToday ? 'Tagesziel erreicht ✓' : 'heute'}</div>
        </div>
      </section>

      <WeekChart days={s.days} goalSec={goalSec} />
      <Calendar days={s.days} goalSec={goalSec} />

      <section className="stats-card">
        <h2>Zahlen</h2>
        <table className="stats-table">
          <thead><tr><th></th><th>Lesen</th><th>Hören</th><th>Gesamt</th></tr></thead>
          <tbody>
            {[['Heute', s.today], ['Diese Woche', s.week], ['Dieser Monat', s.month], ['Insgesamt', s.all]].map(([label, v]) => (
              <tr key={label}><th>{label}</th><td>{duration(v.read, true)}</td><td>{duration(v.listen, true)}</td><td><b>{duration(total(v), true)}</b></td></tr>
            ))}
          </tbody>
        </table>
        <p className="muted small">An {s.activeDays} {s.activeDays === 1 ? 'Tag' : 'Tagen'} gelesen oder gehört.</p>
      </section>

      {s.topBooks.length > 0 && (
        <section className="stats-card">
          <h2>Meiste Zeit</h2>
          <ol className="top-books">
            {s.topBooks.map(b => {
              const max = total(s.topBooks[0]) || 1
              return (
                <li key={b.title}>
                  <div className="top-book-head">
                    <span className="top-book-title">{b.type === 'audiobook' && <Icon name="headphones" size={14} />} {b.title}</span>
                    <span className="muted small">{duration(total(b))}</span>
                  </div>
                  <div className="top-book-bar"><span style={{ width: `${(total(b) / max) * 100}%` }} /></div>
                </li>
              )
            })}
          </ol>
        </section>
      )}

      <section className="stats-card">
        <h2>Tagesziel</h2>
        <p className="muted small">So viele Minuten Lesen oder Hören am Tag zählen für den Streak.</p>
        <div className="goal-options">
          {GOALS.map(m => (
            <button key={m} className={m === s.goal ? 'active' : ''} onClick={() => setGoal(m)}>{m} Min.</button>
          ))}
        </div>
      </section>

      <p className="muted small stats-foot">
        {sync.connected ? 'Zeiten von allen Geräten zusammengezählt (über den Geräte-Abgleich).'
          : 'Nur dieses Gerät. Mit dem Geräte-Abgleich werden die Zeiten aller Geräte zusammengezählt.'}
        {' '}Lesen zählt, solange du blätterst oder scrollst; Hören, solange das Hörbuch läuft.
      </p>
    </div>
  )
}

// Letzte 7 Tage als gestapelte Balken (Lesen / Hören) mit Ziellinie
function WeekChart({ days, goalSec }) {
  const [hover, setHover] = useState(null)
  const list = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const d = addDays(new Date(), i - 6)
    const k = dayKey(d)
    return { key: k, label: i === 6 ? 'Heute' : WEEKDAYS[d.getDay()], ...(days[k] ?? { read: 0, listen: 0 }) }
  }), [days])
  const max = Math.max(goalSec * 1.25, ...list.map(total), 60)
  const H = 140

  return (
    <section className="stats-card">
      <div className="card-head">
        <h2>Letzte 7 Tage</h2>
        <div className="legend">
          <span><i className="sw sw-read" />Lesen</span>
          <span><i className="sw sw-listen" />Hören</span>
        </div>
      </div>
      <div className="week-chart" style={{ height: H + 24 }} onMouseLeave={() => setHover(null)}>
        <div className="goal-line" style={{ bottom: 24 + (goalSec / max) * H }}><span>Ziel</span></div>
        {list.map(d => {
          const rh = (d.read / max) * H, lh = (d.listen / max) * H
          return (
            <button key={d.key} className={`week-col ${hover === d.key ? 'hover' : ''}`}
              onMouseEnter={() => setHover(d.key)} onFocus={() => setHover(d.key)} onClick={() => setHover(h => h === d.key ? null : d.key)}
              aria-label={`${d.label}: Lesen ${duration(d.read)}, Hören ${duration(d.listen)}`}>
              <div className="week-stack" style={{ height: H }}>
                {lh > 0.5 && <span className="seg seg-listen" style={{ height: Math.max(lh, 3) }} />}
                {rh > 0.5 && <span className="seg seg-read" style={{ height: Math.max(rh, 3) }} />}
              </div>
              <span className="week-label">{d.label}</span>
              {hover === d.key && (
                <span className="tip" role="tooltip">
                  <b>{d.label}</b><br />Lesen {duration(d.read)}<br />Hören {duration(d.listen)}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </section>
  )
}

// Kalender der letzten 18 Wochen: je dunkler, desto mehr Zeit; Ring = Ziel erreicht
function Calendar({ days, goalSec }) {
  const [hover, setHover] = useState(null)
  const weeks = 18
  const cells = useMemo(() => {
    const today = new Date()
    const end = addDays(today, 6 - ((today.getDay() + 6) % 7)) // Sonntag dieser Woche
    const start = addDays(end, -(weeks * 7) + 1)
    return Array.from({ length: weeks * 7 }, (_, i) => {
      const d = addDays(start, i)
      const k = dayKey(d)
      return { key: k, date: d, future: d > today, sec: total(days[k]) }
    })
  }, [days])
  const level = sec => !sec ? 0 : sec < goalSec * 0.5 ? 1 : sec < goalSec ? 2 : sec < goalSec * 2 ? 3 : 4
  const hovered = cells.find(c => c.key === hover)

  return (
    <section className="stats-card">
      <div className="card-head">
        <h2>Kalender</h2>
        <span className="muted small">
          {hovered ? `${hovered.date.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' })}: ${duration(hovered.sec)}` : 'letzte 18 Wochen'}
        </span>
      </div>
      <div className="calendar" style={{ gridTemplateColumns: `repeat(${weeks}, 1fr)` }} onMouseLeave={() => setHover(null)}>
        {cells.map(c => (
          <span key={c.key} className={`cal-cell l${c.future ? 'x' : level(c.sec)}`}
            onMouseEnter={() => setHover(c.key)} onClick={() => setHover(c.key)}
            title={`${c.date.toLocaleDateString('de-DE')}: ${duration(c.sec)}`} />
        ))}
      </div>
      <div className="cal-legend muted small">
        weniger <span className="cal-cell l0" /><span className="cal-cell l1" /><span className="cal-cell l2" /><span className="cal-cell l3" /><span className="cal-cell l4" /> mehr
        <span className="cal-note">· ab dem dritten Feld ist das Tagesziel erreicht</span>
      </div>
    </section>
  )
}
