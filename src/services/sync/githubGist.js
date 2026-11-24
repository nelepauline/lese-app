// Speicherort für den Abgleich: ein privater ("secret") Gist im GitHub-Konto.
// Darin liegt eine einzige JSON-Datei mit Positionen und Lesezeichen –
// keine Bücher.
const API = import.meta.env.VITE_GITHUB_API || 'https://api.github.com'
export const FILE = 'lesezeit-sync.json'
const DESCRIPTION = 'Lesezeit – Synchronisation (bitte nicht löschen)'

export class SyncError extends Error {
  constructor(code, message) { super(message); this.code = code }
}

async function gh(token, path, { method = 'GET', body } = {}) {
  let res
  try {
    res = await fetch(API + path, {
      method,
      cache: 'no-store',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new SyncError('offline', 'Gerade keine Verbindung – wird später abgeglichen.')
  }
  if (res.status === 401) throw new SyncError('auth', 'Der Schlüssel ist ungültig oder abgelaufen. Bitte neu verbinden.')
  if (res.status === 404) throw new SyncError('notfound', 'Nicht gefunden.')
  if (res.status === 403) throw new SyncError('forbidden', 'GitHub verweigert den Zugriff. Hat der Schlüssel das Häkchen bei „gist“?')
  if (!res.ok) throw new SyncError('http', `GitHub meldet einen Fehler (${res.status}). Später noch einmal versuchen.`)
  return res.json()
}

export async function whoami(token) {
  const user = await gh(token, '/user')
  return user.login
}

// Vorhandenen Lesezeit-Gist suchen oder neu anlegen → ID
export async function findOrCreate(token) {
  for (let page = 1; page <= 10; page++) {
    const list = await gh(token, `/gists?per_page=100&page=${page}`)
    const found = list.find(g => g.files?.[FILE])
    if (found) return found.id
    if (list.length < 100) break
  }
  try {
    const created = await gh(token, '/gists', {
      method: 'POST',
      body: { description: DESCRIPTION, public: false, files: { [FILE]: { content: JSON.stringify(emptyData()) } } },
    })
    return created.id
  } catch (err) {
    if (err.code === 'notfound') throw new SyncError('forbidden', 'Der Schlüssel darf keine Gists anlegen. Bitte beim Erstellen das Häkchen bei „gist“ setzen.')
    throw err
  }
}

export function emptyData() {
  return { app: 'lesezeit', version: 1, books: {} }
}

export async function read(token, id) {
  if (!id) throw new SyncError('notfound', 'Kein Gist.')
  const g = await gh(token, `/gists/${id}`)
  const f = g.files?.[FILE]
  if (!f) throw new SyncError('notfound', 'Datei fehlt.')
  let text = f.content
  if (f.truncated && f.raw_url) text = await (await fetch(f.raw_url, { cache: 'no-store' })).text()
  try {
    const data = JSON.parse(text)
    return data && typeof data === 'object' ? data : emptyData()
  } catch {
    return emptyData()
  }
}

export async function write(token, id, data) {
  await gh(token, `/gists/${id}`, { method: 'PATCH', body: { files: { [FILE]: { content: JSON.stringify(data) } } } })
}

// ---- Zweiter Gist für eigene Cover (Bilder als Text) ----
// Getrennt, damit der normale Abgleich klein und schnell bleibt.
const COVERS_DESCRIPTION = 'Lesezeit – eigene Cover (bitte nicht löschen)'

export async function createCoversGist(token) {
  const created = await gh(token, '/gists', {
    method: 'POST',
    body: { description: COVERS_DESCRIPTION, public: false, files: { 'README.txt': { content: 'Cover-Bilder für Lesezeit.' } } },
  })
  return created.id
}

// Alle Dateien eines Gists → { name: inhalt }
export async function readFiles(token, id) {
  const g = await gh(token, `/gists/${id}`)
  const out = {}
  for (const [name, f] of Object.entries(g.files ?? {})) {
    let text = f.content
    if (f.truncated && f.raw_url) text = await (await fetch(f.raw_url, { cache: 'no-store' })).text()
    out[name] = text
  }
  return out
}

export async function writeFiles(token, id, files) {
  const body = { files: Object.fromEntries(Object.entries(files).map(([n, content]) => [n, { content }])) }
  await gh(token, `/gists/${id}`, { method: 'PATCH', body })
}
