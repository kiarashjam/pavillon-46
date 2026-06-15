import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { MotionConfig } from 'framer-motion'
import App from './App'
import './styles/globals.css'
import './styles/desktop.css'
import './styles/tablet.css'
import './styles/mobile.css'
import './styles/dashboard.css'
import './styles/waitlist-premium.css'
import './styles/auth.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <MotionConfig reducedMotion="user">
        <App />
      </MotionConfig>
    </BrowserRouter>
  </React.StrictMode>,
)
