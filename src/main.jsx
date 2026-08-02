import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './dashboard.css'
import './collection.css'
import './catalog.css'
import './catalogitem.css'
import './profile.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
