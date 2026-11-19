// Einstellungen, die einmal festgelegt werden.

// Client-ID der App-Registrierung bei Microsoft (für den OneDrive-Ordner).
// Sie ist nicht geheim – sie sagt Microsoft nur, welche App sich anmeldet.
export const ONEDRIVE_CLIENT_ID = import.meta.env.VITE_ONEDRIVE_CLIENT_ID || ''

// Nur zum Testen mit einem Nachbau austauschbar
export const MS_LOGIN = import.meta.env.VITE_MS_LOGIN || 'https://login.microsoftonline.com/common/oauth2/v2.0'
export const GRAPH_API = import.meta.env.VITE_GRAPH_API || 'https://graph.microsoft.com/v1.0'
