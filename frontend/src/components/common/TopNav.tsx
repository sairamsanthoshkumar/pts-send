/**
 * FS7.1 — PtsSEND Top Navigation Bar
 * Matches the PtsSEND header: logo | user/zone | Studies | Study Setup | Controlled Terminology | Output Generate ▼ | System Migration | Transformation | Help | Logout
 */
import { useState, useRef, useEffect } from 'react'
import { useNavigate, NavLink } from 'react-router-dom'
import { ChevronDown, LogOut } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'

const OUTPUT_MENU = [
  { label: 'Generate SEND Output', to: '/output/generate' },
  { label: 'Output Configuration',  to: '/output/config' },
  { label: 'View Output Log',       to: '/output/log' },
]

export default function TopNav() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  const [outputOpen, setOutputOpen] = useState(false)
  const dropRef = useRef<HTMLDivElement>(null)

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setOutputOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const linkCls = (active: boolean) =>
    `px-2 py-1 text-sm font-medium transition-colors cursor-pointer whitespace-nowrap ${
      active
        ? 'text-white font-bold underline underline-offset-4'
        : 'text-blue-100 hover:text-white'
    }`

  return (
    <header style={{ background: 'linear-gradient(90deg,#1e3a6e 0%,#2563eb 100%)', borderBottom: '1px solid #1e40af' }}>
      <div className="flex items-center h-10 px-4 gap-4">

        {/* Logo */}
        <div className="flex items-center gap-1.5 flex-shrink-0 mr-2">
          <div className="w-7 h-7 rounded-full bg-white flex items-center justify-center">
            <span style={{ color: '#1e3a6e', fontWeight: 900, fontSize: '16px', fontFamily: 'Georgia,serif' }}>S</span>
          </div>
          <span style={{ color: 'white', fontWeight: 700, fontSize: '16px', fontFamily: 'Georgia,serif', letterSpacing: '0.5px' }}>avante</span>
        </div>

        {/* User / Zone — FS7 shows "Username / ConnectorName" */}
        {user && (
          <span className="text-blue-200 text-sm font-medium flex-shrink-0 border-r border-blue-400 pr-4 mr-0">
            {user.name} / {(user as any).connector_name ?? 'No Connection'}
          </span>
        )}

        {/* FS7.1.1 — Studies */}
        <NavLink to="/studies" className={({ isActive }) => linkCls(isActive)}>
          Studies
        </NavLink>

        {/* FS7.1 — Study Setup (Connection page) */}
        <NavLink to="/setup/connection" className={({ isActive }) => linkCls(isActive)}>
          Study Setup
        </NavLink>

        {/* FS7.1.2 — Controlled Terminology */}
        <NavLink to="/ct" className={({ isActive }) => linkCls(isActive)}>
          Controlled Terminology
        </NavLink>

        {/* FS7.1.3 — Output Generate dropdown */}
        <div className="relative" ref={dropRef}>
          <button
            onClick={() => setOutputOpen(v => !v)}
            className={`${linkCls(false)} flex items-center gap-1`}
          >
            Output Generate <ChevronDown size={13} className={`transition-transform ${outputOpen ? 'rotate-180' : ''}`} />
          </button>
          {outputOpen && (
            <div
              className="absolute top-full left-0 mt-1 rounded shadow-xl z-50 min-w-[200px] border overflow-hidden"
              style={{ background: 'white', borderColor: '#d1d5db' }}
            >
              {OUTPUT_MENU.map(item => (
                <button
                  key={item.to}
                  onClick={() => { navigate(item.to); setOutputOpen(false) }}
                  className="w-full text-left px-4 py-2.5 text-sm hover:bg-blue-50 transition-colors"
                  style={{ color: '#1e3a6e', borderBottom: '1px solid #f3f4f6' }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* FS7.1.10 — System Migration */}
        <NavLink to="/system-migration" className={({ isActive }) => linkCls(isActive)}>
          System Migration
        </NavLink>

        {/* Transformation */}
        <NavLink to="/transformation" className={({ isActive }) => linkCls(isActive)}>
          Transformation
        </NavLink>

        {/* FS7.1.4 — Help */}
        <NavLink to="/help" className={({ isActive }) => linkCls(isActive)}>
          Help
        </NavLink>

        {/* Spacer */}
        <div className="flex-1" />

        {/* FS7.1.5 — Logout */}
        <button
          onClick={handleLogout}
          className="flex items-center gap-1.5 text-sm text-blue-100 hover:text-white transition-colors"
        >
          <LogOut size={14} />
          Logout
        </button>
      </div>
    </header>
  )
}
