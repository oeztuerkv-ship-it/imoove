import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './admin-shell.css'
import './admin-ui.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
