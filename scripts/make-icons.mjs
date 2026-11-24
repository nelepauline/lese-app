// Erzeugt die App-Icons (PNG) aus public/icons/icon.svg.
// Aufruf: npm run icons   (nur auf dem Mac – nutzt die eingebaute Vorschau "qlmanage")
// Motiv: rote Katze schläft auf einem Bücherstapel.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, copyFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const SRC = 'public/icons/icon.svg'
const OUT = 'public/icons'
const SIZES = { 'apple-touch-icon.png': 180, 'icon-192.png': 192, 'icon-512.png': 512 }

const tmp = mkdtempSync(join(tmpdir(), 'lesezeit-icons-'))
for (const [name, size] of Object.entries(SIZES)) {
  execFileSync('qlmanage', ['-t', '-s', String(size), '-o', tmp, SRC], { stdio: 'ignore' })
  copyFileSync(join(tmp, 'icon.svg.png'), join(OUT, name))
  console.log(`${name} (${size}×${size})`)
}
rmSync(tmp, { recursive: true, force: true })
