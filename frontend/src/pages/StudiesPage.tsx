/**
 * FS8 — Savante: List of Studies
 * Matches the Savante studies grid with all search filters, action buttons, and grid columns.
 */
import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Search, Calendar, ChevronDown, CheckSquare, Square, AlertCircle, X } from 'lucide-react'
import { api } from '../api/client'
import type { Study } from '../types'

// ── Types ─────────────────────────────────────────────────────────────────────
interface StudyJob {
  id: string
  original_study_name: string
  savante_study_name: string
  measurements: string       // comma-joined list
  job_created: string        // DD-MMM-YYYY
  status: string             // Done | In Progress | Failed | Aborted
  download_links: string[]   // FS8.1.9
  source_type: string        // Pristima API | CSV | SEND Dataset | OpenVMS
  is_migrated: boolean
  protocol_status: string    // Open | Closed | Archived
  dataset_approved: boolean
  dataset_approved_by?: string
  dataset_approved_comment?: string
}

// ── Static options ─────────────────────────────────────────────────────────────
const STATUS_OPTIONS  = ['Done', 'In Progress', 'Failed', 'Aborted', 'Queued']
const TYPE_OPTIONS    = ['Pristima API', 'CSV Data Source', 'SEND Dataset', 'OpenVMS']
const CONNECTOR_OPTIONS = ['Pristima API', 'CSV Data Source', 'SEND Dataset', 'OpenVMS']

// ── Shared UI styles (Savante-like) ────────────────────────────────────────────
const inputCls  = 'border border-gray-300 rounded px-2 py-1 text-sm text-gray-700 focus:outline-none focus:border-blue-400 bg-white'
const btnOutline = 'border border-blue-500 text-blue-600 bg-white hover:bg-blue-50 px-3 py-1 text-sm rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed'
const thCls     = 'px-3 py-2 text-xs font-semibold text-center bg-blue-700 text-white border-r border-blue-600 whitespace-nowrap'
const tdCls     = 'px-3 py-2 text-xs text-center border-b border-gray-200 align-top'

// ── Mock data (matches the screenshot) ────────────────────────────────────────
const MOCK_JOBS: StudyJob[] = [
  { id:'1', original_study_name:'RFMDemo',       savante_study_name:'RFMDemo',        measurements:'Load Summary Data',                                                                                                                                                                                                                          job_created:'16-SEP-2021', status:'Done',        download_links:[], source_type:'Pristima API', is_migrated:false, protocol_status:'Open',   dataset_approved:false },
  { id:'2', original_study_name:'Merge',         savante_study_name:'SavMerge',       measurements:'Gross Observations',                                                                                                                                                                                                                        job_created:'16-SEP-2021', status:'Done',        download_links:[], source_type:'Pristima API', is_migrated:false, protocol_status:'Open',   dataset_approved:false },
  { id:'3', original_study_name:'sav_test3_study1', savante_study_name:'sav_test3_study1', measurements:'Body Weights,Generalized Measurement,Sample Collection',                                                                                                                                                                                 job_created:'15-SEP-2021', status:'',            download_links:[], source_type:'Pristima API', is_migrated:false, protocol_status:'Open',   dataset_approved:false },
  { id:'4', original_study_name:'bwstats',       savante_study_name:'bwstats',        measurements:'Mass Tracking',                                                                                                                                                                                                                             job_created:'15-SEP-2021', status:'Done',        download_links:[], source_type:'Pristima API', is_migrated:false, protocol_status:'Open',   dataset_approved:false },
  { id:'5', original_study_name:'mg1',           savante_study_name:'mg1',            measurements:'Organ Weights',                                                                                                                                                                                                                             job_created:'14-SEP-2021', status:'Done',        download_links:[], source_type:'Pristima API', is_migrated:false, protocol_status:'Closed', dataset_approved:false },
  { id:'6', original_study_name:'mg',            savante_study_name:'mg',             measurements:'Organ Weights',                                                                                                                                                                                                                             job_created:'14-SEP-2021', status:'Done',        download_links:[], source_type:'Pristima API', is_migrated:false, protocol_status:'Archived',dataset_approved:true,  dataset_approved_by:'admin' },
  { id:'7', original_study_name:'va-indose3',    savante_study_name:'va-indose3',     measurements:'Indirect Dosing',                                                                                                                                                                                                                          job_created:'12-SEP-2021', status:'Done',        download_links:[], source_type:'Pristima API', is_migrated:false, protocol_status:'Open',   dataset_approved:false },
  { id:'8', original_study_name:'va-indose1',    savante_study_name:'va-indose1',     measurements:'Indirect Dosing',                                                                                                                                                                                                                          job_created:'11-SEP-2021', status:'Done',        download_links:[], source_type:'Pristima API', is_migrated:false, protocol_status:'Open',   dataset_approved:false },
  { id:'9', original_study_name:'XI42_Study',    savante_study_name:'XI42_Study',     measurements:'Adult Pathology,Body Weights,Cesarean Section,Direct Dosing,Empty Feeder Weights,Fetal Necropsy Observations,Full Feeder Weights,Generalized Measurement,Gross Observations,Mass Tracking,Mating Monitoring,Organ Weights,Parturition,Pup Necropsy observations,Sample Collection,Standard Clinical Observations,Time Bleed Collection,Uterine Exam', job_created:'09-SEP-2021', status:'Done', download_links:[], source_type:'Pristima API', is_migrated:false, protocol_status:'Closed', dataset_approved:false },
  { id:'10',original_study_name:'XI42_Study2',   savante_study_name:'XI42_Study2',    measurements:'Body Weights,Empty Feeder Weights,Full Feeder Weights,Standard Clinical Observations',                                                                                                                                                       job_created:'09-SEP-2021', status:'Done',        download_links:[], source_type:'Pristima API', is_migrated:false, protocol_status:'Open',   dataset_approved:false },
]

// ── Reason Selection popup (FS8.2.5) ──────────────────────────────────────────
const AUDIT_REASONS = [
  'Data no longer required',
  'Study created in error',
  'Duplicate study entry',
  'Protocol cancelled',
  'Data quality issue',
  'Other (specify below)',
]

function ReasonPopup({ onConfirm, onCancel }: { onConfirm: (r: string, c: string) => void; onCancel: () => void }) {
  const [reason, setReason] = useState(AUDIT_REASONS[0])
  const [comment, setComment] = useState('')
  return (
    <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background:'rgba(0,0,0,0.5)' }}>
      <div className="bg-white rounded border shadow-2xl w-full max-w-md mx-4" style={{ borderColor:'#c5d0e0' }}>
        <div className="px-5 py-3 border-b flex items-center justify-between" style={{ background:'#e8eef7', borderColor:'#c5d0e0' }}>
          <span className="font-semibold text-sm text-gray-800">Reason Selection — Delete Study (FS8.2.5)</span>
          <button onClick={onCancel}><X size={16} className="text-gray-500"/></button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <p className="text-xs text-gray-500">An audit reason is required because this study's status requires it. Please select a reason:</p>
          <div className="space-y-1.5">
            {AUDIT_REASONS.map(r => (
              <label key={r} className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
                <input type="radio" name="reason" value={r} checked={reason===r} onChange={() => setReason(r)} className="accent-blue-600"/>
                {r}
              </label>
            ))}
          </div>
          {reason === 'Other (specify below)' && (
            <textarea value={comment} onChange={e => setComment(e.target.value)} rows={3} placeholder="Enter reason..." className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:border-blue-400 resize-none"/>
          )}
        </div>
        <div className="px-5 pb-4 flex justify-end gap-2">
          <button onClick={onCancel} className={btnOutline}>Cancel</button>
          <button onClick={() => onConfirm(reason, comment)} className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-1 rounded border border-blue-700">Confirm Delete</button>
        </div>
      </div>
    </div>
  )
}

// ── Alert popup (generic messages) ────────────────────────────────────────────
function AlertPopup({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background:'rgba(0,0,0,0.45)' }}>
      <div className="bg-white rounded border shadow-2xl w-full max-w-sm mx-4" style={{ borderColor:'#c5d0e0' }}>
        <div className="px-5 py-3 border-b flex items-center gap-2" style={{ background:'#fef3cd', borderColor:'#c5d0e0' }}>
          <AlertCircle size={16} className="text-yellow-600"/>
          <span className="font-semibold text-sm text-gray-800">Savante</span>
        </div>
        <div className="px-5 py-4"><p className="text-sm text-gray-700">{message}</p></div>
        <div className="px-5 pb-4 flex justify-end">
          <button onClick={onClose} className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-6 py-1 rounded border border-blue-700">OK</button>
        </div>
      </div>
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function StudiesPage() {
  const navigate  = useNavigate()

  // FS8.1 Search fields
  const [studyName,     setStudyName]     = useState('')
  const [jobFrom,       setJobFrom]       = useState('')
  const [jobTo,         setJobTo]         = useState('')
  const [statusFilter,  setStatusFilter]  = useState<string[]>([])
  const [typeFilter,    setTypeFilter]    = useState<string[]>([])
  const [connector,     setConnector]     = useState('Pristima API')
  const [latest10,      setLatest10]      = useState(true)   // FS8.1.5
  const [showIndividual,setShowIndividual]= useState(false)  // FS8.1.8
  const [outputJobsOnly,setOutputJobsOnly]= useState(false)  // FS8.2.8

  // Grid state
  const [rows,       setRows]       = useState<StudyJob[]>(MOCK_JOBS)
  const [searched,   setSearched]   = useState(true)
  const [selected,   setSelected]   = useState<Set<string>>(new Set())

  // Popup state
  const [alertMsg,      setAlertMsg]      = useState<string|null>(null)
  const [showReason,    setShowReason]    = useState(false)
  const [approvePopup,  setApprovePopup]  = useState<string|null>(null)  // studyId
  const [approveComment,setApproveComment]= useState('')

  // Status multi-select dropdown
  const [statusOpen, setStatusOpen] = useState(false)
  const [typeOpen,   setTypeOpen]   = useState(false)
  const statusRef = useRef<HTMLDivElement>(null)
  const typeRef   = useRef<HTMLDivElement>(null)

  // ── FS8.2.1 Search ──────────────────────────────────────────────────────────
  const handleSearch = () => {
    let filtered = MOCK_JOBS

    // FS8.1.1 — Study name wildcard
    if (studyName.trim()) {
      const q = studyName.toLowerCase()
      filtered = filtered.filter(r =>
        r.savante_study_name.toLowerCase().includes(q) ||
        r.original_study_name.toLowerCase().includes(q)
      )
    }
    // FS8.1.2 — Status
    if (statusFilter.length) {
      filtered = filtered.filter(r => statusFilter.includes(r.status))
    }
    // FS8.1.3/8.1.4 — Job date range
    if (jobFrom) filtered = filtered.filter(r => new Date(r.job_created) >= new Date(jobFrom))
    if (jobTo)   filtered = filtered.filter(r => new Date(r.job_created) <= new Date(jobTo))
    // FS8.1.5 — Latest 10
    if (latest10) filtered = filtered.slice(0, 10)
    // FS8.2.8 — Output jobs only (stub)
    if (outputJobsOnly) filtered = filtered.filter(r => r.download_links.length > 0)

    setRows(filtered)
    setSelected(new Set())
    setSearched(true)
  }

  // ── Row selection FS8.1.7 ────────────────────────────────────────────────────
  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }
  const toggleAll = () => {
    if (selected.size === rows.length) setSelected(new Set())
    else setSelected(new Set(rows.map(r => r.id)))
  }
  const selectedRows = rows.filter(r => selected.has(r.id))

  // ── FS8.2.2 Edit Study ───────────────────────────────────────────────────────
  const handleEditStudy = () => {
    if (selected.size === 0) { setAlertMsg('Please select a study to edit.'); return }
    if (selected.size > 1)   { setAlertMsg('Please select only one study to edit. (FS8.2.2)'); return }
    const id = [...selected][0]
    navigate(`/studies/${id}`)
  }

  // ── FS8.2.5 Delete ───────────────────────────────────────────────────────────
  const handleDelete = () => {
    if (selected.size === 0) { setAlertMsg('Please select at least one study to delete.'); return }
    const needsAudit = selectedRows.some(r => ['Done','In Progress'].includes(r.status))
    if (needsAudit) { setShowReason(true); return }
    doDelete('No reason required', '')
  }
  const doDelete = (reason: string, comment: string) => {
    setShowReason(false)
    setRows(prev => prev.filter(r => !selected.has(r.id)))
    setSelected(new Set())
    setAlertMsg(`${selected.size} study job(s) deleted. Audit reason: "${reason}${comment ? ' — ' + comment : ''}"`)
  }

  // ── FS8.2.3 Additional Measurement Data ──────────────────────────────────────
  const handleAdditionalMeasData = () => {
    if (selected.size === 0) { setAlertMsg('Please select a study first.'); return }
    if (selected.size > 1)   { setAlertMsg('Please select only one study for Additional Measurement Data.'); return }
    navigate(`/studies/${[...selected][0]}?tab=ingest`)
  }

  // ── FS8.2.4 Abort Load ────────────────────────────────────────────────────────
  const handleAbortLoad = () => {
    if (selected.size === 0) { setAlertMsg('Please select at least one loading job to abort.'); return }
    const inProgress = selectedRows.filter(r => r.status === 'In Progress')
    if (!inProgress.length) { setAlertMsg('No "In Progress" jobs selected. Only jobs currently loading can be aborted.'); return }
    setRows(prev => prev.map(r => selected.has(r.id) && r.status === 'In Progress' ? {...r, status:'Aborted'} : r))
    setAlertMsg(`${inProgress.length} loading job(s) aborted.`)
    setSelected(new Set())
  }

  // ── FS8.2.6 Edit/View Data ────────────────────────────────────────────────────
  const handleEditViewData = () => {
    if (selected.size === 0) { setAlertMsg('Please select a study to view/edit data.'); return }
    if (selected.size > 1)   { setAlertMsg('Please select only one study for Edit/View Data.'); return }
    navigate(`/studies/${[...selected][0]}?tab=transform`)
  }

  // ── FS8.2.7 Approve Dataset ───────────────────────────────────────────────────
  const handleApproveDataset = () => {
    if (selected.size === 0) { setAlertMsg('Please select a study with an output job to approve.'); return }
    if (selected.size > 1)   { setAlertMsg('Please select only one study to approve.'); return }
    const row = selectedRows[0]
    if (!['Closed','Archived'].includes(row.protocol_status)) {
      setAlertMsg(`The dataset cannot be approved because the Protocol Status is "${row.protocol_status}". Only studies with Protocol Status "Closed" or "Archived" can be approved. (FS8.2.7)`)
      return
    }
    setApprovePopup(row.id)
    setApproveComment('')
  }
  const doApprove = () => {
    if (!approvePopup) return
    setRows(prev => prev.map(r => r.id === approvePopup ? { ...r, dataset_approved: true, dataset_approved_by: 'admin', dataset_approved_comment: approveComment } : r))
    setApprovePopup(null)
    setAlertMsg('Dataset approved successfully. Approval recorded in SEND_TS table.')
    setSelected(new Set())
  }

  // ── Multi-select dropdown component ────────────────────────────────────────────
  const MultiSelect = ({ options, value, onChange, label, open, setOpen, ref: _ref }: any) => (
    <div className="relative" ref={_ref}>
      <button
        onClick={() => setOpen((v: boolean) => !v)}
        className={`${inputCls} flex items-center gap-1 min-w-[120px] justify-between`}
        style={{ minWidth: '130px' }}
      >
        <span className="truncate" style={{ maxWidth: 100 }}>
          {value.length === 0 ? label : value.join(', ')}
        </span>
        <ChevronDown size={12} className={`flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}/>
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 bg-white border border-gray-300 rounded shadow-lg z-30 min-w-[160px]">
          {options.map((opt: string) => (
            <label key={opt} className="flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-blue-50 cursor-pointer">
              <input type="checkbox" checked={value.includes(opt)} onChange={() => onChange(value.includes(opt) ? value.filter((v: string) => v!==opt) : [...value, opt])} className="accent-blue-600"/>
              {opt}
            </label>
          ))}
        </div>
      )}
    </div>
  )

  // ── Status badge ───────────────────────────────────────────────────────────────
  const StatusCell = ({ status }: { status: string }) => {
    const color = status==='Done' ? '#15803d' : status==='In Progress' ? '#1d4ed8' : status==='Failed' ? '#b91c1c' : status==='Aborted' ? '#92400e' : '#374151'
    return <span style={{ color, fontSize: 11, fontWeight: 500 }}>{status}</span>
  }

  return (
    <div className="min-h-screen" style={{ background:'#f0f4f8' }}>
      <div className="px-4 py-4">

        {/* ── Page title ──────────────────────────────────────────────────────── */}
        <div className="text-center text-sm font-medium text-gray-700 mb-3">
          Savante - List of studies
        </div>

        {/* ── Search bar (FS8.1) ──────────────────────────────────────────────── */}
        <div className="bg-white border border-gray-300 rounded px-4 py-3 mb-2" style={{ boxShadow:'0 1px 4px rgba(0,0,0,0.06)' }}>
          <div className="flex flex-wrap items-center gap-2 mb-2">

            {/* FS8.1.1 Study Name */}
            <input
              value={studyName} onChange={e => setStudyName(e.target.value)}
              placeholder="Study Name"
              className={inputCls}
              style={{ width: 140 }}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
            />

            {/* FS8.1.3 Job From */}
            <div className="flex items-center gap-1">
              <input value={jobFrom} onChange={e => setJobFrom(e.target.value)} type="date" placeholder="Job From" className={inputCls} style={{ width: 130 }}/>
              <Calendar size={14} className="text-gray-400"/>
            </div>

            {/* FS8.1.4 Job To */}
            <div className="flex items-center gap-1">
              <input value={jobTo} onChange={e => setJobTo(e.target.value)} type="date" placeholder="Job To" className={inputCls} style={{ width: 130 }}/>
              <Calendar size={14} className="text-gray-400"/>
            </div>

            {/* FS8.1.2 Status multi-select */}
            <MultiSelect options={STATUS_OPTIONS} value={statusFilter} onChange={setStatusFilter} label="Status" open={statusOpen} setOpen={setStatusOpen} ref={statusRef}/>

            {/* Connector type selector */}
            <select value={connector} onChange={e => setConnector(e.target.value)} className={inputCls}>
              {CONNECTOR_OPTIONS.map(c => <option key={c}>{c}</option>)}
            </select>
            <ChevronDown size={14} className="text-gray-400 -ml-2"/>

            {/* FS8.1.5 Latest 10 / FS8.1.8 Show Individual */}
            <div className="flex flex-col gap-1 ml-1">
              <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                <input type="checkbox" checked={latest10} onChange={e => setLatest10(e.target.checked)} className="accent-blue-600"/>
                Latest 10 Job Created
              </label>
              <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                <input type="checkbox" checked={showIndividual} onChange={e => setShowIndividual(e.target.checked)} className="accent-blue-600"/>
                Show Individual Jobs
              </label>
            </div>

            {/* FS8.2.1 Search */}
            <button onClick={handleSearch} className="bg-white border border-blue-500 text-blue-600 hover:bg-blue-50 px-5 py-1 text-sm rounded transition-colors flex items-center gap-1">
              <Search size={13}/>Search
            </button>

            {/* FS8.2.8 Output jobs only */}
            <button
              onClick={() => { setOutputJobsOnly(v => !v); handleSearch() }}
              className={`px-3 py-1 text-sm rounded border transition-colors ${outputJobsOnly ? 'bg-blue-600 text-white border-blue-700' : 'bg-white text-blue-600 border-blue-500 hover:bg-blue-50'}`}
            >
              Output jobs only
            </button>
          </div>

          {/* ── Action buttons row (FS8.2) ────────────────────────────────────── */}
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-gray-100">
            <button onClick={handleEditStudy}          className={btnOutline}>Edit Study</button>
            <button onClick={handleEditViewData}       className={btnOutline}>Edit/View Data</button>
            <button onClick={handleDelete}             className={btnOutline}>Delete</button>
            <button onClick={handleAdditionalMeasData} className={btnOutline}>Additional Measurement Data</button>
            <button onClick={handleAbortLoad}          className={btnOutline}>Abort Load</button>
            <button onClick={handleApproveDataset}     className={btnOutline}>Approve Dataset</button>
          </div>
        </div>

        {/* ── Results grid (FS8.1.7–8.1.9) ──────────────────────────────────── */}
        <div className="border border-gray-300 rounded overflow-hidden" style={{ boxShadow:'0 1px 4px rgba(0,0,0,0.06)' }}>
          <div className="overflow-x-auto overflow-y-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>
            <table className="w-full bg-white" style={{ borderCollapse:'collapse', minWidth: 900 }}>
              <thead style={{ position:'sticky', top:0, zIndex:10 }}>
                <tr>
                  {/* FS8.1.7 checkbox column */}
                  <th className={thCls} style={{ width:36 }}>
                    <button onClick={toggleAll} className="text-white">
                      {selected.size > 0 && selected.size === rows.length
                        ? <CheckSquare size={14}/>
                        : <Square size={14}/>}
                    </button>
                  </th>
                  <th className={thCls}>Original Study Name</th>
                  <th className={thCls}>Savante Study Name</th>
                  <th className={thCls} style={{ minWidth:280 }}>Measurements</th>
                  <th className={thCls}>Job Created</th>
                  <th className={thCls}>Status</th>
                  <th className={thCls}>Download</th>  {/* FS8.1.9 */}
                  <th className={thCls}>Type</th>
                </tr>
              </thead>
              <tbody>
                {!searched ? (
                  <tr><td colSpan={8} className="text-center text-sm text-gray-400 py-10">Enter search criteria and click Search.</td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={8} className="text-center text-sm text-gray-400 py-10">No studies match the search criteria.</td></tr>
                ) : (
                  rows.map((row, i) => {
                    const isSelected = selected.has(row.id)
                    return (
                      <tr
                        key={row.id}
                        onClick={() => toggleSelect(row.id)}
                        style={{
                          background: isSelected ? '#dbeafe' : i % 2 === 0 ? 'white' : '#f9fafb',
                          cursor: 'pointer',
                        }}
                        className="hover:bg-blue-50 transition-colors"
                      >
                        {/* Checkbox */}
                        <td className={tdCls} onClick={e => { e.stopPropagation(); toggleSelect(row.id) }}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelect(row.id)}
                            className="accent-blue-600"
                            onClick={e => e.stopPropagation()}
                          />
                        </td>

                        {/* FS8.1.1 — Original Study Name (link) */}
                        <td className={tdCls}>
                          <button
                            className="text-blue-600 hover:underline text-xs"
                            onClick={e => { e.stopPropagation(); navigate(`/studies/${row.id}`) }}
                          >
                            {row.original_study_name}
                          </button>
                        </td>

                        {/* Savante Study Name (link) */}
                        <td className={tdCls}>
                          <button
                            className="text-blue-600 hover:underline text-xs"
                            onClick={e => { e.stopPropagation(); navigate(`/studies/${row.id}`) }}
                          >
                            {row.savante_study_name}
                          </button>
                          {row.dataset_approved && (
                            <div className="text-green-600 text-xs mt-0.5">✓ Approved</div>
                          )}
                        </td>

                        {/* Measurements */}
                        <td className={tdCls} style={{ textAlign:'center' }}>
                          <span className="text-gray-700 text-xs">{row.measurements}</span>
                        </td>

                        {/* Job Created */}
                        <td className={tdCls}>
                          <span className="text-gray-700 text-xs">{row.job_created}</span>
                        </td>

                        {/* Status */}
                        <td className={tdCls}>
                          <StatusCell status={row.status}/>
                        </td>

                        {/* FS8.1.9 Download links */}
                        <td className={tdCls}>
                          {row.download_links.length > 0 ? (
                            <div className="flex flex-col gap-0.5">
                              {row.download_links.map((link, li) => (
                                <a key={li} href={link} className="text-blue-600 hover:underline text-xs" onClick={e => e.stopPropagation()} target="_blank" rel="noreferrer">
                                  {li === 0 ? 'Define.xml' : li === 1 ? 'Validation Report' : 'Output Log'}
                                </a>
                              ))}
                            </div>
                          ) : <span className="text-gray-300">—</span>}
                        </td>

                        {/* Source Type */}
                        <td className={tdCls}>
                          <span className="text-gray-600 text-xs">{row.source_type}</span>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Row count */}
          {searched && rows.length > 0 && (
            <div className="px-3 py-1.5 text-xs text-gray-500 border-t border-gray-200 bg-gray-50">
              {rows.length} study job{rows.length !== 1 ? 's' : ''} found
              {selected.size > 0 && ` · ${selected.size} selected`}
            </div>
          )}
        </div>
      </div>

      {/* ── Popups ────────────────────────────────────────────────────────────── */}

      {/* FS8.2.5 — Reason selection */}
      {showReason && (
        <ReasonPopup onConfirm={doDelete} onCancel={() => setShowReason(false)}/>
      )}

      {/* Generic alert popup */}
      {alertMsg && (
        <AlertPopup message={alertMsg} onClose={() => setAlertMsg(null)}/>
      )}

      {/* FS8.2.7 — Approve Dataset popup */}
      {approvePopup && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background:'rgba(0,0,0,0.5)' }}>
          <div className="bg-white rounded border shadow-2xl w-full max-w-md mx-4" style={{ borderColor:'#c5d0e0' }}>
            <div className="px-5 py-3 border-b" style={{ background:'#e8eef7', borderColor:'#c5d0e0' }}>
              <span className="font-semibold text-sm text-gray-800">Approve Dataset (FS8.2.7)</span>
            </div>
            <div className="px-5 py-4 space-y-3">
              <p className="text-xs text-gray-600">
                This will set the approval flag, approval user, and approval comment in the SEND_TS table,
                and copy the dataset to the final folder (ApprovedDatasetDir).
              </p>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Approval Comment (optional)</label>
                <textarea
                  value={approveComment}
                  onChange={e => setApproveComment(e.target.value)}
                  rows={3}
                  placeholder="Enter approval comment..."
                  className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-blue-400 resize-none"
                />
              </div>
              <p className="text-xs text-blue-700 bg-blue-50 p-2 rounded">
                Approved by: <strong>admin</strong> on {new Date().toLocaleDateString()}
              </p>
            </div>
            <div className="px-5 pb-4 flex justify-end gap-2">
              <button onClick={() => setApprovePopup(null)} className={btnOutline}>Cancel</button>
              <button onClick={doApprove} className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-1 rounded border border-blue-700">Approve</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
