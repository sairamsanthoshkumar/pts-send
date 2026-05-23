import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, FlaskConical, Trash2, ExternalLink, Loader2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { getStudies, createStudy, deleteStudy } from '../api/client'
import type { Study } from '../types'
import { StatusBadge } from './DashboardPage'

export default function StudiesPage() {
  const [showCreate, setShowCreate] = useState(false)
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: ['studies'], queryFn: () => getStudies().then(r => r.data as Study[]) })
  const deleteMutation = useMutation({ mutationFn: (id: string) => deleteStudy(id), onSuccess: () => qc.invalidateQueries({ queryKey: ['studies'] }) })

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div><h1 className="text-2xl font-bold text-white">Studies</h1><p className="text-slate-400 mt-1">Manage your SEND study submissions</p></div>
        <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2"><Plus size={16}/> New Study</button>
      </div>
      {isLoading ? <div className="flex items-center justify-center py-24 text-slate-500"><Loader2 size={24} className="animate-spin mr-2"/>Loading studies…</div>
      : !data?.length ? (
        <div className="card text-center py-16">
          <FlaskConical size={40} className="mx-auto mb-3 text-slate-600"/>
          <p className="text-slate-400 font-medium">No studies yet</p>
          <p className="text-slate-600 text-sm mt-1 mb-4">Create your first SEND study to get started</p>
          <button onClick={() => setShowCreate(true)} className="btn-primary inline-flex items-center gap-2"><Plus size={16}/>Create Study</button>
        </div>
      ) : (
        <div className="card overflow-hidden p-0">
          <table className="w-full">
            <thead><tr className="border-b border-slate-800">{['Study Name','Protocol','Species','SENDIG','Status',''].map(h => <th key={h} className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-5 py-3.5">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-800">
              {data.map(s => (
                <tr key={s.id} className="hover:bg-slate-800/40 transition-colors">
                  <td className="px-5 py-4"><p className="text-sm font-medium text-white">{s.name}</p></td>
                  <td className="px-5 py-4 text-sm text-slate-300 font-mono">{s.protocol_number}</td>
                  <td className="px-5 py-4 text-sm text-slate-400">{s.species ?? '—'}</td>
                  <td className="px-5 py-4 text-sm text-slate-400">{s.sendig_version}</td>
                  <td className="px-5 py-4"><StatusBadge status={s.status}/></td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2">
                      <Link to={`/studies/${s.id}`} className="p-1.5 rounded text-slate-500 hover:text-brand-400 hover:bg-slate-800 transition-colors"><ExternalLink size={15}/></Link>
                      <button onClick={() => confirm('Delete this study?') && deleteMutation.mutate(s.id)} className="p-1.5 rounded text-slate-500 hover:text-red-400 hover:bg-slate-800 transition-colors"><Trash2 size={15}/></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {showCreate && <CreateStudyModal onClose={() => setShowCreate(false)} />}
    </div>
  )
}

function CreateStudyModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({ name:'', protocol_number:'', species:'RAT', study_type:'Toxicology', sendig_version:'3.1', description:'' })
  const mutation = useMutation({ mutationFn: () => createStudy(form), onSuccess: () => { qc.invalidateQueries({ queryKey:['studies'] }); onClose() } })
  const set = (k: string, v: string) => setForm(f => ({...f, [k]:v}))
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl">
        <div className="px-6 py-5 border-b border-slate-800"><h2 className="text-lg font-semibold text-white">Create New Study</h2></div>
        <div className="px-6 py-5 space-y-4">
          {[{label:'Study Name *',key:'name',placeholder:'e.g. 90-Day Rat Toxicity Study'},{label:'Protocol Number *',key:'protocol_number',placeholder:'e.g. TOX-2024-001'}].map(({label,key,placeholder}) => (
            <div key={key}>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">{label}</label>
              <input value={form[key as keyof typeof form]} onChange={e => set(key,e.target.value)} placeholder={placeholder} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"/>
            </div>
          ))}
          <div className="grid grid-cols-3 gap-3">
            {[{label:'Species',key:'species',options:['RAT','MOUSE','DOG','MONKEY']},{label:'Study Type',key:'study_type',options:['Toxicology','PK','Safety','Efficacy']},{label:'SENDIG',key:'sendig_version',options:['3.0','3.1','4.0']}].map(({label,key,options}) => (
              <div key={key}>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">{label}</label>
                <select value={form[key as keyof typeof form]} onChange={e => set(key,e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
                  {options.map(o => <option key={o}>{o}</option>)}
                </select>
              </div>
            ))}
          </div>
        </div>
        <div className="px-6 py-4 border-t border-slate-800 flex justify-end gap-3">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={() => mutation.mutate()} disabled={!form.name || !form.protocol_number || mutation.isPending} className="btn-primary flex items-center gap-2">
            {mutation.isPending && <Loader2 size={14} className="animate-spin"/>}Create Study
          </button>
        </div>
      </div>
    </div>
  )
}
