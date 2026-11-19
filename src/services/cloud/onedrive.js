// Verbindung zu OneDrive (Microsoft Graph).
// Anmeldung mit "Authorization Code + PKCE" – dem Standardweg für Web-Apps
// ohne eigenen Server. Die App darf nur lesen (Files.Read).
//
// Hinweis: Microsoft gibt Web-Apps eine Anmeldung, die ca. 24 Stunden hält.
// Danach muss man einmal neu auf "Anmelden" tippen. Heruntergeladene Bücher
// funktionieren unabhängig davon.
import { ONEDRIVE_CLIENT_ID, MS_LOGIN, GRAPH_API } from '../../config.js'

const SCOPES = 'Files.Read User.Read offline_access'
const AUTH_KEY = 'lese-app:onedrive-auth'     // { access, accessExp, refresh }
const PENDING_KEY = 'lese-app:onedrive-login' // { verifier, state, returnHash }

export class CloudError extends Error {
  constructor(code, message) { super(message); this.code = code }
}

const load = (key) => { try { return JSON.parse(localStorage.getItem(key)) } catch { return null } }
const save = (key, v) => { try { v == null ? localStorage.removeItem(key) : localStorage.setItem(key, JSON.stringify(v)) } catch { /* egal */ } }

export const isConfigured = () => !!ONEDRIVE_CLIENT_ID
export const hasSession = () => !!load(AUTH_KEY)?.refresh
export const redirectUri = () => location.origin + location.pathname

// ---- PKCE-Hilfen ----
const b64url = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const randomString = (n = 32) => b64url(crypto.getRandomValues(new Uint8Array(n)))
async function challengeFor(verifier) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return b64url(new Uint8Array(hash))
}

// ---- Anmelden: zur Microsoft-Seite wechseln ----
export async function signIn() {
  if (!isConfigured()) throw new CloudError('config', 'OneDrive ist noch nicht eingerichtet (Client-ID fehlt).')
  const verifier = randomString(48)
  const state = randomString(16)
  save(PENDING_KEY, { verifier, state, returnHash: location.hash || '#/' })
  const params = new URLSearchParams({
    client_id: ONEDRIVE_CLIENT_ID,
    response_type: 'code',
    redirect_uri: redirectUri(),
    response_mode: 'query',
    scope: SCOPES,
    state,
    code_challenge: await challengeFor(verifier),
    code_challenge_method: 'S256',
  })
  location.assign(`${MS_LOGIN}/authorize?${params}`)
}

async function tokenRequest(fields) {
  let res
  try {
    res = await fetch(`${MS_LOGIN}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: ONEDRIVE_CLIENT_ID, scope: SCOPES, ...fields }),
    })
  } catch {
    throw new CloudError('offline', 'Keine Internetverbindung.')
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    if (data.error === 'invalid_grant' || data.error === 'interaction_required') {
      save(AUTH_KEY, null)
      throw new CloudError('login', 'Die OneDrive-Anmeldung ist abgelaufen. Bitte neu anmelden.')
    }
    throw new CloudError('auth', `Anmeldung fehlgeschlagen: ${data.error_description?.split('\n')[0] || data.error || res.status}`)
  }
  const auth = {
    access: data.access_token,
    accessExp: Date.now() + (data.expires_in ?? 3600) * 1000,
    refresh: data.refresh_token ?? load(AUTH_KEY)?.refresh,
  }
  save(AUTH_KEY, auth)
  return auth
}

// ---- Rückkehr von Microsoft: Code gegen Zugangsschlüssel tauschen ----
// Wird einmal beim Start aufgerufen. Gibt true zurück, wenn gerade angemeldet wurde.
export async function handleRedirect() {
  const params = new URLSearchParams(location.search)
  const code = params.get('code'), state = params.get('state'), error = params.get('error')
  if (!code && !error) return false
  const pending = load(PENDING_KEY)
  save(PENDING_KEY, null)
  // Adresse aufräumen (Code nicht in der Adresszeile lassen)
  history.replaceState(null, '', location.pathname + (pending?.returnHash || '#/'))
  if (error) {
    if (error === 'access_denied') return false
    throw new CloudError('auth', params.get('error_description') || error)
  }
  if (!pending || pending.state !== state) throw new CloudError('auth', 'Anmeldung konnte nicht zugeordnet werden. Bitte noch einmal versuchen.')
  await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: redirectUri(), code_verifier: pending.verifier })
  return true
}

export function signOut() {
  save(AUTH_KEY, null)
}

async function accessToken() {
  const auth = load(AUTH_KEY)
  if (!auth?.refresh) throw new CloudError('login', 'Bitte bei OneDrive anmelden.')
  if (auth.access && auth.accessExp - 60_000 > Date.now()) return auth.access
  return (await tokenRequest({ grant_type: 'refresh_token', refresh_token: auth.refresh })).access
}

// ---- Microsoft Graph ----
async function graph(path, retry = true) {
  const token = await accessToken()
  let res
  try {
    res = await fetch(path.startsWith('http') ? path : GRAPH_API + path, { headers: { Authorization: `Bearer ${token}` } })
  } catch {
    throw new CloudError('offline', 'Keine Internetverbindung.')
  }
  if (res.status === 401 && retry) {
    const auth = load(AUTH_KEY)
    if (auth) save(AUTH_KEY, { ...auth, access: null })
    return graph(path, false)
  }
  if (res.status === 404) throw new CloudError('notfound', 'Ordner oder Datei nicht gefunden.')
  if (!res.ok) throw new CloudError('http', `OneDrive meldet einen Fehler (${res.status}).`)
  return res.json()
}

export async function me() {
  const u = await graph('/me?$select=displayName,userPrincipalName')
  return u.displayName || u.userPrincipalName || ''
}

const SELECT = '$select=id,name,size,folder,file,lastModifiedDateTime,parentReference&$top=200'

// Alle Einträge eines Ordners (folgt der Seitenaufteilung)
export async function listChildren(itemId = 'root') {
  const base = itemId === 'root' ? '/me/drive/root/children' : `/me/drive/items/${itemId}/children`
  let url = `${base}?${SELECT}`
  const items = []
  while (url) {
    const page = await graph(url)
    items.push(...page.value)
    url = page['@odata.nextLink']
  }
  return items
}

export const BOOK_EXT = /\.(epub|m4b|m4a)$/i

// Bücher im Ordner und seinen Unterordnern (bis 4 Ebenen tief)
export async function listBooksInFolder(folderId, depth = 0) {
  const items = await listChildren(folderId)
  const books = items.filter(i => i.file && BOOK_EXT.test(i.name))
  if (depth < 4) {
    for (const f of items.filter(i => i.folder)) books.push(...await listBooksInFolder(f.id, depth + 1))
  }
  return books
}

// Datei herunterladen, mit Fortschritt (0..1)
export async function downloadFile(itemId, onProgress) {
  const meta = await graph(`/me/drive/items/${itemId}?$select=id,size,@microsoft.graph.downloadUrl`)
  const url = meta['@microsoft.graph.downloadUrl']
  if (!url) throw new CloudError('http', 'Download-Adresse fehlt.')
  let res
  try { res = await fetch(url) } catch { throw new CloudError('offline', 'Keine Internetverbindung.') }
  if (!res.ok) throw new CloudError('http', `Download fehlgeschlagen (${res.status}).`)
  const total = Number(res.headers.get('content-length')) || meta.size || 0
  if (!res.body?.getReader) return res.blob()
  const reader = res.body.getReader()
  const chunks = []
  let loaded = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    loaded += value.length
    if (total) onProgress?.(Math.min(1, loaded / total))
  }
  return new Blob(chunks)
}
