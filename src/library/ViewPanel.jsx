// "Ansicht": Darstellung der Bibliothek (Raster, Liste, Regal), Cover-Größe,
// Sortierung und Farbschema der App.
import Sheet from '../components/Sheet.jsx'
import Icon from '../components/Icon.jsx'
import { useSettings, updateSettings, useSystemDark, SCHEMES, LIGHT_SCHEMES, DARK_SCHEMES } from '../settings/settings.js'

export const LAYOUTS = [
  ['grid', 'Raster', 'grid'],
  ['list', 'Liste', 'list'],
  ['shelf', 'Regal', 'shelf'],
]
export const SIZES = [
  ['small', 'Klein'],
  ['medium', 'Mittel'],
  ['large', 'Groß'],
]
const APPEARANCES = [
  ['auto', 'Automatisch'],
  ['light', 'Hell'],
  ['dark', 'Dunkel'],
]

export default function ViewPanel({ view, onChange, sort, sorts, onSort, onClose }) {
  const s = useSettings()
  const systemDark = useSystemDark()
  const darkNow = s.appearance === 'dark' || (s.appearance === 'auto' && systemDark)

  return (
    <Sheet title="Ansicht" onClose={onClose}>
      <div className="settings">
        <label>Darstellung</label>
        <div className="layout-options">
          {LAYOUTS.map(([key, label, icon]) => (
            <button key={key} className={view.layout === key ? 'active' : ''} aria-pressed={view.layout === key}
              onClick={() => onChange({ layout: key })}>
              <Icon name={icon} size={26} />
              <span>{label}</span>
            </button>
          ))}
        </div>

        {view.layout !== 'list' && (
          <>
            <label>Cover-Größe</label>
            <div className="segmented">
              {SIZES.map(([key, label]) => (
                <button key={key} className={view.size === key ? 'active' : ''} onClick={() => onChange({ size: key })}>{label}</button>
              ))}
            </div>
          </>
        )}

        <label>Sortieren</label>
        <div className="sort-options">
          {sorts.map(([key, label]) => (
            <button key={key} className={sort === key ? 'active' : ''} onClick={() => onSort(key)}>{label}</button>
          ))}
        </div>

        <label>Hell oder dunkel</label>
        <div className="segmented">
          {APPEARANCES.map(([key, label]) => (
            <button key={key} className={s.appearance === key ? 'active' : ''} onClick={() => updateSettings({ appearance: key })}>{label}</button>
          ))}
        </div>
        {s.appearance === 'auto' && <p className="muted small">Folgt dem Gerät: tagsüber hell, abends dunkel (wie in den iPhone-Einstellungen).</p>}

        <label>Farbschema hell</label>
        <SchemePicker keys={LIGHT_SCHEMES} value={s.lightScheme} onPick={k => updateSettings({ lightScheme: k, ...(s.appearance === 'dark' ? { appearance: 'light' } : {}) })} active={!darkNow} />
        <label>Farbschema dunkel</label>
        <SchemePicker keys={DARK_SCHEMES} value={s.darkScheme} onPick={k => updateSettings({ darkScheme: k, ...(s.appearance === 'light' ? { appearance: 'dark' } : {}) })} active={darkNow} />
      </div>
    </Sheet>
  )
}

function SchemePicker({ keys, value, onPick, active }) {
  return (
    <div className={`scheme-grid ${active ? '' : 'inactive'}`}>
      {keys.map(k => {
        const sc = SCHEMES[k]
        return (
          <button key={k} className={`scheme-card ${value === k ? 'active' : ''}`} onClick={() => onPick(k)}
            style={{ background: sc.bg, color: sc.fg, borderColor: value === k ? sc.accent : sc.line }} aria-pressed={value === k}>
            <span className="scheme-dots">
              <i style={{ background: sc.accent }} /><i style={{ background: sc.surface2 }} /><i style={{ background: sc.shelfTop }} />
            </span>
            <span>{sc.label}</span>
          </button>
        )
      })}
    </div>
  )
}
