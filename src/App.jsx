// Hauptkomponente: wählt je nach Adresse Bibliothek, Reader oder Player
// und sorgt für das Farb-Theme der ganzen App.
import { useEffect } from 'react'
import { useRoute } from './lib/router.js'
import { useSettings, THEMES } from './settings/settings.js'
import { AudioProvider } from './player/AudioProvider.jsx'
import Library from './library/Library.jsx'
import Reader from './reader/Reader.jsx'
import PlayerScreen from './player/PlayerScreen.jsx'
import MiniPlayer from './player/MiniPlayer.jsx'
import StatsScreen from './stats/StatsScreen.jsx'

export default function App() {
  const route = useRoute()
  const { theme } = useSettings()

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEMES[theme].bg)
  }, [theme])

  return (
    <AudioProvider>
      {route.view === 'read' && route.id ? <Reader key={route.id} id={route.id} />
        : route.view === 'listen' && route.id ? <PlayerScreen key={route.id} id={route.id} />
        : route.view === 'stats' ? <StatsScreen />
        : <Library />}
      {(route.view === 'library' || route.view === 'stats') && <MiniPlayer />}
    </AudioProvider>
  )
}
