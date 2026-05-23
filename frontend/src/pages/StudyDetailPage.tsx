import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Upload, GitMerge, ShieldCheck, FileText, Loader2, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react'
import { useDropzone } from 'react-dropzone'
import { getStudy, uploadFile, runTransformation, getDomains, runValidation, getValidationResults, generatePackage, getAuditTrail } from '../api/client'
import type { Study, ValidationIssue, AuditEntry } from '../types'
import { StatusBadge } from './DashboardPage'

const TABS = [
  { id:'ingest', icon:Upload, label:'Ingestion' },
  { id:'transform', icon:GitMerge, label:'Transformation' },
  { id:'validate', icon:ShieldCheck, label:'Validation' },
  { id:'report', icon:FileText, label:'Reports' },
]
const DOMAINS = ['DM','BW','LB','VS','CL','MI']

export default function StudyDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [tab, setTab] = useState('ingest')
  const { data: study, isLoading } = useQuery({ queryKey:['study',id], queryFn: () => getStudy(id!).then(r => r.data as Study) })

  if (isLoading) return <div className="flex items-center justify-center h-full text-slate-500"><Loader2 className="animate-spin mr-2"/>Loading…</div>
  if (!study) return <div className="p-8 text-slate-400">Study not found.</div>

  return (
    <div className="p-8">
      <div className="flex items-center gap-2 text-sm text-slate-500 mb-6">
        <Link to="/studies" className="hover:text-slate-300">Studies</Link>
        <span>/</span><span className="text-slate-300">{study.name}</span>
      </div>
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">{study.name}</h1>
          <div className="flex items-center gap-3 mt-2">
            <span className="font-mono text-sm text-slate-400">{study.protocol_number}</span>
            <span className="text-slate-700">·</span>
            <span className="text-sm text-slate-400">{study.species ?? '—'}</span>
            <span className="text-slate-700">·</span>
            <span className="text-sm text-slate-400">SENDIG {study.sendig_version}</span>
          </div>
        </div>
        <StatusBadge status={study.status} />
      </div>
      <div className="flex gap-1 mb-6 bg-slate-900 border border-slate-800 rounded-xl p-1 w-fit">
        {TABS.map(({ id:tid, icon:Icon, label }) => (
          <button key={tid} onClick={() => setTab(tid)} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab===tid ? 'bg-brand-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}>
            <Icon size={15}/>{label}
          </button>
        ))}
      </div>
      {tab==='ingest'    && <IngestionTab studyId={id!} />}
      {tab==='transform' && <TransformTab studyId={id!} />}
      {tab==='validate'  && <ValidationTab studyId={id!} />}
      {tab==='report'    && <ReportTab studyId={id!} />}
    </div>
  )
}

function IngestionTab({ studyId }: { studyId: string }) {
  const [taskResult, setTaskResult] = useState<string|null>(null)
  const mutation = useMutation({ mutationFn: ({ file }: { file: File }) => uploadFile(studyId, file), onSuccess: res => setTaskResult(`Task queued: ${res.data.task_id}`) })
  const { getRootProps, getInputProps, isDragActive, acceptedFiles } = useDropzone({ accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':['.xlsx'], 'text/csv':['.csv'] }, maxFiles: 1 })
  return (
    <div className="space-y-4 max-w-2xl">
      <div className="card">
        <h3 className="font-semibold text-white mb-1">Upload Raw Data File</h3>
        <p className="text-sm text-slate-500 mb-4">Accepts Excel (.xlsx) or CSV files from LIMS, ELN, or manual entry</p>
        <div {...getRootProps()} className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${isDragActive ? 'border-brand-500 bg-brand-900/20' : 'border-slate-700 hover:border-slate-600'}`}>
          <input {...getInputProps()}/>
          <Upload size={32} className="mx-auto mb-3 text-slate-500"/>
          {acceptedFiles.length > 0 ? <p className="text-sm text-brand-400 font-medium">{acceptedFiles[0].name}</p> : <><p className="text-sm text-slate-400">Drop your file here or click to browse</p><p className="text-xs text-slate-600 mt-1">.xlsx, .csv supported</p></>}
        </div>
        <button onClick={() => acceptedFiles[0] && mutation.mutate({ file: acceptedFiles[0] })} disabled={!acceptedFiles.length || mutation.isPending} className="btn-primary mt-4 flex items-center gap-2">
          {mutation.isPending && <Loader2 size={14} className="animate-spin"/>}Start Ingestion
        </button>
        {taskResult && <div className="mt-3 p-3 rounded-lg bg-emerald-900/20 border border-emerald-800 text-emerald-400 text-sm">✓ {taskResult}</div>}
      </div>
    </div>
  )
}

function TransformTab({ studyId }: { studyId: string }) {
  const [selected, setSelected] = useState<string[]>(['DM','BW'])
  const [taskMsg, setTaskMsg] = useState<string|null>(null)
  const { data: domains } = useQuery({ queryKey:['domains',studyId], queryFn: () => getDomains(studyId).then(r => r.data) })
  const mutation = useMutation({ mutationFn: () => runTransformation(studyId, selected), onSuccess: res => setTaskMsg(`Task queued: ${res.data.task_id}`) })
  const toggle = (d: string) => setSelected(s => s.includes(d) ? s.filter(x => x!==d) : [...s,d])
  return (
    <div className="space-y-4 max-w-2xl">
      <div className="card">
        <h3 className="font-semibold text-white mb-1">Generate SEND Domains</h3>
        <p className="text-sm text-slate-500 mb-4">Map raw data to SEND-compliant XPT files</p>
        <div className="flex flex-wrap gap-2 mb-5">
          {DOMAINS.map(d => <button key={d} onClick={() => toggle(d)} className={`px-3 py-1.5 rounded-lg text-sm font-mono font-medium border transition-colors ${selected.includes(d) ? 'bg-brand-600/20 border-brand-500 text-brand-400' : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600'}`}>{d}</button>)}
        </div>
        <button onClick={() => mutation.mutate()} disabled={!selected.length || mutation.isPending} className="btn-primary flex items-center gap-2">
          {mutation.isPending ? <Loader2 size={14} className="animate-spin"/> : <GitMerge size={14}/>}Run Transformation
        </button>
        {taskMsg && <div className="mt-3 p-3 rounded-lg bg-emerald-900/20 border border-emerald-800 text-emerald-400 text-sm">✓ {taskMsg}</div>}
      </div>
      {domains && domains.length > 0 && (
        <div className="card p-0 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-800"><h4 className="text-sm font-medium text-slate-300">Domain Status</h4></div>
          <table className="w-full"><thead><tr className="border-b border-slate-800">{['Domain','Records','Status'].map(h => <th key={h} className="text-left text-xs font-medium text-slate-500 uppercase px-5 py-3">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-800">{domains.map((d: any) => <tr key={d.id}><td className="px-5 py-3 font-mono text-sm text-white">{d.domain_code}</td><td className="px-5 py-3 text-sm text-slate-400">{d.record_count}</td><td className="px-5 py-3 text-sm text-slate-400">{d.status}</td></tr>)}</tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function ValidationTab({ studyId }: { studyId: string }) {
  const [selected, setSelected] = useState<string[]>(['DM','BW'])
  const [taskMsg, setTaskMsg] = useState<string|null>(null)
  const { data: results, refetch } = useQuery({ queryKey:['validation',studyId], queryFn: () => getValidationResults(studyId).then(r => r.data) })
  const mutation = useMutation({ mutationFn: () => runValidation(studyId, selected), onSuccess: res => { setTaskMsg(`Task queued: ${res.data.task_id}`); setTimeout(() => refetch(), 2000) } })
  const toggle = (d: string) => setSelected(s => s.includes(d) ? s.filter(x => x!==d) : [...s,d])
  const issues: ValidationIssue[] = results?.results ?? []
  return (
    <div className="space-y-4 max-w-3xl">
      <div className="card">
        <h3 className="font-semibold text-white mb-1">Run SENDIG Validation</h3>
        <p className="text-sm text-slate-500 mb-4">Validates against SENDIG 3.1 and FDA rules</p>
        <div className="flex flex-wrap gap-2 mb-5">{DOMAINS.map(d => <button key={d} onClick={() => toggle(d)} className={`px-3 py-1.5 rounded-lg text-sm font-mono font-medium border transition-colors ${selected.includes(d) ? 'bg-brand-600/20 border-brand-500 text-brand-400' : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600'}`}>{d}</button>)}</div>
        <button onClick={() => mutation.mutate()} disabled={mutation.isPending} className="btn-primary flex items-center gap-2">
          {mutation.isPending ? <Loader2 size={14} className="animate-spin"/> : <ShieldCheck size={14}/>}Run Validation
        </button>
        {taskMsg && <div className="mt-3 p-3 rounded-lg bg-emerald-900/20 border border-emerald-800 text-emerald-400 text-sm">✓ {taskMsg}</div>}
      </div>
      {results && (
        <div className="grid grid-cols-3 gap-3">
          {[{icon:<XCircle size={20} className="text-red-400"/>,label:'Errors',value:issues.filter(i=>i.severity==='Error').length},{icon:<AlertTriangle size={20} className="text-amber-400"/>,label:'Warnings',value:issues.filter(i=>i.severity==='Warning').length},{icon:<CheckCircle2 size={20} className="text-emerald-400"/>,label:'Total Issues',value:issues.length}].map(({icon,label,value}) => (
            <div key={label} className="card flex items-center gap-3">{icon}<div><p className="text-xl font-bold text-white">{value}</p><p className="text-xs text-slate-500">{label}</p></div></div>
          ))}
        </div>
      )}
      {issues.length > 0 && (
        <div className="card p-0 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-800"><h4 className="text-sm font-medium text-slate-300">Validation Issues</h4></div>
          <div className="divide-y divide-slate-800">
            {issues.map((issue, i) => (
              <div key={i} className="px-5 py-3.5 flex gap-4">
                <div className={`mt-0.5 flex-shrink-0 ${issue.severity==='Error'?'text-red-400':'text-amber-400'}`}>{issue.severity==='Error'?<XCircle size={16}/>:<AlertTriangle size={16}/>}</div>
                <div><div className="flex items-center gap-2 mb-0.5"><span className="font-mono text-xs text-slate-500">{issue.rule_id}</span><span className="font-mono text-xs text-brand-400">{issue.domain}.{issue.variable}</span></div><p className="text-sm text-slate-300">{issue.message}</p></div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function ReportTab({ studyId }: { studyId: string }) {
  const [taskMsg, setTaskMsg] = useState<string|null>(null)
  const { data: auditData } = useQuery({ queryKey:['audit',studyId], queryFn: () => getAuditTrail(studyId).then(r => r.data as AuditEntry[]) })
  const mutation = useMutation({ mutationFn: () => generatePackage(studyId), onSuccess: res => setTaskMsg(`Package started: ${res.data.task_id}`) })
  return (
    <div className="space-y-4 max-w-3xl">
      <div className="card">
        <h3 className="font-semibold text-white mb-1">Generate Submission Package</h3>
        <p className="text-sm text-slate-500 mb-4">Creates Define.xml, SDRG, and bundles all XPT files for FDA submission</p>
        <div className="grid grid-cols-3 gap-3 mb-5">
          {[{label:'Define.xml',desc:'CDISC metadata'},{label:'SDRG',desc:"Reviewer's guide"},{label:'XPT Files',desc:'SAS transport'}].map(({label,desc}) => (
            <div key={label} className="p-3 rounded-lg bg-slate-800 border border-slate-700"><p className="text-sm font-medium text-white">{label}</p><p className="text-xs text-slate-500 mt-0.5">{desc}</p></div>
          ))}
        </div>
        <button onClick={() => mutation.mutate()} disabled={mutation.isPending} className="btn-primary flex items-center gap-2">
          {mutation.isPending ? <Loader2 size={14} className="animate-spin"/> : <FileText size={14}/>}Generate Package
        </button>
        {taskMsg && <div className="mt-3 p-3 rounded-lg bg-emerald-900/20 border border-emerald-800 text-emerald-400 text-sm">✓ {taskMsg}</div>}
      </div>
      <div className="card p-0 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-800"><h4 className="text-sm font-medium text-slate-300">Audit Trail (21 CFR Part 11)</h4></div>
        {!auditData?.length ? <div className="px-5 py-8 text-center text-slate-600 text-sm">No audit entries yet</div> : (
          <div className="divide-y divide-slate-800">
            {auditData.map(entry => (
              <div key={entry.id} className="px-5 py-3.5 flex items-start gap-4">
                <div className="w-1.5 h-1.5 rounded-full bg-brand-500 mt-2 flex-shrink-0"/>
                <div><div className="flex items-center gap-2"><span className="text-sm font-medium text-white font-mono">{entry.action}</span><span className="text-xs text-slate-500">{entry.resource_type}</span></div><p className="text-xs text-slate-500 mt-0.5">by {entry.user_id} · {new Date(entry.timestamp).toLocaleString()}</p></div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
