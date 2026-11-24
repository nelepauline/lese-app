// Angaben eines Buchs bearbeiten: Cover, Titel, Autor/in, Serie, Band.
// Unten außerdem: Download entfernen bzw. vom Gerät löschen.
import { useEffect, useRef, useState } from 'react'
import Sheet from '../components/Sheet.jsx'
import Cover from '../components/Cover.jsx'
import { saveBookMeta } from '../services/bookMeta.js'
import HardcoverLinkSheet from '../components/HardcoverLink.jsx'
import { useHardcover, linkOf, unlinkBook } from '../services/hardcover/hardcover.js'

export default function EditBook({ book, allSeries, allAuthors, cloudName, onClose, onSaved, onDelete, onRemoveDownload }) {
  const [form, setForm] = useState({
    title: book.title ?? '',
    author: book.author ?? '',
    series: book.series ?? '',
    seriesIndex: book.seriesIndex ?? '',
  })
  const [coverFile, setCoverFile] = useState(null)
  const [coverPreview, setCoverPreview] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const coverInput = useRef()
  const hc = useHardcover()
  const [hcLink, setHcLink] = useState(book.hardcover)
  const [linking, setLinking] = useState(false)
  const link = linkOf({ hardcover: hcLink })

  useEffect(() => () => { if (coverPreview) URL.revokeObjectURL(coverPreview) }, [coverPreview])

  const set = key => e => setForm(f => ({ ...f, [key]: e.target.value }))

  function pickCover(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) { setError('Bitte ein Bild auswählen.'); return }
    setError(null)
    setCoverFile(file)
    setCoverPreview(URL.createObjectURL(file))
  }

  async function save(e) {
    e.preventDefault()
    if (!form.title.trim()) { setError('Der Titel darf nicht leer sein.'); return }
    setSaving(true)
    try {
      await saveBookMeta(book.id, form, coverFile)
      onSaved()
      onClose()
    } catch (err) {
      console.error(err)
      setError('Speichern hat nicht geklappt: ' + (err.message || err))
      setSaving(false)
    }
  }

  return (
    <Sheet title="Buch bearbeiten" onClose={onClose}>
      <form className="settings edit-book" onSubmit={save}>
        <div className="edit-cover">
          <div className="edit-cover-img">
            {coverPreview ? <img className="cover" src={coverPreview} alt="" /> : <Cover book={book} />}
          </div>
          <div className="edit-cover-actions">
            <button type="button" className="btn" onClick={() => coverInput.current.click()}>Cover ändern</button>
            <p className="muted small">
              {coverFile ? 'Neues Cover – wird beim Speichern übernommen.' : 'Ein Bild aus deinen Fotos oder Dateien.'}
            </p>
          </div>
          <input ref={coverInput} type="file" accept="image/*" hidden onChange={pickCover} />
        </div>

        <label htmlFor="eb-title">Titel</label>
        <input id="eb-title" className="input" value={form.title} onChange={set('title')} autoComplete="off" />

        <label htmlFor="eb-author">Autor/in</label>
        <input id="eb-author" className="input" value={form.author} onChange={set('author')}
          list="eb-authors" autoComplete="off" placeholder="z. B. Jane Austen" />
        <datalist id="eb-authors">{allAuthors.map(a => <option key={a} value={a} />)}</datalist>

        <div className="edit-series">
          <div>
            <label htmlFor="eb-series">Serie</label>
            <input id="eb-series" className="input" value={form.series} onChange={set('series')}
              list="eb-series-list" autoComplete="off" placeholder="keine" />
            <datalist id="eb-series-list">{allSeries.map(s => <option key={s} value={s} />)}</datalist>
          </div>
          <div className="edit-series-index">
            <label htmlFor="eb-index">Band</label>
            <input id="eb-index" className="input" value={form.seriesIndex} onChange={set('seriesIndex')}
              inputMode="decimal" autoComplete="off" placeholder="1" disabled={!form.series.trim()} />
          </div>
        </div>

        {error && <p className="notice notice-error">{error}</p>}

        <div className="sync-buttons">
          <button type="button" className="btn" onClick={onClose}>Abbrechen</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Speichere …' : 'Speichern'}</button>
        </div>
        <p className="muted small">Geändert wird nur die Anzeige in Lesezeit, die Datei selbst bleibt unverändert.
          Mit dem Geräte-Abgleich erscheinen die Änderungen auch auf deinen anderen Geräten.</p>

        {hc.signedIn && (
          <>
            <label>Hardcover</label>
            <div className="hc-row">
              <span className="small">{link ? <>Verknüpft mit <b>{link.title}</b>{link.authors ? ` (${link.authors})` : ''}</> : 'Nicht verknüpft'}</span>
              <button type="button" className="btn small" onClick={() => setLinking(true)}>{link ? 'Ändern' : 'Verknüpfen'}</button>
              {link && <button type="button" className="btn small" onClick={async () => { await unlinkBook(book.id); setHcLink({ removed: true }) }}>Lösen</button>}
            </div>
          </>
        )}

        <div className="edit-danger">
          {book.remote && book.fileStored !== false && (
            <button type="button" className="btn" onClick={() => onRemoveDownload(book)}>Download entfernen</button>
          )}
          {!book.remote && (
            <button type="button" className="btn btn-danger" onClick={() => onDelete(book)}>Vom Gerät löschen</button>
          )}
          {book.remote && <p className="muted small">Das Buch liegt in {cloudName}.</p>}
        </div>
      </form>
      {linking && (
        <HardcoverLinkSheet book={book} onClose={() => setLinking(false)}
          onDone={hit => setHcLink({ bookId: hit.id, title: hit.title, authors: hit.authors })} />
      )}
    </Sheet>
  )
}
