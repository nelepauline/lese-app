// Kleine Wiedergabeleiste unten in der Bibliothek, solange ein Hörbuch geladen ist.
import { useAudio, useAudioTime, chapterIndexAt } from './AudioProvider.jsx'
import { navigate } from '../lib/router.js'
import Icon from '../components/Icon.jsx'
import Cover from '../components/Cover.jsx'

export default function MiniPlayer() {
  const audio = useAudio()
  const { position, duration } = useAudioTime()
  if (!audio.book) return null
  const chapter = audio.chapters[chapterIndexAt(audio.chapters, position)]

  return (
    <div className="mini-player">
      <div className="mini-progress"><span style={{ width: `${duration ? (position / duration) * 100 : 0}%` }} /></div>
      <button className="mini-open" onClick={() => navigate(`/listen/${audio.book.id}`)}>
        <Cover book={audio.book} className="mini-cover" />
        <span className="mini-text">
          <span className="mini-title">{audio.book.title}</span>
          <span className="mini-sub">{chapter?.title ?? audio.book.author}</span>
        </span>
      </button>
      <button className="icon-btn" onClick={() => audio.seekBy(-30)} aria-label="30 Sekunden zurück"><Icon name="back30" size={28} /></button>
      <button className="icon-btn" onClick={audio.toggle} aria-label={audio.playing ? 'Pause' : 'Abspielen'}>
        <Icon name={audio.playing ? 'pause' : 'play'} size={28} />
      </button>
    </div>
  )
}
