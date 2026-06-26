import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Upload, GitMerge, ShieldCheck, FileText, Loader2, CheckCircle2, AlertTriangle, XCircle,
  Users, Beaker, ClipboardCheck, BookOpen
} from 'lucide-react'
import { useDropzone } from 'react-dropzone'
import {
  getStudy, uploadFile, getSendDomains, runTransformation, getStudyDomains,
  runValidation, getValidationResults, generatePackage, getAuditTrail,
  getGroups, createGroup, getAnimals, getCTMappings, updateCTMapping, bulkMapCT,
  updateStudy, approveDataset
} from '../api/client'
import type { Study, StudyGroup, AuditEntry, CTMapping, Domain } from '../types'
import { StatusBadge } from './DashboardPage'

const TABS = [
  { id:'study',     icon:FileText,      label:'Study (FS14)' },
  { id:'groups',    icon:Beaker,        label:'Groups (FS15)' },
  { id:'animals',   icon:Users,         label:'Animals (FS16)' },
  { id:'ingest',    icon:Upload,        label:'Ingestion (FS10/13)' },
  { id:'transform', icon:GitMerge,      label:'SEND Output (FS22/23)' },
  { id:'ct',        icon:BookOpen,      label:'CT Mapping (FS25)' },
  { id:'validate',  icon:ShieldCheck,   label:'Validation' },
  { id:'report',    icon:ClipboardCheck,label:'Reports (FS29/32)' },
]

export default function StudyDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [tab, setTab] = useState('study')
  const { data: study, isLoading } = useQuery({ queryKey:['study',id], queryFn: () => getStudy(id!).then(r => r.data as Study) })

  if (isLoading) return <div className="flex items-center justify-center h-full text-slate-500"><Loader2 className="animate-spin mr-2"/>Loading…</div>
  if (!study) return <div className="p-8 text-slate-400">Study not found.</div>

  return (
    <div className="p-8">
      <div className="flex items-center gap-2 text-sm text-slate-500 mb-6">
        <Link to="/studies" className="hover:text-slate-300">Studies</Link><span>/</span><span className="text-slate-300">{study.pts_study_name}</span>
      </div>
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">{study.pts_study_name}</h1>
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <span className="font-mono text-sm text-slate-400">{study.protocol_number}</span>
            <span className="text-slate-700">·</span><span className="text-sm text-slate-400">{study.species ?? '—'}</span>
            <span className="text-slate-700">·</span><span className="text-sm text-slate-400">SENDIG {study.sendig_version}</span>
            <span className="text-slate-700">·</span><span className="text-sm text-slate-400">{study.connection_type}</span>
            {study.dataset_approved && <span className="badge-green">Dataset Approved</span>}
          </div>
        </div>
        <StatusBadge status={study.study_status}/>
      </div>
      <div className="flex gap-1 mb-6 bg-slate-900 border border-slate-800 rounded-xl p-1 w-fit flex-wrap">
        {TABS.map(({ id:tid, icon:Icon, label }) => (
          <button key={tid} onClick={() => setTab(tid)} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${tab===tid ? 'bg-brand-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}>
            <Icon size={14}/>{label}
          </button>
        ))}
      </div>
      {tab==='study'     && <StudyTab study={study} />}
      {tab==='groups'    && <GroupsTab studyId={id!} />}
      {tab==='animals'   && <AnimalsTab studyId={id!} />}
      {tab==='ingest'    && <IngestionTab studyId={id!} />}
      {tab==='transform' && <TransformTab studyId={id!} />}
      {tab==='ct'        && <CTTab studyId={id!} />}
      {tab==='validate'  && <ValidationTab studyId={id!} />}
      {tab==='report'    && <ReportTab study={study} />}
    </div>
  )
}

// ── FS14 — Study Tab ─────────────────────────────────────────────────────────

function StudyTab({ study }: { study: Study }) {
  const qc = useQueryClient()
  const [status, setStatus] = useState(study.study_status)
  const needsReason = ['DataLoaded','Validated','Approved','Locked'].includes(status)

  const mutation = useMutation({
    mutationFn: () => {
      const reason = needsReason ? prompt('FS14.2.1: Enter audit reason for this change') ?? '' : undefined
      if (needsReason && !reason) throw new Error('Reason required')
      return updateStudy(study.id, { study_status: status }, reason)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey:['study', study.id] }),
  })

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="card">
        <h3 className="font-semibold text-white mb-4">FS14 — Study Definition</h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <Field label="Study Name (FS14.1.2)" value={study.pts_study_name}/>
          <Field label="Import Study Name (FS14.1.3)" value={study.import_study_name || '—'}/>
          <Field label="Protocol Status (FS14.1.4)" value={study.protocol_status || 'Not set'}/>
          <Field label="Protocol Number" value={study.protocol_number}/>
          <Field label="Connection Type" value={study.connection_type}/>
          <Field label="SENDIG Version" value={study.sendig_version}/>
          <Field label="Species" value={study.species || '—'}/>
          <Field label="Study Type" value={study.study_type || '—'}/>
        </div>

        <div className="mt-5 pt-5 border-t border-slate-800">
          <label className="block text-sm font-medium text-slate-300 mb-1.5">Study Status (FS14.1.1)</label>
          <p className="text-xs text-slate-500 mb-2">When status is "Data Loaded" or beyond, an audit reason is required for edits.</p>
          <div className="flex items-center gap-3">
            <select value={status} onChange={e => setStatus(e.target.value as Study['study_status'])} className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand-500">
              {['Setup','DataLoaded','Validated','Approved','Locked'].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <button onClick={() => mutation.mutate()} disabled={status === study.study_status || mutation.isPending} className="btn-primary flex items-center gap-2 text-sm">
              {mutation.isPending && <Loader2 size={14} className="animate-spin"/>}Save Status
            </button>
          </div>
        </div>

        {/* FS14.1.9 */}
        <div className="mt-5 pt-5 border-t border-slate-800">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-300">Unique Subject Identifier Flag (FS14.1.9)</span>
            {study.unique_subject_id_flag ? <span className="badge-green">Enabled</span> : <span className="badge-gray">Disabled</span>}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {study.unique_subject_id_flag ? 'USUBJID = SUBJID (used as-is)' : 'USUBJID = STUDYID-SUBJID (default)'}
          </p>
        </div>
      </div>

      {/* FS14.1.5-8 Dataset Approval status */}
      <div className="card">
        <h3 className="font-semibold text-white mb-4">Dataset Approval (FS14.1.5–8)</h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <Field label="Approved" value={study.dataset_approved ? 'Yes' : 'No'}/>
          <Field label="Approved By" value={study.dataset_approved_by || '—'}/>
          <Field label="Approved Date" value={study.dataset_approved_date ? new Date(study.dataset_approved_date).toLocaleString() : '—'}/>
          <Field label="Comment" value={study.dataset_approved_comment || '—'}/>
        </div>
      </div>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs text-slate-500 mb-1">{label}</p><p className="text-white font-medium">{value}</p></div>
}

// ── FS15 — Groups Tab ────────────────────────────────────────────────────────

function GroupsTab({ studyId }: { studyId: string }) {
  const [showAdd, setShowAdd] = useState(false)
  const { data: groups } = useQuery({ queryKey:['groups',studyId], queryFn: () => getGroups(studyId).then(r => r.data as StudyGroup[]) })

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="card p-0 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
          <div><h3 className="text-sm font-medium text-slate-300">FS15 — Study Definition: Groups</h3><p className="text-xs text-slate-500 mt-0.5">Control type, dose groups, GRPLBL (TX domain)</p></div>
          <div className="flex gap-2">
            <button className="btn-secondary text-xs">Export to CSV (FS15.2.1)</button>
            <button className="btn-secondary text-xs">Import from CSV (FS15.2.2)</button>
            <button onClick={() => setShowAdd(true)} className="btn-primary text-xs">+ Add Group</button>
          </div>
        </div>
        {!groups?.length ? <div className="px-5 py-8 text-center text-slate-600 text-sm">No groups defined yet.</div> : (
          <table className="w-full">
            <thead><tr className="border-b border-slate-800">{['Group #','Control Type','Male Label (GRPLBL)','Female Label','Compound','Route','# Males','# Females'].map(h => <th key={h} className="text-left text-xs font-medium text-slate-500 uppercase px-4 py-3">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-800">
              {groups.map(g => (
                <tr key={g.id} className="hover:bg-slate-800/30">
                  <td className="px-4 py-3 font-mono text-sm text-white">{g.group_number}</td>
                  <td className="px-4 py-3 text-sm text-slate-400">{g.control_type ?? '—'}</td>
                  <td className="px-4 py-3 text-sm text-slate-300">{g.male_group_label ?? '—'}</td>
                  <td className="px-4 py-3 text-sm text-slate-300">{g.female_group_label ?? '—'}</td>
                  <td className="px-4 py-3 text-sm text-slate-400">{g.compound ?? '—'}</td>
                  <td className="px-4 py-3 text-sm text-slate-400">{g.route ?? '—'}</td>
                  <td className="px-4 py-3 text-sm text-slate-400 text-center">{g.num_males}</td>
                  <td className="px-4 py-3 text-sm text-slate-400 text-center">{g.num_females}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {showAdd && <AddGroupModal studyId={studyId} onClose={() => setShowAdd(false)} />}
    </div>
  )
}

function AddGroupModal({ studyId, onClose }: { studyId: string; onClose: () => void }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({ group_number:'', control_type:'', male_group_label:'', female_group_label:'', compound:'', route:'ORAL', num_males:0, num_females:0 })
  const mutation = useMutation({ mutationFn: () => createGroup(studyId, form), onSuccess: () => { qc.invalidateQueries({ queryKey:['groups',studyId] }); onClose() } })
  const set = (k: string, v: string|number) => setForm(f => ({...f,[k]:v}))
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl">
        <div className="px-6 py-5 border-b border-slate-800"><h2 className="text-lg font-semibold text-white">Add Group (FS15)</h2></div>
        <div className="px-6 py-5 space-y-3">
          <div><label className="block text-sm font-medium text-slate-300 mb-1.5">Group Number</label><input value={form.group_number} onChange={e => set('group_number',e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"/></div>
          <div><label className="block text-sm font-medium text-slate-300 mb-1.5">Control Type</label><input value={form.control_type} onChange={e => set('control_type',e.target.value)} placeholder="e.g. Vehicle Control" className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"/></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-sm font-medium text-slate-300 mb-1.5">Male Label (GRPLBL)</label><input value={form.male_group_label} onChange={e => set('male_group_label',e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"/></div>
            <div><label className="block text-sm font-medium text-slate-300 mb-1.5">Female Label</label><input value={form.female_group_label} onChange={e => set('female_group_label',e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"/></div>
          </div>
          <div><label className="block text-sm font-medium text-slate-300 mb-1.5">Compound</label><input value={form.compound} onChange={e => set('compound',e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"/></div>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="block text-sm font-medium text-slate-300 mb-1.5">Route</label><select value={form.route} onChange={e => set('route',e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">{['ORAL','INTRAVENOUS','SUBCUTANEOUS','INTRAPERITONEAL','TOPICAL','INHALATION'].map(r => <option key={r}>{r}</option>)}</select></div>
            <div><label className="block text-sm font-medium text-slate-300 mb-1.5"># Males</label><input type="number" value={form.num_males} onChange={e => set('num_males',Number(e.target.value))} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"/></div>
            <div><label className="block text-sm font-medium text-slate-300 mb-1.5"># Females</label><input type="number" value={form.num_females} onChange={e => set('num_females',Number(e.target.value))} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"/></div>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-slate-800 flex justify-end gap-3">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={() => mutation.mutate()} disabled={!form.group_number || mutation.isPending} className="btn-primary flex items-center gap-2">{mutation.isPending && <Loader2 size={14} className="animate-spin"/>}Add Group</button>
        </div>
      </div>
    </div>
  )
}

// ── FS16 — Animals Tab ───────────────────────────────────────────────────────

function AnimalsTab({ studyId }: { studyId: string }) {
  const { data: animals } = useQuery({ queryKey:['animals',studyId], queryFn: () => getAnimals(studyId).then(r => r.data) })
  return (
    <div className="card p-0 overflow-hidden max-w-4xl">
      <div className="px-5 py-3.5 border-b border-slate-800"><h3 className="text-sm font-medium text-slate-300">FS16 — Study Definition: Animals</h3><p className="text-xs text-slate-500 mt-0.5">Subject-level data with computed USUBJID (per FS14.1.9 flag)</p></div>
      {!animals?.length ? <div className="px-5 py-8 text-center text-slate-600 text-sm">No animals loaded yet. Use Ingestion tab to load study data.</div> : (
        <table className="w-full">
          <thead><tr className="border-b border-slate-800">{['SUBJID','USUBJID','Sex','Species','Strain','ARMCD','SETCD','RFSTDTC'].map(h => <th key={h} className="text-left text-xs font-medium text-slate-500 uppercase px-4 py-3">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-slate-800">
            {animals.map((a: any) => (
              <tr key={a.id} className="hover:bg-slate-800/30">
                <td className="px-4 py-3 font-mono text-sm text-white">{a.subject_id}</td>
                <td className="px-4 py-3 font-mono text-sm text-brand-400">{a.usubjid}</td>
                <td className="px-4 py-3 text-sm text-slate-400">{a.sex ?? '—'}</td>
                <td className="px-4 py-3 text-sm text-slate-400">{a.species ?? '—'}</td>
                <td className="px-4 py-3 text-sm text-slate-400">{a.strain ?? '—'}</td>
                <td className="px-4 py-3 text-sm text-slate-400">{a.armcd ?? '—'}</td>
                <td className="px-4 py-3 text-sm text-slate-400">{a.setcd ?? '—'}</td>
                <td className="px-4 py-3 text-sm text-slate-400">{a.rfstdtc ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

// ── FS10/FS13 — Ingestion Tab ────────────────────────────────────────────────

function IngestionTab({ studyId }: { studyId: string }) {
  const [taskResult, setTaskResult] = useState<string|null>(null)
  const [domainHint, setDomainHint] = useState('AUTO')
  const mutation = useMutation({ mutationFn: ({ file }: { file: File }) => uploadFile(studyId, file, domainHint), onSuccess: res => setTaskResult(`Task queued: ${res.data.task_id}`) })
  const { getRootProps, getInputProps, isDragActive, acceptedFiles } = useDropzone({ accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':['.xlsx'], 'text/csv':['.csv'] }, maxFiles: 1 })

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="card">
        <h3 className="font-semibold text-white mb-1">FS10/FS13 — Study Load: Select Measurements/Files</h3>
        <p className="text-sm text-slate-500 mb-4">Upload raw measurement data (Excel/CSV) for ingestion into PtsSEND.</p>
        <div className="mb-4">
          <label className="block text-sm font-medium text-slate-300 mb-1.5">Domain Hint (FS11 Input Mapping)</label>
          <select value={domainHint} onChange={e => setDomainHint(e.target.value)} className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand-500">
            <option value="AUTO">AUTO — detect automatically</option>
            {['DM','BW','LB','CL','MA','MI','VS','FW','OM','BG','PM','EX'].map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div {...getRootProps()} className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${isDragActive ? 'border-brand-500 bg-brand-900/20' : 'border-slate-700 hover:border-slate-600'}`}>
          <input {...getInputProps()}/>
          <Upload size={32} className="mx-auto mb-3 text-slate-500"/>
          {acceptedFiles.length > 0 ? <p className="text-sm text-brand-400 font-medium">{acceptedFiles[0].name}</p> : <><p className="text-sm text-slate-400">Drop your file here or click to browse</p><p className="text-xs text-slate-600 mt-1">.xlsx, .csv supported</p></>}
        </div>
        <button onClick={() => acceptedFiles[0] && mutation.mutate({ file: acceptedFiles[0] })} disabled={!acceptedFiles.length || mutation.isPending} className="btn-primary mt-4 flex items-center gap-2">
          {mutation.isPending && <Loader2 size={14} className="animate-spin"/>}Start Load
        </button>
        {taskResult && <div className="mt-3 p-3 rounded-lg bg-emerald-900/20 border border-emerald-800 text-emerald-400 text-sm">✓ {taskResult}</div>}
      </div>
    </div>
  )
}

// ── FS22/FS23 — Transformation Tab ──────────────────────────────────────────

function TransformTab({ studyId }: { studyId: string }) {
  const [selected, setSelected] = useState<string[]>(['DM','BW'])
  const [outputFormat, setOutputFormat] = useState('XPT')
  const [taskMsg, setTaskMsg] = useState<string|null>(null)
  const { data: allDomains } = useQuery({ queryKey:['send-domains'], queryFn: () => getSendDomains().then(r => r.data as {code:string;label:string}[]) })
  const { data: domains } = useQuery({ queryKey:['domains',studyId], queryFn: () => getStudyDomains(studyId).then(r => r.data as Domain[]) })
  const mutation = useMutation({ mutationFn: () => runTransformation(studyId, selected, outputFormat), onSuccess: res => setTaskMsg(`Task queued: ${res.data.task_id}`) })
  const toggle = (d: string) => setSelected(s => s.includes(d) ? s.filter(x => x!==d) : [...s,d])

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="card">
        <h3 className="font-semibold text-white mb-1">FS22/FS23 — SEND Output Mapping & Generation</h3>
        <p className="text-sm text-slate-500 mb-4">Select domains and output format (XPT for FDA submission, CSV/XML for review)</p>

        <div className="mb-4">
          <label className="block text-sm font-medium text-slate-300 mb-1.5">Output Format (FS23)</label>
          <div className="flex gap-2">
            {['XPT','CSV','XML'].map(f => (
              <button key={f} onClick={() => setOutputFormat(f)} className={`px-4 py-1.5 rounded-lg text-sm font-mono font-medium border transition-colors ${outputFormat===f ? 'bg-brand-600/20 border-brand-500 text-brand-400' : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600'}`}>{f}</button>
            ))}
          </div>
          <p className="text-xs text-slate-500 mt-1">{outputFormat === 'XPT' ? 'SAS Transport format — used for FDA submission' : 'Used for data warehousing, review, etc.'}</p>
        </div>

        <label className="block text-sm font-medium text-slate-300 mb-1.5">SEND Domains (FS27)</label>
        <div className="flex flex-wrap gap-2 mb-5 max-h-40 overflow-y-auto">
          {(allDomains ?? []).map(d => (
            <button key={d.code} onClick={() => toggle(d.code)} title={d.label} className={`px-3 py-1.5 rounded-lg text-sm font-mono font-medium border transition-colors ${selected.includes(d.code) ? 'bg-brand-600/20 border-brand-500 text-brand-400' : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600'}`}>{d.code}</button>
          ))}
        </div>

        <button onClick={() => mutation.mutate()} disabled={!selected.length || mutation.isPending} className="btn-primary flex items-center gap-2">
          {mutation.isPending ? <Loader2 size={14} className="animate-spin"/> : <GitMerge size={14}/>}Generate {outputFormat}
        </button>
        {taskMsg && <div className="mt-3 p-3 rounded-lg bg-emerald-900/20 border border-emerald-800 text-emerald-400 text-sm">✓ {taskMsg}</div>}
      </div>

      {domains && domains.length > 0 && (
        <div className="card p-0 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-800"><h4 className="text-sm font-medium text-slate-300">Domain Status</h4></div>
          <table className="w-full"><thead><tr className="border-b border-slate-800">{['Domain','Label','Records','Status','Errors','Warnings'].map(h => <th key={h} className="text-left text-xs font-medium text-slate-500 uppercase px-5 py-3">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-800">
              {domains.map(d => (
                <tr key={d.id}>
                  <td className="px-5 py-3 font-mono text-sm text-white">{d.domain_code}</td>
                  <td className="px-5 py-3 text-sm text-slate-400">{d.domain_label ?? '—'}</td>
                  <td className="px-5 py-3 text-sm text-slate-400">{d.record_count}</td>
                  <td className="px-5 py-3 text-sm text-slate-400">{d.status}</td>
                  <td className="px-5 py-3 text-sm text-red-400">{d.validation_errors}</td>
                  <td className="px-5 py-3 text-sm text-amber-400">{d.validation_warnings}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── FS25 — CT Mapping Tab ────────────────────────────────────────────────────

function CTTab({ studyId }: { studyId: string }) {
  const qc = useQueryClient()
  const [domainFilter, setDomainFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('Unmapped')
  const { data: mappings } = useQuery({
    queryKey:['ct-mappings',studyId,domainFilter,statusFilter],
    queryFn: () => getCTMappings({ study_id: studyId, ...(domainFilter ? { domain_code: domainFilter } : {}), ...(statusFilter ? { status: statusFilter } : {}) }).then(r => r.data as CTMapping[]),
  })
  const updateMutation = useMutation({ mutationFn: ({id,data}:{id:string;data:Record<string,unknown>}) => updateCTMapping(id,data), onSuccess: () => qc.invalidateQueries({ queryKey:['ct-mappings',studyId] }) })
  const bulkMutation = useMutation({ mutationFn: ({domain,variable}:{domain:string;variable:string}) => bulkMapCT(domain,variable,studyId), onSuccess: () => qc.invalidateQueries({ queryKey:['ct-mappings',studyId] }) })

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="card">
        <h3 className="font-semibold text-white mb-1">FS25 — Controlled Terminology Mapping</h3>
        <p className="text-sm text-slate-500 mb-4">Map source values to CDISC SEND Controlled Terminology submission values</p>
        <div className="flex gap-3">
          <input value={domainFilter} onChange={e => setDomainFilter(e.target.value)} placeholder="Filter by domain (e.g. DM)" className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand-500"/>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand-500">
            <option value="">All</option><option value="Unmapped">Unmapped</option><option value="Mapped">Mapped</option><option value="Suppressed">Suppressed</option>
          </select>
        </div>
      </div>
      <div className="card p-0 overflow-hidden">
        {!mappings?.length ? <div className="px-5 py-8 text-center text-slate-600 text-sm">No CT mapping items found for this filter (FS44 Unmapped Term Status).</div> : (
          <table className="w-full">
            <thead><tr className="border-b border-slate-800">{['Domain','Variable','Source Value','CT Value','Codelist','Status',''].map(h => <th key={h} className="text-left text-xs font-medium text-slate-500 uppercase px-4 py-3">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-800">
              {mappings.map(m => (
                <tr key={m.id} className="hover:bg-slate-800/30">
                  <td className="px-4 py-3 font-mono text-sm text-brand-400">{m.domain_code}</td>
                  <td className="px-4 py-3 font-mono text-sm text-white">{m.variable_name}</td>
                  <td className="px-4 py-3 text-sm text-slate-300">{m.source_value}</td>
                  <td className="px-4 py-3">
                    <input defaultValue={m.ct_value ?? ''} onBlur={e => e.target.value !== (m.ct_value ?? '') && updateMutation.mutate({id:m.id,data:{ct_value:e.target.value,status:'Mapped'}})} placeholder="Enter CT value" className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm text-white w-32 focus:outline-none focus:ring-2 focus:ring-brand-500"/>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-500">{m.ct_codelist ?? '—'}</td>
                  <td className="px-4 py-3">
                    {m.status === 'Mapped' ? <span className="badge-green flex items-center gap-1 w-fit"><CheckCircle2 size={11}/>Mapped</span>
                    : m.status === 'Suppressed' ? <span className="badge-gray">Suppressed</span>
                    : <span className="badge-yellow flex items-center gap-1 w-fit"><AlertTriangle size={11}/>Unmapped</span>}
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => bulkMutation.mutate({domain:m.domain_code,variable:m.variable_name})} className="text-xs text-brand-400 hover:underline">Auto-map all</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ── Validation Tab ────────────────────────────────────────────────────────────

function ValidationTab({ studyId }: { studyId: string }) {
  const [selected, setSelected] = useState<string[]>(['DM','BW'])
  const [taskMsg, setTaskMsg] = useState<string|null>(null)
  const { data: results, refetch } = useQuery({ queryKey:['validation',studyId], queryFn: () => getValidationResults(studyId).then(r => r.data) })
  const mutation = useMutation({ mutationFn: () => runValidation(studyId, selected), onSuccess: res => { setTaskMsg(`Task queued: ${res.data.task_id}`); setTimeout(() => refetch(), 2000) } })
  const toggle = (d: string) => setSelected(s => s.includes(d) ? s.filter(x => x!==d) : [...s,d])
  const issues = results?.results ?? []

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="card">
        <h3 className="font-semibold text-white mb-1">Run SENDIG Validation</h3>
        <p className="text-sm text-slate-500 mb-4">Validates against SENDIG, FDA validator rules, and business rules per FS27 domain algorithms</p>
        <div className="flex flex-wrap gap-2 mb-5">{['DM','BW','LB','CL','MA','MI'].map(d => <button key={d} onClick={() => toggle(d)} className={`px-3 py-1.5 rounded-lg text-sm font-mono font-medium border transition-colors ${selected.includes(d) ? 'bg-brand-600/20 border-brand-500 text-brand-400' : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600'}`}>{d}</button>)}</div>
        <button onClick={() => mutation.mutate()} disabled={mutation.isPending} className="btn-primary flex items-center gap-2">{mutation.isPending ? <Loader2 size={14} className="animate-spin"/> : <ShieldCheck size={14}/>}Run Validation</button>
        {taskMsg && <div className="mt-3 p-3 rounded-lg bg-emerald-900/20 border border-emerald-800 text-emerald-400 text-sm">✓ {taskMsg}</div>}
      </div>
      {results && (
        <div className="grid grid-cols-3 gap-3">
          {[{icon:<XCircle size={20} className="text-red-400"/>,label:'Errors',value:issues.filter((i:any)=>i.severity==='Error').length},
            {icon:<AlertTriangle size={20} className="text-amber-400"/>,label:'Warnings',value:issues.filter((i:any)=>i.severity==='Warning').length},
            {icon:<CheckCircle2 size={20} className="text-emerald-400"/>,label:'Total Issues',value:issues.length}].map(({icon,label,value}) => (
            <div key={label} className="card flex items-center gap-3">{icon}<div><p className="text-xl font-bold text-white">{value}</p><p className="text-xs text-slate-500">{label}</p></div></div>
          ))}
        </div>
      )}
      {issues.length > 0 && (
        <div className="card p-0 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-800"><h4 className="text-sm font-medium text-slate-300">Validation Issues</h4></div>
          <div className="divide-y divide-slate-800">
            {issues.map((issue:any, i:number) => (
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

// ── FS29/FS32/FS43 — Reports Tab ────────────────────────────────────────────

function ReportTab({ study }: { study: Study }) {
  const qc = useQueryClient()
  const [taskMsg, setTaskMsg] = useState<string|null>(null)
  const [format, setFormat] = useState('XPT')
  const { data: auditData } = useQuery({ queryKey:['audit',study.id], queryFn: () => getAuditTrail(study.id).then(r => r.data as AuditEntry[]) })
  const mutation = useMutation({ mutationFn: () => generatePackage(study.id, format), onSuccess: res => setTaskMsg(`Package started: ${res.data.task_id}`) })
  const approveMutation = useMutation({
    mutationFn: () => { const comment = prompt('FS8.2.7: Enter approval comment') ?? ''; return approveDataset(study.id, comment) },
    onSuccess: () => qc.invalidateQueries({ queryKey:['study',study.id] }),
  })

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="card">
        <h3 className="font-semibold text-white mb-1">FS23/FS29 — Generate Submission Package</h3>
        <p className="text-sm text-slate-500 mb-4">Creates Define.xml, SDRG, and bundles all domain files</p>
        <div className="mb-4">
          <label className="block text-sm font-medium text-slate-300 mb-1.5">Output Format</label>
          <div className="flex gap-2">{['XPT','CSV','XML'].map(f => <button key={f} onClick={() => setFormat(f)} className={`px-4 py-1.5 rounded-lg text-sm font-mono font-medium border transition-colors ${format===f ? 'bg-brand-600/20 border-brand-500 text-brand-400' : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600'}`}>{f}</button>)}</div>
        </div>
        <div className="grid grid-cols-3 gap-3 mb-5">
          {[{label:'Define.xml (FS29)',desc:'CDISC metadata'},{label:'SDRG (App. J)',desc:"Reviewer's guide"},{label:`${format} Files`,desc:'Domain datasets'}].map(({label,desc}) => (
            <div key={label} className="p-3 rounded-lg bg-slate-800 border border-slate-700"><p className="text-sm font-medium text-white">{label}</p><p className="text-xs text-slate-500 mt-0.5">{desc}</p></div>
          ))}
        </div>
        <button onClick={() => mutation.mutate()} disabled={mutation.isPending} className="btn-primary flex items-center gap-2">{mutation.isPending ? <Loader2 size={14} className="animate-spin"/> : <FileText size={14}/>}Generate Package</button>
        {taskMsg && <div className="mt-3 p-3 rounded-lg bg-emerald-900/20 border border-emerald-800 text-emerald-400 text-sm">✓ {taskMsg}</div>}
      </div>

      {/* FS8.2.7 Approve Dataset */}
      <div className="card">
        <h3 className="font-semibold text-white mb-1">FS8.2.7 — Approve Dataset</h3>
        <p className="text-sm text-slate-500 mb-4">Available when Protocol Status is "Closed" or "Archived". Records approval flag, user, comment in SEND_TS table.</p>
        {study.dataset_approved ? (
          <div className="p-3 rounded-lg bg-emerald-900/20 border border-emerald-800 text-emerald-400 text-sm">
            ✓ Approved by {study.dataset_approved_by} on {study.dataset_approved_date ? new Date(study.dataset_approved_date).toLocaleString() : '—'}
            {study.dataset_approved_comment && <p className="mt-1 text-slate-400">"{study.dataset_approved_comment}"</p>}
          </div>
        ) : (
          <button onClick={() => approveMutation.mutate()} disabled={approveMutation.isPending} className="btn-primary flex items-center gap-2">
            {approveMutation.isPending && <Loader2 size={14} className="animate-spin"/>}<CheckCircle2 size={14}/>Approve Dataset
          </button>
        )}
      </div>

      {/* FS32 Audit Trail */}
      <div className="card p-0 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-800"><h4 className="text-sm font-medium text-slate-300">FS32 — Audit Trail (21 CFR Part 11)</h4></div>
        {!auditData?.length ? <div className="px-5 py-8 text-center text-slate-600 text-sm">No audit entries yet</div> : (
          <div className="divide-y divide-slate-800">
            {auditData.map(entry => (
              <div key={entry.id} className="px-5 py-3.5 flex items-start gap-4">
                <div className="w-1.5 h-1.5 rounded-full bg-brand-500 mt-2 flex-shrink-0"/>
                <div>
                  <div className="flex items-center gap-2"><span className="text-sm font-medium text-white font-mono">{entry.action}</span><span className="text-xs text-slate-500">{entry.resource_type}</span></div>
                  <p className="text-xs text-slate-500 mt-0.5">by {entry.user_id} · {new Date(entry.timestamp).toLocaleString()}</p>
                  {entry.reason && <p className="text-xs text-slate-400 mt-1 italic">Reason: {entry.reason}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
