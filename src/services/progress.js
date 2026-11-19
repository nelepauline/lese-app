// Zentrale Stelle für Lese- und Hörfortschritt.
// Reader und Player rufen nur saveProgress() auf. So können später weitere
// "Sync-Ziele" angeschlossen werden, ohne Reader/Player zu ändern:
//   - Etappe 3: Fortschritts-Sync zwischen Geräten (z. B. Supabase)
//   - Etappe 4: Hardcover (Lesestatus & Fortschritt)
import { putProgress, getProgress } from '../db/db.js'

/*
  Fortschritt-Objekt:
  {
    fraction: 0..1          Anteil gelesen/gehört
    cfi?: string            Position im EPUB (nur E-Books)
    position?: number       Sekunden (nur Hörbücher)
    chapter?: string        aktueller Kapitelname
    updatedAt: number       Zeitstempel (ms) – wichtig für späteren Abgleich
  }
*/

const syncTargets = []

// Später z. B.: registerSyncTarget(supabaseSync)
// Ein Sync-Ziel ist ein Objekt mit push(bookId, progress) → Promise.
export function registerSyncTarget(target) {
  syncTargets.push(target)
}

export async function saveProgress(bookId, data) {
  const progress = { ...data, updatedAt: Date.now() }
  await putProgress(bookId, progress)
  for (const target of syncTargets) {
    target.push(bookId, progress).catch(err => console.warn('Sync fehlgeschlagen', err))
  }
  return progress
}

export { getProgress }
