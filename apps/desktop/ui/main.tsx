import React from 'react'
import { createRoot } from 'react-dom/client'
import '@/app/globals.css'
import { DesktopApp } from '@/desktop/desktop-app'

document.documentElement.dataset.nativeShell = 'true'

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <DesktopApp />
  </React.StrictMode>,
)
