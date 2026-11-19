// Leseeinstellungen: Theme, Schrift, Größe, Zeilenabstand, Ränder, Blocksatz, Blättern/Scrollen
import Sheet from '../components/Sheet.jsx'
import { useSettings, updateSettings, THEMES, FONTS, MARGINS } from '../settings/settings.js'

function Choice({ options, value, onChange, render }) {
  return (
    <div className="segmented">
      {options.map(([key, label]) => (
        <button key={String(key)} className={value === key ? 'active' : ''} onClick={() => onChange(key)}>
          {render ? render(key, label) : label}
        </button>
      ))}
    </div>
  )
}

export default function SettingsPanel({ onClose }) {
  const s = useSettings()
  const set = changes => updateSettings(changes)
  const clampSize = n => Math.min(200, Math.max(70, n))

  return (
    <Sheet title="Darstellung" onClose={onClose}>
      <div className="settings">
        <label>Farbe</label>
        <div className="theme-row">
          {Object.entries(THEMES).map(([key, t]) => (
            <button key={key} className={`theme-swatch ${s.theme === key ? 'active' : ''}`}
              style={{ background: t.bg, color: t.fg }} onClick={() => set({ theme: key })}>
              {t.label}
            </button>
          ))}
        </div>

        <label>Schrift</label>
        <div className="font-grid">
          {Object.entries(FONTS).map(([key, f]) => (
            <button key={key} className={s.font === key ? 'active' : ''}
              style={{ fontFamily: f.css ?? 'inherit' }} onClick={() => set({ font: key })}>
              {f.label}
            </button>
          ))}
        </div>

        <label>Schriftgröße</label>
        <div className="stepper">
          <button onClick={() => set({ fontSize: clampSize(s.fontSize - 10) })} aria-label="Kleiner"><span style={{ fontSize: 14 }}>A</span></button>
          <span>{s.fontSize} %</span>
          <button onClick={() => set({ fontSize: clampSize(s.fontSize + 10) })} aria-label="Größer"><span style={{ fontSize: 22 }}>A</span></button>
        </div>

        <label>Zeilenabstand</label>
        <Choice value={s.lineHeight} onChange={v => set({ lineHeight: v })}
          options={[[1.3, 'Eng'], [1.5, 'Normal'], [1.75, 'Weit'], [2, 'Sehr weit']]} />

        <label>Seitenränder</label>
        <Choice value={s.margin} onChange={v => set({ margin: v })}
          options={Object.entries(MARGINS).map(([k, m]) => [k, m.label])} />

        <label>Ausrichtung</label>
        <Choice value={s.justify} onChange={v => set({ justify: v })}
          options={[[true, 'Blocksatz'], [false, 'Flattersatz']]} />

        <label>Lesemodus</label>
        <Choice value={s.flow} onChange={v => set({ flow: v })}
          options={[['paginated', 'Blättern'], ['scrolled', 'Scrollen']]} />
      </div>
    </Sheet>
  )
}
