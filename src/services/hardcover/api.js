// Verbindung zu Hardcover (hardcover.app): Anmeldung und GraphQL-Anfragen.
// Anmeldung mit OAuth "Authorization Code + PKCE" für Web-Apps – so empfiehlt
// es Hardcover. Kein Schlüssel muss kopiert werden; der Zugang lässt sich in
// den Hardcover-Einstellungen jederzeit widerrufen.
import { HARDCOVER_CLIENT_ID, HARDCOVER_AUTH, HARDCOVER_API } from '../../config.js'

const AUTH_KEY = 'lese-app:hc-auth'      // { access, accessExp, refresh }
const PENDING_KEY = 'lese-app:hc-login'  // { verifier, state, returnHash }

export const SCOPES = 'read:me:content read:catalog read:library write:library'
const ISSUER = HARDCOVER_API

export class HardcoverError extends Error {
  constructor(code, message) { super(message); this.code = code }
}

const load = key => { try { return JSON.parse(localStorage.getItem(key)) } catch { return null } }
const save = (key, v) => { try { v == null ? localStorage.removeItem(key) : localStorage.setItem(key, JSON.stringify(v)) } catch { /* egal */ } }

export const isConfigured = () => !!HARDCOVER_CLIENT_ID
export const hasSession = () => !!load(AUTH_KEY)?.refresh || !!load(AUTH_KEY)?.access
const redirectUri = () => location.origin + location.pathname

// ---- PKCE ----
const b64url = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const randomString = (n = 32) => b64url(crypto.getRandomValues(new Uint8Array(n)))
async function challengeFor(verifier) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return b64url(new Uint8Array(hash))
}

// ---- Anmelden: zur Hardcover-Seite wechseln ----
export async function signIn() {
  if (!isConfigured()) throw new HardcoverError('config', 'Hardcover ist noch nicht eingerichtet (Client-ID fehlt).')
  const verifier = randomString(32)
  const state = 'hc_' + randomString(18)   // Präfix: unterscheidet die Rückkehr von anderen Anmeldungen
  save(PENDING_KEY, { verifier, state, returnHash: location.hash || '#/' })
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: HARDCOVER_CLIENT_ID,
    redirect_uri: redirectUri(),
    state,
    code_challenge: await challengeFor(verifier),
    code_challenge_method: 'S256',
    scope: SCOPES,
  })
  location.assign(`${HARDCOVER_AUTH}/oauth2/authorize?${params}`)
}

async function tokenRequest(fields) {
  let res
  try {
    res = await fetch(`${HARDCOVER_API}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: HARDCOVER_CLIENT_ID, ...fields }),
    })
  } catch {
    throw new HardcoverError('offline', 'Keine Verbindung zu Hardcover.')
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    if (data.error === 'invalid_grant') {
      save(AUTH_KEY, null)
      throw new HardcoverError('login', 'Die Hardcover-Anmeldung ist abgelaufen. Bitte neu anmelden.')
    }
    throw new HardcoverError('auth', `Hardcover-Anmeldung fehlgeschlagen: ${data.error_description || data.error || res.status}`)
  }
  const auth = {
    access: data.access_token,
    accessExp: Date.now() + (data.expires_in ?? 3600) * 1000,
    refresh: data.refresh_token ?? load(AUTH_KEY)?.refresh,
  }
  save(AUTH_KEY, auth)
  return auth
}

// ---- Rückkehr von Hardcover (einmal beim Start). true = gerade angemeldet ----
export async function handleRedirect() {
  const params = new URLSearchParams(location.search)
  const state = params.get('state')
  if (!state?.startsWith('hc_')) return false   // gehört nicht zu uns
  const pending = load(PENDING_KEY)
  save(PENDING_KEY, null)
  history.replaceState(null, '', location.pathname + (pending?.returnHash || '#/'))
  const error = params.get('error')
  if (error) {
    if (error === 'access_denied') return false
    throw new HardcoverError('auth', params.get('error_description') || error)
  }
  if (!pending || pending.state !== state) throw new HardcoverError('auth', 'Anmeldung konnte nicht zugeordnet werden. Bitte noch einmal versuchen.')
  const iss = params.get('iss')
  if (iss && iss.replace(/\/$/, '') !== ISSUER.replace(/\/$/, '')) throw new HardcoverError('auth', 'Antwort kam nicht von Hardcover.')
  await tokenRequest({ grant_type: 'authorization_code', code: params.get('code'), redirect_uri: redirectUri(), code_verifier: pending.verifier })
  return true
}

export function signOut() {
  const auth = load(AUTH_KEY)
  save(AUTH_KEY, null)
  const token = auth?.refresh || auth?.access
  if (token) fetch(`${HARDCOVER_API}/oauth2/revoke`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ token, client_id: HARDCOVER_CLIENT_ID }),
  }).catch(() => {})
}

async function accessToken() {
  const auth = load(AUTH_KEY)
  if (!auth) throw new HardcoverError('login', 'Bitte bei Hardcover anmelden.')
  if (auth.access && auth.accessExp - 60_000 > Date.now()) return auth.access
  if (!auth.refresh) { save(AUTH_KEY, null); throw new HardcoverError('login', 'Die Hardcover-Anmeldung ist abgelaufen. Bitte neu anmelden.') }
  return (await tokenRequest({ grant_type: 'refresh_token', refresh_token: auth.refresh })).access
}

// ---- GraphQL ----
export async function gql(query, variables = {}, retry = true) {
  const token = await accessToken()
  let res
  try {
    res = await fetch(`${HARDCOVER_API}/v1/graphql`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ query, variables }),
    })
  } catch {
    throw new HardcoverError('offline', 'Keine Verbindung zu Hardcover.')
  }
  if (res.status === 401 && retry) {
    const auth = load(AUTH_KEY)
    if (auth) save(AUTH_KEY, { ...auth, access: null })
    return gql(query, variables, false)
  }
  const body = await res.json().catch(() => ({}))
  if (res.status === 401) throw new HardcoverError('login', 'Die Hardcover-Anmeldung ist abgelaufen. Bitte neu anmelden.')
  if (res.status === 429) throw new HardcoverError('rate', 'Hardcover: zu viele Anfragen – später noch einmal.')
  if (res.status === 403) throw new HardcoverError('scope', `Hardcover verweigert den Zugriff${body.scope ? ` (fehlende Berechtigung: ${body.scope})` : ''}.`)
  if (!res.ok) throw new HardcoverError('http', `Hardcover meldet einen Fehler (${res.status}).`)
  if (body.errors?.length) throw new HardcoverError('graphql', `Hardcover: ${body.errors[0].message ?? body.errors[0]}`)
  return body.data
}

// Werte direkt in die Anfrage schreiben (sicher maskiert) – so müssen wir die
// nicht dokumentierten Typnamen der Eingabe-Objekte nicht kennen.
export function lit(v) {
  if (v === null || v === undefined) return 'null'
  if (typeof v === 'number') { if (!Number.isFinite(v)) throw new Error('Ungültige Zahl'); return String(v) }
  if (typeof v === 'boolean') return String(v)
  if (typeof v === 'string') return JSON.stringify(v)
  if (Array.isArray(v)) return `[${v.map(lit).join(', ')}]`
  return `{${Object.entries(v).map(([k, x]) => { if (!/^[A-Za-z_]\w*$/.test(k)) throw new Error('Ungültiger Feldname'); return `${k}: ${lit(x)}` }).join(', ')}}`
}

// ---- Häufige Abfragen ----
export async function me() {
  const data = await gql('query Me { me { id username } }')
  const u = Array.isArray(data.me) ? data.me[0] : data.me
  return u ? { id: u.id, username: u.username } : null
}

// Bücher suchen (Titel, Autor/in oder ISBN)
export async function searchBooks(q, perPage = 8) {
  const data = await gql('query Search($q: String!, $n: Int!) { search(query: $q, query_type: "Book", per_page: $n, page: 1) { results } }', { q, n: perPage })
  const hits = data.search?.results?.hits ?? []
  return hits.map(h => h.document).filter(Boolean).map(d => ({
    id: Number(d.id),
    title: d.title,
    authors: (d.author_names ?? []).join(', '),
    year: d.release_year ?? null,
    image: d.image?.url ?? null,
    pages: d.pages ?? null,
    audioSeconds: d.audio_seconds ?? null,
    series: d.featured_series?.series?.name ? `${d.featured_series.series.name}${d.featured_series_position ? ` #${d.featured_series_position}` : ''}` : '',
  }))
}

// Eigener Bibliothekseintrag + laufende Lese-Runde zu einem Buch
export async function readingState(userId, bookId) {
  const data = await gql(`query State($u: Int!, $b: Int!) {
    user_books(where: {user_id: {_eq: $u}, book_id: {_eq: $b}}) {
      id status_id edition_id
      edition { id pages audio_seconds }
      book {
        pages audio_seconds
        default_ebook_edition { id pages }
        default_physical_edition { id pages }
        default_audio_edition { id audio_seconds }
      }
      user_book_reads(where: {finished_at: {_is_null: true}}, order_by: {id: desc}, limit: 1) {
        id progress_pages progress_seconds edition { id pages audio_seconds }
      }
    }
  }`, { u: userId, b: bookId })
  const ub = data.user_books?.[0]
  if (!ub) return null
  const read = ub.user_book_reads?.[0] ?? null
  const ed = e => e && { id: e.id, pages: e.pages ?? null, seconds: e.audio_seconds ?? null }
  return {
    userBookId: ub.id, statusId: ub.status_id,
    userEdition: ed(ub.edition),
    defaults: {
      ebook: ed(ub.book?.default_ebook_edition), physical: ed(ub.book?.default_physical_edition),
      audio: ed(ub.book?.default_audio_edition),
      pages: ub.book?.pages ?? null, seconds: ub.book?.audio_seconds ?? null,
    },
    read: read && { id: read.id, pages: read.progress_pages, seconds: read.progress_seconds, edition: ed(read.edition) },
  }
}

export async function updateRead(readId, object) {
  const data = await gql(`mutation Progress {
    update_user_book_read(id: ${lit(readId)}, object: ${lit(object)}) { error user_book_read { id progress_pages progress_seconds } }
  }`)
  const r = data.update_user_book_read
  if (r?.error) throw new HardcoverError('graphql', `Hardcover: ${r.error}`)
  return r?.user_book_read
}

// Lesetagebuch: Zitat oder Notiz (privacy 2 = nur Follower)
export async function insertJournal({ bookId, event, entry, privacy = 2 }) {
  const o = { book_id: bookId, event, entry, privacy_setting_id: privacy, tags: [] }
  const data = await gql(`mutation Journal {
    insert_reading_journal(object: ${lit(o)}) { errors reading_journal { id } }
  }`)
  const r = data.insert_reading_journal
  if (r?.errors?.length) throw new HardcoverError('graphql', `Hardcover: ${r.errors[0]}`)
  return r?.reading_journal?.id
}

export async function updateJournal(id, entry, privacy = 2) {
  const data = await gql(`mutation JournalEdit {
    update_reading_journal(id: ${lit(id)}, object: ${lit({ entry, privacy_setting_id: privacy })}) { errors reading_journal { id } }
  }`)
  const r = data.update_reading_journal
  if (r?.errors?.length) throw new HardcoverError('graphql', `Hardcover: ${r.errors[0]}`)
}

export async function deleteJournal(id) {
  await gql(`mutation JournalDelete { delete_reading_journal(id: ${lit(id)}) { id } }`)
}
