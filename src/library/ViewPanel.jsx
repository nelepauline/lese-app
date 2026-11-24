// "Ansicht": Darstellung der Bibliothek (Raster, Liste, Regal) und Cover-Größe.
import Sheet from '../components/Sheet.jsx'
import Icon from '../components/Icon.jsx'

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

export default function ViewPanel({ view, onChange, onClose }) {
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
      </div>
    </Sheet>
  )
}
