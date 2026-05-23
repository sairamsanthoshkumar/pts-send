import { useQuery } from '@tanstack/react-query'
import { FlaskConical, CheckCircle2, TrendingUp, Clock } from 'lucide-react'
import { getStudies } from '../api/client'
import type { Study } from '../types'
import { Link } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = { Draft:'badge-gray', InProgress:'badge-blue', Validated:'badge-green', Locked:'badge-green', Failed:'badge-red' }
  return <span className={map[status] ?? 'badge-gray'}>{status}</span>
}

export default function DashboardPage() {
  const { user } = useAuthStore()
  const { data } = useQuery({ queryKey: ['studies'], queryFn: () => getStudies().then((r) => r.data as Study[]) })
  const studies = data ?? []
  const stats = { total: studies.length, validated: studies.filter(s => ['Validated','Locked'].includes(s.status)).length, inProgress: studies.filter(s => s.status==='InProgress').length, draft: studies.filter(s => s.status==='Draft').length }
  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Welcome back, {user?.name?.split(' ')[0] ?? 'there'}</h1>
        <p className="text-slate-400 mt-1">Here's your SEND submission overview</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[{icon:<FlaskConical size={20}/>,label:'Total Studies',value:stats.total,color:'blue'},{icon:<CheckCircle2 size={20}/>,label:'Validated',value:stats.validated,color:'green'},{icon:<TrendingUp size={20}/>,label:'In Progress',value:stats.inProgress,color:'brand'},{icon:<Clock size={20}/>,label:'Drafts',value:stats.draft,color:'gray'}].map(({icon,label,value,color}) => (
          <div key={label} className="card flex items-center gap-4">
            <div className={`p-2.5 rounded-lg ${color==='blue'?'text-blue-400 bg-blue-900/30':color==='green'?'text-emerald-400 bg-emerald-900/30':color==='brand'?'text-brand-400 bg-brand-900/30':'text-slate-400 bg-slate-800'}`}>{icon}</div>
            <div><p className="text-2xl font-bold text-white">{value}</p><p className="text-xs text-slate-500">{label}</p></div>
          </div>
        ))}
      </div>
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-white">Recent Studies</h2>
          <Link to="/studies" className="text-sm text-brand-400 hover:text-brand-300">View all →</Link>
        </div>
        {studies.length === 0 ? (
          <div className="text-center py-12 text-slate-500">
            <FlaskConical size={36} className="mx-auto mb-3 opacity-40" />
            <p className="text-sm">No studies yet. <Link to="/studies" className="text-brand-400 hover:underline">Create your first study</Link></p>
          </div>
        ) : (
          <div className="space-y-3">
            {studies.slice(0,5).map(s => (
              <Link key={s.id} to={`/studies/${s.id}`} className="flex items-center justify-between p-3 rounded-lg bg-slate-800/50 hover:bg-slate-800 transition-colors">
                <div><p className="text-sm font-medium text-white">{s.name}</p><p className="text-xs text-slate-500 mt-0.5">{s.protocol_number} · SENDIG {s.sendig_version}</p></div>
                <StatusBadge status={s.status} />
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
