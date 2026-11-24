// Hauptkomponente: wählt je nach Adresse Bibliothek, Reader oder Player
// und sorgt für das Farb-Theme der ganzen App.
import { useEffect } from 'react'
import { useRoute } from './lib/router.js'
import { useSettings, useSystemDark, activeScheme, schemeVars } from './settings/settings.js'
import { AudioProvider } from './player/AudioProvider.jsx'
import Library from './library/Library.jsx'
import Reader from './reader/Reader.jsx'
import PlayerScreen from './player/PlayerScreen.jsx'
import MiniPlayer from './player/MiniPlayer.jsx'
import StatsScreen from './stats/StatsScreen.jsx'

export default function App() {
  const route = useRoute()
  const settings = useSettings()
  const systemDark = useSystemDark()
  const scheme = activeScheme(settings, systemDark)

  // Farbschema auf die ganze App anwenden
  useEffect(() => {
    const root = document.documentElement
    root.dataset.theme = scheme.dark ? 'dark' : 'light'
    for (const [k, v] of Object.entries(schemeVars(scheme))) root.style.setProperty(k, v)
    root.style.colorScheme = scheme.dark ? 'dark' : 'light'
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', scheme.bg)
  }, [scheme])

  return (
    <AudioProvider>
      {/* Deckt den Bereich unter der Statusleiste ab – sonst verschwimmt dort
          der Inhalt beim Scrollen (iOS-Effekt bei Web-Apps auf dem Home-Bildschirm) */}
      <div className="status-cover" aria-hidden="true" />
      {route.view === 'read' && route.id ? <Reader key={route.id} id={route.id} />
        : route.view === 'listen' && route.id ? <PlayerScreen key={route.id} id={route.id} />
        : route.view === 'stats' ? <StatsScreen />
        : <Library />}
      {(route.view === 'library' || route.view === 'stats') && <MiniPlayer />}
    </AudioProvider>
  )
}
