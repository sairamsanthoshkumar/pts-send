import { useState, useRef, useEffect } from 'react'
import { useNavigate, NavLink } from 'react-router-dom'
import { ChevronDown, LogOut } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'

const OUTPUT_MENU = [
  { label:'Generate SEND Output', to:'/output/generate' },
  { label:'Output Configuration',  to:'/output/config'  },
  { label:'View Output Log',       to:'/output/log'     },
]
const SETUP_MENU = [
  { label:'Connection Setup (FS7)',  to:'/setup/connection' },
  { label:'Load Study (FS10)',       to:'/setup/load'       },
  { label:'Input Mapping (FS11)',    to:'/setup/mapping'    },
]

export default function TopNav() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  const [outputOpen, setOutputOpen] = useState(false)
  const [setupOpen,  setSetupOpen]  = useState(false)
  const outputRef = useRef<HTMLDivElement>(null)
  const setupRef  = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (outputRef.current && !outputRef.current.contains(e.target as Node)) setOutputOpen(false)
      if (setupRef.current  && !setupRef.current.contains(e.target as Node))  setSetupOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const linkCls = (active: boolean) =>
    `px-2 py-1 text-sm font-medium transition-colors cursor-pointer whitespace-nowrap ${
      active ? 'text-white font-bold underline underline-offset-4' : 'text-blue-100 hover:text-white'
    }`

  const DropMenu = ({ items, open }: { items:{label:string;to:string}[]; open:boolean }) =>
    open ? (
      <div className="absolute top-full left-0 mt-1 rounded shadow-xl z-50 min-w-[210px] border overflow-hidden"
        style={{ background:'white', borderColor:'#d1d5db' }}>
        {items.map(item => (
          <button key={item.to}
            onClick={() => { navigate(item.to); setOutputOpen(false); setSetupOpen(false) }}
            className="w-full text-left px-4 py-2.5 text-sm hover:bg-blue-50 transition-colors"
            style={{ color:'#1e3a6e', borderBottom:'1px solid #f3f4f6' }}>
            {item.label}
          </button>
        ))}
      </div>
    ) : null

  return (
    <header style={{ background:'linear-gradient(90deg,#1e3a6e 0%,#2563eb 100%)', borderBottom:'1px solid #1e40af' }}>
      <div className="flex items-center h-10 px-4 gap-4">

        {/* Logo */}
        <div className="flex items-center gap-1.5 flex-shrink-0 mr-2">
          <div className="w-7 h-7 rounded-full bg-white flex items-center justify-center">
            <span style={{ color:'#1e3a6e', fontWeight:900, fontSize:'16px', fontFamily:'Georgia,serif' }}>P</span>
          </div>
          <span style={{ color:'white', fontWeight:700, fontSize:'16px', fontFamily:'Georgia,serif', letterSpacing:'0.5px' }}>tsSEND</span>
        </div>

        {user && (
          <span className="text-blue-200 text-sm font-medium flex-shrink-0 border-r border-blue-400 pr-4">
            {user.name}
          </span>
        )}

        <NavLink to="/studies"         className={({ isActive }) => linkCls(isActive)}>Studies</NavLink>

        {/* Study Setup ▼ */}
        <div className="relative" ref={setupRef}>
          <button onClick={() => setSetupOpen(v=>!v)} className={`${linkCls(false)} flex items-center gap-1`}>
            Study Setup <ChevronDown size={13} className={`transition-transform ${setupOpen?'rotate-180':''}`}/>
          </button>
          <DropMenu items={SETUP_MENU} open={setupOpen}/>
        </div>

        <NavLink to="/ct"              className={({ isActive }) => linkCls(isActive)}>Controlled Terminology</NavLink>

        {/* Output Generate ▼ */}
        <div className="relative" ref={outputRef}>
          <button onClick={() => setOutputOpen(v=>!v)} className={`${linkCls(false)} flex items-center gap-1`}>
            Output Generate <ChevronDown size={13} className={`transition-transform ${outputOpen?'rotate-180':''}`}/>
          </button>
          <DropMenu items={OUTPUT_MENU} open={outputOpen}/>
        </div>

        <NavLink to="/system-migration" className={({ isActive }) => linkCls(isActive)}>System Migration</NavLink>
        <NavLink to="/transformation"   className={({ isActive }) => linkCls(isActive)}>Transformation</NavLink>
        <NavLink to="/help"             className={({ isActive }) => linkCls(isActive)}>Help</NavLink>

        <div className="flex-1"/>

        <button onClick={() => { logout(); navigate('/login') }}
          className="flex items-center gap-1.5 text-sm text-blue-100 hover:text-white transition-colors">
          <LogOut size={14}/> Logout
        </button>
      </div>
    </header>
  )
}
