// Erzeugt die App-Icons (PNG) ohne zusätzliche Programme.
// Aufruf: npm run icons
// Motiv: aufgeschlagenes Buch auf warmem Hintergrund.
import { writeFileSync, mkdirSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

const BG = [139, 94, 60]      // warmes Braun
const PAGE = [246, 241, 231]  // Papier
const LINE = [200, 180, 150]  // Textzeilen

// Liefert die Farbe für einen Punkt (u, v) im Bereich 0..1
function colorAt(u, v) {
  const x = u - 0.5, y = v - 0.5
  // zwei leicht gewölbte Seiten
  const inBook = Math.abs(x) < 0.31 && Math.abs(x) > 0.012
    && y > -0.2 + Math.abs(x) * 0.12 && y < 0.22 + Math.abs(x) * 0.06 - 0.02
  if (!inBook) return BG
  // Textzeilen auf den Seiten
  const ax = Math.abs(x)
  if (ax > 0.07 && ax < 0.26) {
    const top = -0.12 + ax * 0.12
    const rel = y - top
    if (rel > 0 && rel < 0.26) {
      const line = rel / 0.052
      if (line - Math.floor(line) < 0.32) return LINE
    }
  }
  return PAGE
}

function render(size) {
  const ss = 4 // Kantenglättung
  const px = Buffer.alloc(size * size * 4)
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    let r = 0, g = 0, b = 0
    for (let sj = 0; sj < ss; sj++) for (let si = 0; si < ss; si++) {
      const c = colorAt((i + (si + 0.5) / ss) / size, (j + (sj + 0.5) / ss) / size)
      r += c[0]; g += c[1]; b += c[2]
    }
    const n = ss * ss, o = (j * size + i) * 4
    px[o] = r / n; px[o + 1] = g / n; px[o + 2] = b / n; px[o + 3] = 255
  }
  return png(size, size, px)
}

function crc32(buf) {
  let c, crc = 0xffffffff
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    crc = (crc >>> 8) ^ c
  }
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}

function png(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h)
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ])
}

mkdirSync('public/icons', { recursive: true })
writeFileSync('public/icons/icon-192.png', render(192))
writeFileSync('public/icons/icon-512.png', render(512))
writeFileSync('public/icons/apple-touch-icon.png', render(180))
writeFileSync('public/icons/favicon.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<rect width="64" height="64" rx="14" fill="rgb(${BG})"/>
<path d="M12 20 L31 22 L31 48 L12 46 Z M33 22 L52 20 L52 46 L33 48 Z" fill="rgb(${PAGE})"/>
</svg>`)
console.log('Icons erzeugt in public/icons/')
