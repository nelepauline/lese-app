import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './styles/app.css'
import { initSync } from './services/sync/sync.js'
import { initCloud } from './services/cloud/cloudLibrary.js'

initSync()
initCloud()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
