import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { LayoutDashboard, FlaskConical, LogOut, Dna, BookOpen, GitMerge } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import clsx from 'clsx'

const NAV = [
  { to:'/', icon:LayoutDashboard, label:'Dashboard' },
  { to:'/studies', icon:FlaskConical, label:'Studies' },
  { to:'/ct', icon:BookOpen, label:'Controlled Terminology' },
]

export default function Layout() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  return (
    <div className="flex h-screen overflow-hidden bg-slate-950">
      <aside className="w-64 flex-shrink-0 bg-slate-900 border-r border-slate-800 flex flex-col">
        <div className="px-5 py-5 flex items-center gap-3 border-b border-slate-800">
          <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center"><Dna size={16} className="text-white"/></div>
          <div><p className="font-semibold text-sm text-white">PtsSEND</p><p className="text-xs text-slate-500">Pristima Savante</p></div>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV.map(({ to, icon:Icon, label }) => (
            <NavLink key={to} to={to} end={to==='/'} className={({ isActive }) => clsx('flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors', isActive ? 'bg-brand-600/20 text-brand-400' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800')}>
              <Icon size={16}/>{label}
            </NavLink>
          ))}
        </nav>
        <div className="px-3 py-4 border-t border-slate-800">
          <div className="px-3 py-2 mb-1"><p className="text-sm font-medium text-slate-200 truncate">{user?.name ?? 'User'}</p><p className="text-xs text-slate-500 truncate">{user?.email}</p></div>
          <button onClick={() => { logout(); navigate('/login') }} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"><LogOut size={16}/>Sign out</button>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto"><Outlet /></main>
    </div>
  )
}
