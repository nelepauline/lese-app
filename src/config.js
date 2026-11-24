// Einstellungen, die einmal festgelegt werden.

// App-Schlüssel ("App key") der Lesezeit-App in der Dropbox App Console.
// Er ist nicht geheim – er sagt Dropbox nur, welche App sich anmeldet.
export const DROPBOX_APP_KEY = import.meta.env.VITE_DROPBOX_APP_KEY || ''

// Nur zum Testen mit einem Nachbau austauschbar
export const DROPBOX_AUTH = import.meta.env.VITE_DROPBOX_AUTH || 'https://www.dropbox.com/oauth2'
export const DROPBOX_API = import.meta.env.VITE_DROPBOX_API || 'https://api.dropboxapi.com'

// Hardcover (hardcover.app): Client-ID der "Developer App" (Typ: Single-page app).
// Sie ist nicht geheim – sie sagt Hardcover nur, welche App sich anmeldet.
export const HARDCOVER_CLIENT_ID = import.meta.env.VITE_HARDCOVER_CLIENT_ID || '87a92831-ff4a-47ad-8eb2-5f07d0ed99e8'
// Nur zum Testen mit einem Nachbau austauschbar
export const HARDCOVER_AUTH = import.meta.env.VITE_HARDCOVER_AUTH || 'https://hardcover.app'
export const HARDCOVER_API = import.meta.env.VITE_HARDCOVER_API || 'https://api.hardcover.app'
