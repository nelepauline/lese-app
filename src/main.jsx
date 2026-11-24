import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './styles/app.css'
import { initSync } from './services/sync/sync.js'
import { initCloud } from './services/cloud/cloudLibrary.js'
import { scheduleSync } from './services/sync/sync.js'
import { initHardcover, setDeviceSyncHook } from './services/hardcover/hardcover.js'

initSync()
initCloud()
setDeviceSyncHook(() => scheduleSync(3000))
initHardcover()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
