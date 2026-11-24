// Verbindung zu Dropbox.
// Anmeldung mit "Authorization Code + PKCE" – dem Standardweg für Web-Apps
// ohne eigenen Server. Dropbox gibt dabei einen dauerhaften Schlüssel
// (offline access), man bleibt also angemeldet. Die App darf nur lesen.
import { DROPBOX_APP_KEY, DROPBOX_AUTH, DROPBOX_API } from '../../config.js'

const AUTH_KEY = 'lese-app:dropbox-auth'     // { access, accessExp, refresh }
const PENDING_KEY = 'lese-app:dropbox-login' // { verifier, state, returnHash }

export const PROVIDER = 'dropbox'
export const PROVIDER_NAME = 'Dropbox'
export const ROOT = { id: '', name: 'Dropbox' }

export class CloudError extends Error {
  constructor(code, message) { super(message); this.code = code }
}

const load = key => { try { return JSON.parse(localStorage.getItem(key)) } catch { return null } }
const save = (key, v) => { try { v == null ? localStorage.removeItem(key) : localStorage.setItem(key, JSON.stringify(v)) } catch { /* egal */ } }

export const isConfigured = () => !!DROPBOX_APP_KEY
export const hasSession = () => !!load(AUTH_KEY)?.refresh
export const redirectUri = () => location.origin + location.pathname

// ---- PKCE-Hilfen ----
const b64url = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const randomString = (n = 32) => b64url(crypto.getRandomValues(new Uint8Array(n)))
async function challengeFor(verifier) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return b64url(new Uint8Array(hash))
}

// ---- Anmelden: zur Dropbox-Seite wechseln ----
export async function signIn() {
  if (!isConfigured()) throw new CloudError('config', 'Dropbox ist noch nicht eingerichtet (App-Schlüssel fehlt).')
  const verifier = randomString(48)
  const state = randomString(16)
  save(PENDING_KEY, { verifier, state, returnHash: location.hash || '#/' })
  const params = new URLSearchParams({
    client_id: DROPBOX_APP_KEY,
    response_type: 'code',
    redirect_uri: redirectUri(),
    token_access_type: 'offline',
    state,
    code_challenge: await challengeFor(verifier),
    code_challenge_method: 'S256',
  })
  location.assign(`${DROPBOX_AUTH}/authorize?${params}`)
}

async function tokenRequest(fields) {
  let res
  try {
    res = await fetch(`${DROPBOX_API}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: DROPBOX_APP_KEY, ...fields }),
    })
  } catch {
    throw new CloudError('offline', 'Keine Internetverbindung.')
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    if (data.error === 'invalid_grant') {
      save(AUTH_KEY, null)
      throw new CloudError('login', 'Die Dropbox-Anmeldung ist nicht mehr gültig. Bitte neu anmelden.')
    }
    throw new CloudError('auth', `Anmeldung fehlgeschlagen: ${data.error_description || data.error || res.status}`)
  }
  const auth = {
    access: data.access_token,
    accessExp: Date.now() + (data.expires_in ?? 14400) * 1000,
    refresh: data.refresh_token ?? load(AUTH_KEY)?.refresh,
  }
  save(AUTH_KEY, auth)
  return auth
}

// ---- Rückkehr von Dropbox: Code gegen Zugangsschlüssel tauschen ----
// Wird einmal beim Start aufgerufen. Gibt true zurück, wenn gerade angemeldet wurde.
export async function handleRedirect() {
  const params = new URLSearchParams(location.search)
  const code = params.get('code'), state = params.get('state'), error = params.get('error')
  if (!code && !error) return false
  if (state?.startsWith('hc_')) return false // Rückkehr von Hardcover, nicht von Dropbox
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
  const auth = load(AUTH_KEY)
  save(AUTH_KEY, null)
  // Schlüssel auch bei Dropbox ungültig machen (ohne auf Antwort zu warten)
  if (auth?.access) fetch(`${DROPBOX_API}/2/auth/token/revoke`, { method: 'POST', headers: { Authorization: `Bearer ${auth.access}` } }).catch(() => {})
}

async function accessToken() {
  const auth = load(AUTH_KEY)
  if (!auth?.refresh) throw new CloudError('login', 'Bitte bei Dropbox anmelden.')
  if (auth.access && auth.accessExp - 60_000 > Date.now()) return auth.access
  return (await tokenRequest({ grant_type: 'refresh_token', refresh_token: auth.refresh })).access
}

// ---- Dropbox-API (alle Aufrufe sind POST mit JSON) ----
async function api(path, args, retry = true) {
  const token = await accessToken()
  let res
  try {
    res = await fetch(`${DROPBOX_API}/2${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, ...(args !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: args !== undefined ? JSON.stringify(args) : undefined,
    })
  } catch {
    throw new CloudError('offline', 'Keine Internetverbindung.')
  }
  if (res.status === 401 && retry) {
    const auth = load(AUTH_KEY)
    if (auth) save(AUTH_KEY, { ...auth, access: null })
    return api(path, args, false)
  }
  if (res.status === 409) {
    const data = await res.json().catch(() => ({}))
    if (/not_found/.test(data.error_summary || '')) throw new CloudError('notfound', 'Ordner oder Datei nicht gefunden.')
    throw new CloudError('http', `Dropbox meldet: ${data.error_summary || 'Fehler'}`)
  }
  if (res.status === 400) {
    const text = await res.text().catch(() => '')
    if (/scope/i.test(text)) throw new CloudError('auth', 'Der Dropbox-App fehlen Berechtigungen (files.metadata.read / files.content.read).')
    throw new CloudError('http', `Dropbox meldet einen Fehler (400).`)
  }
  if (!res.ok) throw new CloudError('http', `Dropbox meldet einen Fehler (${res.status}).`)
  return res.json()
}

export async function me() {
  const acc = await api('/users/get_current_account')
  return acc.name?.display_name || acc.email || ''
}

// Einheitliches Format für die App: { id, name, folder: bool, size, modified }
const toItem = e => ({
  id: e.id,
  name: e.name,
  folder: e['.tag'] === 'folder',
  size: e.size ?? 0,
  modified: e.server_modified,
})

async function listAll(path, recursive) {
  let page = await api('/files/list_folder', { path, recursive, include_non_downloadable_files: false, limit: 2000 })
  const entries = [...page.entries]
  while (page.has_more) {
    page = await api('/files/list_folder/continue', { cursor: page.cursor })
    entries.push(...page.entries)
  }
  return entries.filter(e => e['.tag'] !== 'deleted').map(toItem)
}

// Inhalt eines Ordners ('' = oberste Ebene)
export const listChildren = (folderId = '') => listAll(folderId, false)

export const BOOK_EXT = /\.(epub|m4b|m4a)$/i

// Alle Bücher im Ordner und seinen Unterordnern
export async function listBooksInFolder(folderId) {
  return (await listAll(folderId, true)).filter(i => !i.folder && BOOK_EXT.test(i.name))
}

// Datei herunterladen, mit Fortschritt (0..1)
export async function downloadFile(itemId, onProgress) {
  const { link, metadata } = await api('/files/get_temporary_link', { path: itemId })
  let res
  try { res = await fetch(link) } catch { throw new CloudError('offline', 'Keine Internetverbindung.') }
  if (!res.ok) throw new CloudError('http', `Download fehlgeschlagen (${res.status}).`)
  const total = Number(res.headers.get('content-length')) || metadata?.size || 0
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
