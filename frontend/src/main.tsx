import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import './index.css'
// Debug helper: quickly show that the main bundle executed in the browser.
try {
  console.log('pts-send: main.tsx loaded')
  const _dbg = document.createElement('div')
  _dbg.id = 'pts-send-debug'
  _dbg.style.position = 'fixed'
  _dbg.style.right = '8px'
  _dbg.style.bottom = '8px'
  _dbg.style.zIndex = '99999'
  _dbg.style.padding = '6px 8px'
  _dbg.style.background = 'rgba(255,255,255,0.9)'
  _dbg.style.color = '#111'
  _dbg.style.fontSize = '12px'
  _dbg.style.borderRadius = '6px'
  _dbg.style.boxShadow = '0 2px 6px rgba(0,0,0,0.25)'
  _dbg.textContent = 'DEBUG: app bundle executed'
  document.addEventListener('DOMContentLoaded', () => {
    if (document.body) document.body.appendChild(_dbg)
  })
} catch (e) { console.error('pts-send debug insert failed', e) }

// Global error overlay for runtime errors (helps diagnose blank screen)
try {
  const showError = (msg: string) => {
    console.error(msg)
    const ov = document.getElementById('pts-send-error') as HTMLDivElement | null ?? document.createElement('div')
    ov.id = 'pts-send-error'
    ov.style.position = 'fixed'
    ov.style.left = '12px'
    ov.style.top = '12px'
    ov.style.right = '12px'
    ov.style.zIndex = '100000'
    ov.style.padding = '12px'
    ov.style.background = 'rgba(255, 235, 238, 0.95)'
    ov.style.color = '#7f1d1d'
    ov.style.border = '1px solid rgba(220, 38, 38, 0.2)'
    ov.style.borderRadius = '6px'
    ov.style.fontFamily = 'monospace'
    ov.style.whiteSpace = 'pre-wrap'
    ov.style.maxHeight = '60vh'
    ov.style.overflow = 'auto'
    if (!document.getElementById('pts-send-error')) {
      document.addEventListener('DOMContentLoaded', () => {
        if (document.body) document.body.appendChild(ov)
      })
    }
    ov.textContent = msg
  }
  window.addEventListener('error', ev => showError(`Error: ${ev.message}\nat ${ev.filename}:${ev.lineno}:${ev.colno}`))
  window.addEventListener('unhandledrejection', ev => showError(`Unhandled Rejection: ${String(ev.reason)}`))
} catch (e) { console.warn('error-overlay init failed', e) }
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 30_000 } } })
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><QueryClientProvider client={queryClient}><App /></QueryClientProvider></React.StrictMode>
)
