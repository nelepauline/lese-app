// Notizbuch im Reader: Markierungen (nach Kategorie, gleiche Namen
// zusammengefasst), Lesezeichen und eigene Bilder (z. B. Karten).
import { useEffect, useMemo, useRef, useState } from 'react'
import Sheet from '../components/Sheet.jsx'
import Icon from '../components/Icon.jsx'
import { BookmarkList } from './BookmarksPanel.jsx'
import CategoryEditor from './CategoryEditor.jsx'
import ImageViewer from './ImageViewer.jsx'
import { colorOf, REACTIONS, reactionEmoji, groupKey } from '../services/highlights.js'
import { listImages, addImage, renameImage, removeImage } from '../services/bookImages.js'
import { clock } from '../lib/format.js'

const ALL_TABS = [['highlights', 'Markierungen'], ['bookmarks', 'Lesezeichen'], ['images', 'Bilder']]

// Text einer Markierung; bei Hörbüchern ohne Stichwort die Zeit
const labelOf = h => h.text?.trim() || (h.position != null ? `⏱ ${clock(h.position)}` : '')
const whereOf = h => [h.chapter, h.position != null ? clock(h.position) : h.fraction != null ? `${Math.round(h.fraction * 100)} %` : ''].filter(Boolean).join(' · ')

export default function NotebookPanel({
  bookId, tab: initialTab = 'highlights', tabs = ['highlights', 'bookmarks', 'images'], highlights, categories, bookmarks = [],
  onSelect, onOpenHighlight, onDeleteBookmark, onSearch, onClose,
}) {
  const [tab, setTab] = useState(initialTab)
  const [editCats, setEditCats] = useState(false)

  return (
    <Sheet title={editCats ? 'Kategorien' : 'Notizbuch'} onClose={editCats ? () => setEditCats(false) : onClose}>
      {editCats ? <CategoryEditor categories={categories} highlights={highlights} onDone={() => setEditCats(false)} /> : (
        <>
          <nav className="segmented nb-tabs" aria-label="Bereich">
            {ALL_TABS.filter(([key]) => tabs.includes(key)).map(([key, label]) => (
              <button key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>{label}</button>
            ))}
          </nav>
          {tab === 'highlights' && (
            <HighlightOverview highlights={highlights} categories={categories} onSelect={onSelect}
              onOpen={onOpenHighlight} onSearch={onSearch} onEditCategories={() => setEditCats(true)} />
          )}
          {tab === 'bookmarks' && <BookmarkList bookmarks={bookmarks} onSelect={onSelect} onDelete={onDeleteBookmark} />}
          {tab === 'images' && <ImageGallery bookId={bookId} />}
        </>
      )}
    </Sheet>
  )
}

// ---------------------------------------------------------------------------
function HighlightOverview({ highlights, categories, onSelect, onOpen, onSearch, onEditCategories }) {
  const [catFilter, setCatFilter] = useState('all')
  const [reaction, setReaction] = useState('')
  const [open, setOpen] = useState(null) // aufgeklappte Gruppe

  const counts = useMemo(() => {
    const m = {}
    for (const h of highlights) m[h.catId] = (m[h.catId] ?? 0) + 1
    return m
  }, [highlights])

  const filtered = highlights.filter(h =>
    (catFilter === 'all' || h.catId === catFilter) && (!reaction || h.reaction === reaction))

  // Kategorien in ihrer Reihenfolge; Markierungen ohne (gelöschte) Kategorie am Ende
  const known = new Set(categories.map(c => c.id))
  const sections = [
    ...categories.map(c => ({ cat: c, items: filtered.filter(h => h.catId === c.id) })),
    { cat: { id: '_none', name: 'Ohne Kategorie', color: 'stone', group: false }, items: filtered.filter(h => !known.has(h.catId)) },
  ].filter(s => s.items.length)

  if (!highlights.length) {
    return (
      <div className="pad nb-empty">
        <p className="muted">{onSearch
          ? 'Noch keine Markierungen. Markiere im Buch ein Wort oder einen Satz (lange drücken und ziehen) und tippe dann unten auf eine Kategorie.'
          : 'Noch keine Markierungen. Tippe im Player auf „Markieren“, um dir die aktuelle Stelle zu merken.'}</p>
        <button className="btn" onClick={onEditCategories}>Kategorien bearbeiten</button>
      </div>
    )
  }

  return (
    <div className="nb-highlights">
      <div className="hl-chips nb-filter">
        <button className={`hl-chip ${catFilter === 'all' ? 'active' : ''}`} onClick={() => setCatFilter('all')}>
          Alle <span className="muted">{highlights.length}</span>
        </button>
        {categories.filter(c => counts[c.id]).map(c => (
          <button key={c.id} className={`hl-chip ${catFilter === c.id ? 'active' : ''}`} onClick={() => setCatFilter(c.id)}>
            <span className="hl-dot" style={{ background: colorOf(c.color).chip }} />{c.name} <span className="muted">{counts[c.id]}</span>
          </button>
        ))}
      </div>
      <div className="hl-reactions nb-reaction-filter" aria-label="Nach Reaktion filtern">
        {REACTIONS.filter(([key]) => highlights.some(h => h.reaction === key)).map(([key, emoji, label]) => (
          <button key={key} className={reaction === key ? 'active' : ''} title={label} aria-label={label}
            onClick={() => setReaction(r => r === key ? '' : key)}>{emoji}</button>
        ))}
      </div>

      {!sections.length && <p className="muted pad">Keine Markierungen für diesen Filter.</p>}

      {sections.map(({ cat, items }) => (
        <section key={cat.id} className="nb-section">
          <h3><span className="hl-dot" style={{ background: colorOf(cat.color).chip }} />{cat.name}
            <span className="muted"> {items.length}</span></h3>
          {cat.group ? <GroupedList items={items} cat={cat} open={open} setOpen={setOpen}
            onSelect={onSelect} onOpen={onOpen} onSearch={onSearch} />
            : <ul className="nb-list">{items.map(h => <HighlightItem key={h.id} h={h} cat={cat} onSelect={onSelect} onOpen={onOpen} />)}</ul>}
        </section>
      ))}

      <div className="pad"><button className="btn small" onClick={onEditCategories}>Kategorien bearbeiten</button></div>
    </div>
  )
}

// Namen/Orte: gleiche Texte zusammengefasst, aufklappbar mit allen Stellen
function GroupedList({ items, cat, open, setOpen, onSelect, onOpen, onSearch }) {
  const groups = useMemo(() => {
    const m = new Map()
    for (const h of items) {
      const k = groupKey(h.text) || h.id
      if (!m.has(k)) m.set(k, { key: k, label: labelOf(h), items: [] })
      m.get(k).items.push(h)
    }
    return [...m.values()].sort((a, b) => a.label.localeCompare(b.label, 'de'))
  }, [items])

  return (
    <ul className="nb-list">
      {groups.map(g => {
        const id = cat.id + ':' + g.key
        const isOpen = open === id
        const notes = g.items.filter(h => h.note).length
        return (
          <li key={id} className="nb-group">
            <button className="nb-group-head" onClick={() => setOpen(isOpen ? null : id)} aria-expanded={isOpen}>
              <span className="nb-name" style={{ background: colorOf(cat.color).mark + '66' }}>{g.label}</span>
              <span className="muted small">{g.items.length}× {notes ? `· ${notes} Notiz${notes > 1 ? 'en' : ''}` : ''}</span>
              <span className="muted nb-chevron">{isOpen ? '▾' : '▸'}</span>
            </button>
            {isOpen && (
              <div className="nb-group-body">
                <ul className="nb-list">
                  {g.items.map(h => <HighlightItem key={h.id} h={h} cat={cat} onSelect={onSelect} onOpen={onOpen} compact />)}
                </ul>
                {onSearch && <button className="btn small" onClick={() => onSearch(g.label)}>Alle Stellen im Buch suchen</button>}
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

function HighlightItem({ h, cat, onSelect, onOpen, compact }) {
  return (
    <li className="nb-item">
      <button className="nb-item-main" onClick={() => onSelect(h.position ?? h.cfi)}>
        {!compact && <span className="nb-text" style={{ borderColor: colorOf(cat.color).chip }}>{labelOf(h)}</span>}
        {compact && h.context && (
          <span className="nb-context">…{h.context.pre}<mark style={{ background: colorOf(cat.color).mark + '99' }}>{h.text}</mark>{h.context.post}…</span>
        )}
        <span className="nb-meta">
          {h.reaction && <span className="nb-emoji">{reactionEmoji(h.reaction)}</span>}
          {whereOf(h)}
        </span>
        {h.note && <span className="nb-note">„{h.note}“</span>}
      </button>
      <button className="icon-btn small" onClick={() => onOpen(h)} aria-label="Markierung bearbeiten" title="Bearbeiten">
        <Icon name="more" size={16} />
      </button>
    </li>
  )
}

// ---------------------------------------------------------------------------
function ImageGallery({ bookId }) {
  const [images, setImages] = useState(null)
  const [viewing, setViewing] = useState(null)
  const [busy, setBusy] = useState(false)
  const input = useRef()
  const urls = useMemo(() => new Map((images ?? []).map(i => [i.id, URL.createObjectURL(i.blob)])), [images])
  useEffect(() => () => urls.forEach(u => URL.revokeObjectURL(u)), [urls])

  const reload = () => listImages(bookId).then(setImages)
  useEffect(() => { reload() }, [bookId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function onFiles(e) {
    const files = [...e.target.files].filter(f => f.type.startsWith('image/'))
    e.target.value = ''
    if (!files.length) return
    setBusy(true)
    for (const f of files) await addImage(bookId, f)
    setBusy(false)
    reload()
  }

  return (
    <div className="nb-images">
      <p className="muted small pad">Karten, Stammbäume oder andere Bilder zum Buch – immer griffbereit beim Lesen.</p>
      <ul className="img-grid">
        {(images ?? []).map(img => (
          <li key={img.id}>
            <button onClick={() => setViewing(img)}>
              <img src={urls.get(img.id)} alt="" />
              <span>{img.name}</span>
            </button>
          </li>
        ))}
        <li>
          <button className="img-add" onClick={() => input.current.click()} disabled={busy}>
            <Icon name="plus" size={26} />
            <span>{busy ? 'Speichere …' : 'Bild hinzufügen'}</span>
          </button>
        </li>
      </ul>
      <input ref={input} type="file" accept="image/*" multiple hidden onChange={onFiles} />
      {viewing && (
        <ImageViewer image={viewing} url={urls.get(viewing.id)} onClose={() => setViewing(null)}
          onRename={async name => { setViewing(await renameImage(viewing, name)); reload() }}
          onDelete={async () => {
            if (!confirm(`„${viewing.name}“ löschen?`)) return
            await removeImage(viewing); setViewing(null); reload()
          }} />
      )}
    </div>
  )
}
