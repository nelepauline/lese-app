// Liest Metadaten, Cover und Kapitel aus M4B/M4A-Dateien (MP4-Container).
// Liest nur die nötigen Teile der Datei (nicht die ganze Audiodatei in den Speicher).
//
// Unterstützte Kapitelformate:
//  - QuickTime-Kapitelspur (Text-Track, verlinkt über tref/chap) – häufigster Fall
//  - Nero-Kapitel (udta/chpl)

const latin1 = bytes => String.fromCharCode(...bytes)
const utf8 = new TextDecoder('utf-8')

async function readBytes(blob, start, length) {
  return new Uint8Array(await blob.slice(start, start + length).arrayBuffer())
}

// Liefert die Kind-Boxen innerhalb eines Bereichs eines DataView
function* boxes(view, start, end) {
  let p = start
  while (p + 8 <= end) {
    let size = view.getUint32(p)
    const type = latin1(new Uint8Array(view.buffer, view.byteOffset + p + 4, 4))
    let header = 8
    if (size === 1) { size = Number(view.getBigUint64(p + 8)); header = 16 }
    else if (size === 0) size = end - p
    if (size < header || p + size > end) return
    yield { type, start: p, data: p + header, end: p + size }
    p += size
  }
}

const child = (view, box, type) => {
  if (!box) return null
  for (const b of boxes(view, box.data, box.end)) if (b.type === type) return b
  return null
}
const path = (view, box, types) => types.reduce((b, t) => child(view, b, t), box)
const allChildren = (view, box, type) =>
  box ? [...boxes(view, box.data, box.end)].filter(b => b.type === type) : []

// Sucht die "moov"-Box auf oberster Ebene und lädt nur diese.
async function loadMoov(blob) {
  let offset = 0
  while (offset + 8 <= blob.size) {
    const head = await readBytes(blob, offset, 16)
    const v = new DataView(head.buffer)
    let size = v.getUint32(0)
    const type = latin1(head.subarray(4, 8))
    if (size === 1) size = Number(v.getBigUint64(8))
    else if (size === 0) size = blob.size - offset
    if (size < 8) break
    if (type === 'moov') {
      const buf = await blob.slice(offset, offset + size).arrayBuffer()
      const view = new DataView(buf)
      const header = v.getUint32(0) === 1 ? 16 : 8
      return { view, root: { type: 'moov', start: 0, data: header, end: size } }
    }
    offset += size
  }
  return null
}

function readDuration(view, moov) {
  const mvhd = child(view, moov, 'mvhd')
  if (!mvhd) return 0
  const version = view.getUint8(mvhd.data)
  if (version === 1) {
    const timescale = view.getUint32(mvhd.data + 20)
    return Number(view.getBigUint64(mvhd.data + 24)) / timescale
  }
  const timescale = view.getUint32(mvhd.data + 12)
  return view.getUint32(mvhd.data + 16) / timescale
}

// iTunes-Metadaten (Titel, Autor, Cover) aus moov/udta/meta/ilst
function readTags(view, moov) {
  const meta = path(view, moov, ['udta', 'meta'])
  if (!meta) return {}
  // "meta" ist meist eine FullBox (4 Byte Version/Flags) – manchmal nicht.
  const metaBox = view.getUint32(meta.data) === 0 ? { ...meta, data: meta.data + 4 } : meta
  const ilst = child(view, metaBox, 'ilst')
  if (!ilst) return {}
  const tags = {}
  for (const item of boxes(view, ilst.data, ilst.end)) {
    const data = child(view, item, 'data')
    if (!data) continue
    const kind = view.getUint32(data.data) & 0xffffff
    const bytes = new Uint8Array(view.buffer, view.byteOffset + data.data + 8, data.end - data.data - 8)
    if (item.type === 'covr') {
      const mime = kind === 14 ? 'image/png' : 'image/jpeg'
      tags.cover = new Blob([bytes.slice()], { type: mime })
    } else if (kind === 1) {
      tags[item.type] = utf8.decode(bytes)
    }
  }
  return tags
}

// Nero-Kapitel: udta/chpl
function readNeroChapters(view, moov) {
  const chpl = path(view, moov, ['udta', 'chpl'])
  if (!chpl) return []
  let p = chpl.data
  const version = view.getUint8(p); p += 4
  if (version) p += 4
  const count = view.getUint8(p); p += 1
  const chapters = []
  for (let i = 0; i < count && p + 9 <= chpl.end; i++) {
    const start = Number(view.getBigUint64(p)) / 1e7; p += 8
    const len = view.getUint8(p); p += 1
    const title = utf8.decode(new Uint8Array(view.buffer, view.byteOffset + p, len)); p += len
    chapters.push({ title, start })
  }
  return chapters
}

// QuickTime-Kapitel: eigene Textspur, auf die eine Audiospur per tref/chap verweist
async function readQuickTimeChapters(blob, view, moov) {
  const traks = allChildren(view, moov, 'trak')
  const trackId = trak => {
    const tkhd = child(view, trak, 'tkhd')
    if (!tkhd) return -1
    return view.getUint32(tkhd.data + (view.getUint8(tkhd.data) === 1 ? 20 : 12))
  }
  let chapterIds = []
  for (const trak of traks) {
    const chap = path(view, trak, ['tref', 'chap'])
    if (chap) for (let p = chap.data; p + 4 <= chap.end; p += 4) chapterIds.push(view.getUint32(p))
  }
  const trak = traks.find(t => chapterIds.includes(trackId(t)))
  if (!trak) return []

  const mdhd = path(view, trak, ['mdia', 'mdhd'])
  const timescale = view.getUint32(mdhd.data + (view.getUint8(mdhd.data) === 1 ? 20 : 12))
  const stbl = path(view, trak, ['mdia', 'minf', 'stbl'])
  const stts = child(view, stbl, 'stts')
  const stsz = child(view, stbl, 'stsz')
  const stsc = child(view, stbl, 'stsc')
  const stco = child(view, stbl, 'stco') ?? child(view, stbl, 'co64')
  if (!stts || !stsz || !stsc || !stco) return []

  // Startzeiten
  const starts = []
  let t = 0
  for (let i = 0, n = view.getUint32(stts.data + 4); i < n; i++) {
    const count = view.getUint32(stts.data + 8 + i * 8)
    const delta = view.getUint32(stts.data + 12 + i * 8)
    for (let j = 0; j < count; j++) { starts.push(t / timescale); t += delta }
  }
  // Größen
  const fixedSize = view.getUint32(stsz.data + 4)
  const sampleCount = view.getUint32(stsz.data + 8)
  const sizes = Array.from({ length: sampleCount }, (_, i) =>
    fixedSize || view.getUint32(stsz.data + 12 + i * 4))
  // Chunk-Offsets
  const is64 = stco.type === 'co64'
  const chunkCount = view.getUint32(stco.data + 4)
  const chunkOffsets = Array.from({ length: chunkCount }, (_, i) => is64
    ? Number(view.getBigUint64(stco.data + 8 + i * 8))
    : view.getUint32(stco.data + 8 + i * 4))
  // Sample → Chunk
  const stscEntries = Array.from({ length: view.getUint32(stsc.data + 4) }, (_, i) => ({
    firstChunk: view.getUint32(stsc.data + 8 + i * 12),
    perChunk: view.getUint32(stsc.data + 12 + i * 12),
  }))
  const offsets = []
  let sample = 0
  for (let c = 0; c < chunkCount && sample < sampleCount; c++) {
    const entry = stscEntries.findLast(e => e.firstChunk <= c + 1)
    let pos = chunkOffsets[c]
    for (let k = 0; k < (entry?.perChunk ?? 1) && sample < sampleCount; k++) {
      offsets.push(pos); pos += sizes[sample]; sample++
    }
  }

  const texts = await Promise.all(offsets.map(async (off, i) => {
    const bytes = await readBytes(blob, off, sizes[i])
    if (bytes.length < 2) return ''
    const len = (bytes[0] << 8) | bytes[1]
    const text = bytes.subarray(2, 2 + len)
    if (text[0] === 0xfe && text[1] === 0xff) return new TextDecoder('utf-16be').decode(text.subarray(2))
    if (text[0] === 0xff && text[1] === 0xfe) return new TextDecoder('utf-16le').decode(text.subarray(2))
    return utf8.decode(text)
  }))
  return texts.map((title, i) => ({ title, start: starts[i] ?? 0 }))
}

export async function isMp4(file) {
  const head = await readBytes(file, 4, 4)
  return latin1(head) === 'ftyp'
}

/**
 * Liest alle Infos aus einer M4B-Datei.
 * @returns {{ title, author, duration, chapters: {title,start}[], cover: Blob|null }}
 */
export async function readAudiobookInfo(file) {
  const moov = await loadMoov(file)
  if (!moov) throw new Error('Keine gültige M4B-Datei (moov-Box fehlt).')
  const { view, root } = moov
  const duration = readDuration(view, root)
  const tags = readTags(view, root)

  let chapters = []
  try { chapters = await readQuickTimeChapters(file, view, root) } catch (e) { console.warn(e) }
  if (!chapters.length) chapters = readNeroChapters(view, root)
  chapters = chapters
    .filter(c => c.start < duration || !duration)
    .map((c, i) => ({ ...c, title: c.title || `Kapitel ${i + 1}` }))

  const fallbackTitle = file.name?.replace(/\.(m4b|m4a|mp4)$/i, '') || 'Unbekanntes Hörbuch'
  return {
    title: tags['©nam'] || tags['©alb'] || fallbackTitle,
    author: tags['©ART'] || tags['aART'] || tags['©wrt'] || '',
    narrator: tags['©nrt'] || '',
    duration,
    chapters,
    cover: tags.cover ?? null,
  }
}
