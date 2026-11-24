// Eigene Bilder zu einem Buch (z. B. eine Karte der Welt).
import { listImages, putImage, deleteImage, newId } from '../db/db.js'
import { noteDeleted, scheduleSync } from './sync/sync.js'

export { listImages }

// Große Fotos verkleinern (längste Seite höchstens maxSide Pixel), damit
// Speicher und Abgleich klein bleiben. Karten bleiben gut lesbar.
export async function shrinkImage(blob, maxSide = 2000, quality = 0.85) {
  try {
    const bmp = await createImageBitmap(blob)
    const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height))
    if (scale === 1 && blob.size < 900_000) return blob
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bmp.width * scale)
    canvas.height = Math.round(bmp.height * scale)
    canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height)
    return await new Promise(res => canvas.toBlob(b => res(b ?? blob), 'image/jpeg', quality))
  } catch {
    return blob
  }
}

export async function addImage(bookId, file) {
  const now = Date.now()
  const img = {
    id: newId(), bookId,
    name: file.name?.replace(/\.[^.]+$/, '') || 'Bild',
    blob: await shrinkImage(file),
    createdAt: now, updatedAt: now,
  }
  await putImage(img)
  scheduleSync(3000)
  return img
}

export async function renameImage(img, name) {
  const next = { ...img, name: name.trim() || img.name, updatedAt: Date.now() }
  await putImage(next)
  scheduleSync(3000)
  return next
}

export async function removeImage(img) {
  await deleteImage(img.id)
  noteDeleted(img.id)
}
