import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, FlaskConical, Trash2, ExternalLink, Loader2, Search } from 'lucide-react'
import { Link } from 'react-router-dom'
import { getStudies, createStudy, deleteStudy } from '../api/client'
import type { Study } from '../types'
import { StatusBadge } from './DashboardPage'

const STATUS_OPTIONS = ['Setup','DataLoaded','Validated','Approved','Locked']
const CONNECTION_TYPES = ['CSV','SEND_DATASET','PRISTIMA_API','OPENVMS']

export default function StudiesPage() {
  const [showCreate, setShowCreate] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['studies', search, statusFilter],
    queryFn: () => getStudies({ ...(search ? { name: search } : {}), ...(statusFilter ? { savante_status: statusFilter } : {}) }).then(r => r.data as Study[]),
  })

  const deleteMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => {
      const needsReason = ['DataLoaded','Validated','Approved','Locked'].includes(status)
      const reason = needsReason ? prompt('FS8.2.5: Audit reason required to delete this study') ?? '' : undefined
      if (needsReason && !reason) throw new Error('Reason required')
      return deleteStudy(id, reason)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['studies'] }),
  })

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div><h1 className="text-2xl font-bold text-white">Studies</h1><p className="text-slate-400 mt-1">FS8 — Manage SEND study submissions</p></div>
        <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2"><Plus size={16}/> New Study</button>
      </div>

      {/* FS8.1 Search filters */}
      <div className="flex gap-3 mb-6">
        <div className="relative flex-1 max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"/>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by Study Name or Protocol (wildcard)"
            className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand-500"/>
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand-500">
          <option value="">All Statuses</option>
          {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {isLoading ? <div className="flex items-center justify-center py-24 text-slate-500"><Loader2 size={24} className="animate-spin mr-2"/>Loading studies…</div>
      : !data?.length ? (
        <div className="card text-center py-16">
          <FlaskConical size={40} className="mx-auto mb-3 text-slate-600"/>
          <p className="text-slate-400 font-medium">No studies found</p>
          <p className="text-slate-600 text-sm mt-1 mb-4">Create your first SEND study to get started</p>
          <button onClick={() => setShowCreate(true)} className="btn-primary inline-flex items-center gap-2"><Plus size={16}/>Create Study</button>
        </div>
      ) : (
        <div className="card overflow-hidden p-0">
          <table className="w-full">
            <thead><tr className="border-b border-slate-800">{['Savante Study Name','Protocol Number','Import Study Name','Connection Type','SENDIG','Status','Approved',''].map(h => <th key={h} className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-5 py-3.5">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-800">
              {data.map(s => (
                <tr key={s.id} className="hover:bg-slate-800/40 transition-colors">
                  <td className="px-5 py-4"><p className="text-sm font-medium text-white">{s.savante_study_name}</p></td>
                  <td className="px-5 py-4 text-sm text-slate-300 font-mono">{s.protocol_number}</td>
                  <td className="px-5 py-4 text-sm text-slate-400">{s.import_study_name ?? '—'}</td>
                  <td className="px-5 py-4 text-sm text-slate-400">{s.connection_type}</td>
                  <td className="px-5 py-4 text-sm text-slate-400">{s.sendig_version}</td>
                  <td className="px-5 py-4"><StatusBadge status={s.savante_status}/></td>
                  <td className="px-5 py-4">{s.dataset_approved ? <span className="badge-green">Yes</span> : <span className="badge-gray">No</span>}</td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2">
                      <Link to={`/studies/${s.id}`} className="p-1.5 rounded text-slate-500 hover:text-brand-400 hover:bg-slate-800 transition-colors"><ExternalLink size={15}/></Link>
                      <button onClick={() => deleteMutation.mutate({ id: s.id, status: s.savante_status })} className="p-1.5 rounded text-slate-500 hover:text-red-400 hover:bg-slate-800 transition-colors"><Trash2 size={15}/></button>
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
  const [form, setForm] = useState({
    savante_study_name:'', protocol_number:'', import_study_name:'', species:'RAT',
    study_type:'Toxicology', sendig_version:'3.1', connection_type:'CSV', description:'',
    unique_subject_id_flag: false,
  })
  const mutation = useMutation({ mutationFn: () => createStudy(form), onSuccess: () => { qc.invalidateQueries({ queryKey:['studies'] }); onClose() } })
  const set = (k: string, v: string|boolean) => setForm(f => ({...f, [k]:v}))

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-5 border-b border-slate-800"><h2 className="text-lg font-semibold text-white">Create New Study (FS14)</h2></div>
        <div className="px-6 py-5 space-y-4">
          {[{label:'Savante Study Name *',key:'savante_study_name',placeholder:'e.g. 90-Day Rat Toxicity Study'},
            {label:'Protocol Number *',key:'protocol_number',placeholder:'e.g. TOX-2024-001'},
            {label:'Import Study Name',key:'import_study_name',placeholder:'Source system study name (if merging multiple)'}].map(({label,key,placeholder}) => (
            <div key={key}>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">{label}</label>
              <input value={form[key as keyof typeof form] as string} onChange={e => set(key,e.target.value)} placeholder={placeholder} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"/>
            </div>
          ))}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Connection Type (FS7)</label>
              <select value={form.connection_type} onChange={e => set('connection_type',e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
                {CONNECTION_TYPES.map(o => <option key={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">SENDIG Version</label>
              <select value={form.sendig_version} onChange={e => set('sendig_version',e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
                {['3.0','3.1','3.1.1'].map(o => <option key={o}>{o}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Species</label>
              <select value={form.species} onChange={e => set('species',e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
                {['RAT','MOUSE','DOG','RABBIT','MONKEY','PIG'].map(o => <option key={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Study Type</label>
              <select value={form.study_type} onChange={e => set('study_type',e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
                {['Toxicology','PK','Safety','Efficacy','DART','GenTox'].map(o => <option key={o}>{o}</option>)}
              </select>
            </div>
          </div>
          {/* FS14.1.9 */}
          <label className="flex items-start gap-2 cursor-pointer">
            <input type="checkbox" checked={form.unique_subject_id_flag} onChange={e => set('unique_subject_id_flag', e.target.checked)} className="mt-1"/>
            <span className="text-sm text-slate-300">
              <span className="font-medium">Unique Subject Identifier Flag</span> (FS14.1.9)
              <br /><span className="text-xs text-slate-500">If checked, SUBJID is used directly as USUBJID. If unchecked, USUBJID = STUDYID-SUBJID. Does not apply to CSV/SEND Dataset studies.</span>
            </span>
          </label>
        </div>
        <div className="px-6 py-4 border-t border-slate-800 flex justify-end gap-3">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={() => mutation.mutate()} disabled={!form.savante_study_name || !form.protocol_number || mutation.isPending} className="btn-primary flex items-center gap-2">
            {mutation.isPending && <Loader2 size={14} className="animate-spin"/>}Create Study
          </button>
        </div>
      </div>
    </div>
  )
}
