// Einstellungen, die einmal festgelegt werden.

// App-Schlüssel ("App key") der Lesezeit-App in der Dropbox App Console.
// Er ist nicht geheim – er sagt Dropbox nur, welche App sich anmeldet.
export const DROPBOX_APP_KEY = import.meta.env.VITE_DROPBOX_APP_KEY || ''

// Nur zum Testen mit einem Nachbau austauschbar
export const DROPBOX_AUTH = import.meta.env.VITE_DROPBOX_AUTH || 'https://www.dropbox.com/oauth2'
export const DROPBOX_API = import.meta.env.VITE_DROPBOX_API || 'https://api.dropboxapi.com'
