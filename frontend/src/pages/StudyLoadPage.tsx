/**
 * FS10 — Study Load Page + FS12 — New Study Popup
 * FS12 New Study popup: Study Name dropdown (searchable), Merge Study checkbox,
 * PtsSEND Study Name dropdown (enabled when Merge Study checked), Group Expand checkbox
 */
import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Calendar, ChevronDown, CheckSquare, Square, X, AlertCircle, Loader2, Search } from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────────────────
interface StudyJob {
  id: string
  original_study_name: string
  pts_study_name: string
  measurements: string
  job_created: string
  status: 'Done' | 'In Progress' | 'Failed' | 'Aborted' | 'Queued' | ''
  source_type: 'Pristima API' | 'CSV' | 'SEND Dataset' | 'OpenVMS'
  is_migrated: boolean
  protocol_status: string
  locked?: boolean
}

const LONG_MEAS = 'Adult Pathology,Body Weights,Cesarean Section,Direct Dosing,Empty Feeder Weights,Fetal Necropsy Observations,Full Feeder Weights,Generalized Measurement,Gross Observations,Mass Tracking,Mating Monitoring,Organ Weights,Parturition,Pup Necropsy observations,Sample Collection,Standard Clinical Observations,Time Bleed Collection,Uterine Exam'

const ALL_JOBS: StudyJob[] = [
  { id:'1',  original_study_name:'XI42_Study',  pts_study_name:'XI42_Study',  measurements:'Generalized Measurement',          job_created:'19-MAR-2021', status:'Done',        source_type:'Pristima API', is_migrated:false, protocol_status:'Open'   },
  { id:'2',  original_study_name:'XI42_Study',  pts_study_name:'XI42_Study',  measurements:'Fetal Necropsy Observations',       job_created:'16-APR-2021', status:'Done',        source_type:'Pristima API', is_migrated:false, protocol_status:'Open'   },
  { id:'3',  original_study_name:'XI42_Study',  pts_study_name:'XI42_Study',  measurements:'Generalized Measurement',          job_created:'12-MAR-2021', status:'Done',        source_type:'Pristima API', is_migrated:false, protocol_status:'Open'   },
  { id:'4',  original_study_name:'XI42_Study',  pts_study_name:'XI42_Study',  measurements:LONG_MEAS,                          job_created:'10-MAR-2021', status:'Done',        source_type:'Pristima API', is_migrated:false, protocol_status:'Closed' },
  { id:'5',  original_study_name:'XI42_Study',  pts_study_name:'XI42_Study',  measurements:LONG_MEAS,                          job_created:'09-SEP-2021', status:'Done',        source_type:'Pristima API', is_migrated:false, protocol_status:'Open'   },
  { id:'6',  original_study_name:'XI42_Study',  pts_study_name:'XI42_Study',  measurements:'Adult Pathology,Gross Observations,Standard Clinical Observations', job_created:'09-MAR-2021', status:'Done', source_type:'Pristima API', is_migrated:false, protocol_status:'Open' },
  { id:'7',  original_study_name:'XI42_Study',  pts_study_name:'XI42_Study',  measurements:LONG_MEAS,                          job_created:'03-AUG-2021', status:'Done',        source_type:'Pristima API', is_migrated:false, protocol_status:'Open'   },
  { id:'8',  original_study_name:'RFMDemo',     pts_study_name:'RFMDemo',     measurements:'Load Summary Data',                job_created:'16-SEP-2021', status:'Done',        source_type:'Pristima API', is_migrated:false, protocol_status:'Open'   },
  { id:'9',  original_study_name:'bwstats',     pts_study_name:'bwstats',     measurements:'Mass Tracking',                    job_created:'15-SEP-2021', status:'Done',        source_type:'Pristima API', is_migrated:false, protocol_status:'Open'   },
  { id:'10', original_study_name:'mg1',         pts_study_name:'mg1',         measurements:'Organ Weights',                    job_created:'14-SEP-2021', status:'Done',        source_type:'Pristima API', is_migrated:false, protocol_status:'Closed' },
  { id:'11', original_study_name:'DemoStudy1',  pts_study_name:'DemoStudy1',  measurements:'Body Weights,Clinical Observations', job_created:'01-JUN-2021', status:'In Progress', source_type:'CSV',        is_migrated:false, protocol_status:'Open'   },
  { id:'12', original_study_name:'DemoStudy2',  pts_study_name:'DemoStudy2',  measurements:'',                                 job_created:'15-JUN-2021', status:'Queued',      source_type:'SEND Dataset', is_migrated:true,  protocol_status:'Open'   },
]

// Studies available from source that are NOT yet in PtsSEND (FS12.1.1)
const SOURCE_STUDIES = [
  '1040','1041','1042','10850','10851','10852','NewTox2024','DART_Study_01',
  'GenTox_001','PK_Study_Alpha','Safety_2024_001','Safety_2024_002',
  'CardioStudy_01','NephroStudy_01','RFMDemo2','bwstats2',
]
// Already-locked studies (FS12.2.1 exception)
const LOCKED_STUDIES = new Set(['1041','10851'])

// Existing PtsSEND studies for merge (FS12.1.3)
const EXISTING_PTS_STUDIES = [
  ...new Set(ALL_JOBS.map(j => j.pts_study_name))
]

const PRISTIMA_MEASUREMENTS = [
  'Adult Pathology','Body Weights','Cesarean Section','Clinical Observations','Direct Dosing',
  'Empty Feeder Weights','Fetal Necropsy Observations','Full Feeder Weights',
  'Generalized Measurement','Gross Observations','Indirect Dosing','Laboratory Results',
  'Load Summary Data','Mass Tracking','Mating Monitoring','Organ Weights','Parturition',
  'Pup Necropsy observations','Sample Collection','Standard Clinical Observations',
  'Time Bleed Collection','Uterine Exam',
]
const CSV_DOMAINS    = ['DM','BW','LB','CL','MA','MI','VS','DS','EX','FW','OM','BG','PM','TS','TE','TA','TX']
const STATUS_OPTIONS = ['Done','In Progress','Failed','Aborted','Queued']

const inp  = 'border border-gray-300 rounded px-2 py-1 text-sm text-gray-700 focus:outline-none focus:border-blue-400 bg-white'
const btn  = 'border border-blue-500 text-blue-600 bg-white hover:bg-blue-50 px-3 py-1 text-sm rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap'
const thCl = 'px-3 py-2 text-xs font-semibold text-center bg-blue-700 text-white border-r border-blue-600 whitespace-nowrap'
const tdCl = 'px-3 py-2 text-xs text-center border-b border-gray-200 align-top'

// ── Alert / Confirm Popup ─────────────────────────────────────────────────────
function AlertPopup({ message, onClose, onYes, onNo }: {
  message:string; onClose:()=>void; onYes?:()=>void; onNo?:()=>void
}) {
  return (
    <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background:'rgba(0,0,0,0.45)' }}>
      <div className="bg-white rounded border shadow-2xl w-full max-w-sm mx-4" style={{ borderColor:'#c5d0e0' }}>
        <div className="px-5 py-3 border-b flex items-center gap-2" style={{ background:'#fef3cd', borderColor:'#c5d0e0' }}>
          <AlertCircle size={16} className="text-yellow-600 flex-shrink-0"/>
          <span className="font-semibold text-sm text-gray-800">PtsSEND</span>
        </div>
        <div className="px-5 py-4"><p className="text-sm text-gray-700 leading-relaxed">{message}</p></div>
        <div className="px-5 pb-4 flex justify-end gap-2">
          {onYes ? (
            <><button onClick={onNo}  className={btn}>No</button>
              <button onClick={onYes} className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-5 py-1 rounded">Yes</button></>
          ) : (
            <button onClick={onClose} className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-6 py-1 rounded">OK</button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Audit Reason Popup ────────────────────────────────────────────────────────
const AUDIT_REASONS = ['Data no longer required','Study created in error','Duplicate study entry','Protocol cancelled','Data quality issue','Other (specify below)']
function ReasonPopup({ onConfirm, onCancel }: { onConfirm:(r:string,c:string)=>void; onCancel:()=>void }) {
  const [reason,setReason]   = useState(AUDIT_REASONS[0])
  const [comment,setComment] = useState('')
  return (
    <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background:'rgba(0,0,0,0.5)' }}>
      <div className="bg-white rounded border shadow-2xl w-full max-w-md mx-4" style={{ borderColor:'#c5d0e0' }}>
        <div className="px-5 py-3 border-b flex items-center justify-between" style={{ background:'#e8eef7', borderColor:'#c5d0e0' }}>
          <span className="font-semibold text-sm text-gray-800">Reason Selection — Delete Study (FS10.2.7)</span>
          <button onClick={onCancel}><X size={16} className="text-gray-500"/></button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <p className="text-xs text-gray-500">An audit reason is required. Select a reason:</p>
          <div className="space-y-1.5">
            {AUDIT_REASONS.map(r=>(
              <label key={r} className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
                <input type="radio" name="reason" value={r} checked={reason===r} onChange={()=>setReason(r)} className="accent-blue-600"/>{r}
              </label>
            ))}
          </div>
          {reason==='Other (specify below)'&&(
            <textarea value={comment} onChange={e=>setComment(e.target.value)} rows={3}
              placeholder="Enter reason..." className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:border-blue-400 resize-none"/>
          )}
        </div>
        <div className="px-5 pb-4 flex justify-end gap-2">
          <button onClick={onCancel} className={btn}>Cancel</button>
          <button onClick={()=>onConfirm(reason,comment)} className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-1 rounded">Confirm Delete</button>
        </div>
      </div>
    </div>
  )
}

// ── FS12 — New Study Popup ────────────────────────────────────────────────────
function NewStudyPopup({
  onOK, onCancel, lockedStudies
}: {
  onOK: (studyName: string, mergeWith: string | null, groupExpand: boolean) => void
  onCancel: () => void
  lockedStudies: Set<string>
}) {
  const [search,       setSearch]       = useState('')
  const [selectedStudy,setSelectedStudy]= useState('1040')  // default like screenshot
  const [dropOpen,     setDropOpen]     = useState(false)
  const [mergeStudy,   setMergeStudy]   = useState(false)   // FS12.1.2
  const [groupExpand,  setGroupExpand]  = useState(false)   // FS12.1.2 Group Expand
  const [mergeTarget,  setMergeTarget]  = useState(EXISTING_PTS_STUDIES[0]) // FS12.1.3
  const [error,        setError]        = useState('')
  const dropRef = useRef<HTMLDivElement>(null)

  // FS12.1.1 — filter source studies by search text
  const filtered = SOURCE_STUDIES.filter(s =>
    s.toLowerCase().includes(search.toLowerCase())
  )

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setDropOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  // FS12.2.1 — OK handler
  const handleOK = () => {
    if (!selectedStudy) { setError('Please select a study.'); return }
    // FS12.2.1 exception: study already in use (locked)
    if (lockedStudies.has(selectedStudy)) {
      setError(`Study is already in use.`)
      return
    }
    onOK(selectedStudy, mergeStudy ? mergeTarget : null, groupExpand)
  }

  const fieldLabelStyle: React.CSSProperties = {
    display:'flex', alignItems:'center',
    background:'#e8eef7', border:'1px solid #c5d0e0',
    borderRadius:'4px 0 0 4px', padding:'7px 14px',
    fontSize:'13px', fontWeight:500, color:'#374151',
    minWidth:160, flexShrink:0,
  }
  const fieldInputStyle: React.CSSProperties = {
    flex:1, border:'1px solid #c5d0e0', borderLeft:'none',
    borderRadius:'0 4px 4px 0', padding:'7px 10px',
    fontSize:'13px', color:'#111827', background:'white', outline:'none',
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background:'rgba(0,0,0,0.45)' }}>
      <div className="bg-white rounded shadow-2xl border" style={{ width:480, borderColor:'#c5d0e0' }}>

        {/* Header */}
        <div className="px-6 pt-6 pb-2">
          <p style={{ fontSize:'15px', fontWeight:600, color:'#2563eb' }}>New Study</p>
        </div>

        <div className="px-6 py-4 space-y-5">

          {/* Error */}
          {error && (
            <div style={{ background:'#fef2f2', border:'1px solid #fca5a5', borderRadius:'6px', padding:'8px 12px', fontSize:'13px', color:'#b91c1c', display:'flex', alignItems:'center', gap:'6px' }}>
              <AlertCircle size={14}/>{error}
            </div>
          )}

          {/* FS12.1.1 — Study Name searchable dropdown */}
          <div>
            <div className="flex" ref={dropRef} style={{ position:'relative' }}>
              <div style={fieldLabelStyle}>Study Name</div>
              <div style={{ ...fieldInputStyle, display:'flex', alignItems:'center', justifyContent:'space-between', cursor:'pointer', padding:'0' }}
                onClick={() => setDropOpen(v=>!v)}>
                <input
                  value={dropOpen ? search : selectedStudy}
                  onChange={e => { setSearch(e.target.value); setDropOpen(true); setError('') }}
                  onFocus={() => { setDropOpen(true); setSearch('') }}
                  placeholder="Type to search or select..."
                  style={{ flex:1, border:'none', outline:'none', padding:'7px 10px', fontSize:'13px', color:'#111827', background:'transparent' }}
                />
                <ChevronDown size={14} className="text-gray-500 mr-2 flex-shrink-0"
                  style={{ transform: dropOpen ? 'rotate(180deg)' : 'none', transition:'transform 0.15s' }}/>
              </div>
              {dropOpen && (
                <div style={{ position:'absolute', top:'100%', left:160, right:0, background:'white', border:'1px solid #c5d0e0', borderRadius:'0 0 4px 4px', zIndex:100, maxHeight:200, overflowY:'auto', boxShadow:'0 4px 12px rgba(0,0,0,0.12)' }}>
                  {filtered.length === 0 ? (
                    <div style={{ padding:'10px 14px', fontSize:'13px', color:'#9ca3af' }}>No studies found</div>
                  ) : filtered.map(s => (
                    <div key={s}
                      onClick={() => { setSelectedStudy(s); setSearch(''); setDropOpen(false); setError('') }}
                      style={{
                        padding:'8px 14px', fontSize:'13px', cursor:'pointer',
                        background: selectedStudy===s ? '#dbeafe' : 'white',
                        color: selectedStudy===s ? '#1d4ed8' : lockedStudies.has(s) ? '#9ca3af' : '#111827',
                        display:'flex', alignItems:'center', justifyContent:'space-between',
                      }}
                      onMouseEnter={e=>(e.currentTarget as HTMLElement).style.background='#eff6ff'}
                      onMouseLeave={e=>(e.currentTarget as HTMLElement).style.background=selectedStudy===s?'#dbeafe':'white'}
                    >
                      <span>{s}</span>
                      {lockedStudies.has(s) && (
                        <span style={{ fontSize:'10px', color:'#ef4444', background:'#fee2e2', padding:'1px 6px', borderRadius:'4px' }}>In Use</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* FS12.1.2 — Merge Study checkbox */}
            <div style={{ marginTop:'8px', marginLeft:168 }}>
              <label style={{ display:'flex', alignItems:'center', gap:'6px', cursor:'pointer', fontSize:'13px', color:'#2563eb' }}>
                <input
                  type="checkbox"
                  checked={mergeStudy}
                  onChange={e => { setMergeStudy(e.target.checked); if(!e.target.checked) setGroupExpand(false) }}
                  style={{ width:13, height:13, accentColor:'#2563eb' }}
                />
                Merge Study
              </label>
            </div>
          </div>

          {/* FS12.1.3 — PtsSEND Study Name (shown when Merge Study checked) */}
          <div style={{ opacity: mergeStudy ? 1 : 0.4, transition:'opacity 0.2s' }}>
            <div className="flex" style={{ position:'relative' }}>
              <div style={fieldLabelStyle}>PtsSEND Study Name</div>
              <select
                value={mergeTarget}
                onChange={e => setMergeTarget(e.target.value)}
                disabled={!mergeStudy}
                style={{ ...fieldInputStyle, cursor: mergeStudy ? 'pointer' : 'not-allowed', appearance:'none', paddingRight:28 }}>
                {EXISTING_PTS_STUDIES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <ChevronDown size={14} className="text-gray-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"/>
            </div>

            {/* FS12.1.2 — Group Expand checkbox (under PtsSEND Study Name) */}
            <div style={{ marginTop:'8px', marginLeft:168 }}>
              <label style={{ display:'flex', alignItems:'center', gap:'6px', cursor: mergeStudy ? 'pointer' : 'not-allowed', fontSize:'13px', color: mergeStudy ? '#2563eb' : '#9ca3af' }}>
                <input
                  type="checkbox"
                  checked={groupExpand}
                  onChange={e => setGroupExpand(e.target.checked)}
                  disabled={!mergeStudy}
                  style={{ width:13, height:13, accentColor:'#2563eb' }}
                />
                Group Expand
              </label>
            </div>
          </div>
        </div>

        {/* Divider */}
        <div style={{ height:1, background:'#e5e7eb', margin:'0 0 4px 0' }}/>

        {/* FS12.2.1 OK / FS12.2.2 Cancel */}
        <div className="px-6 py-4 flex justify-end gap-3">
          <button
            onClick={handleOK}
            style={{ border:'1px solid #2563eb', borderRadius:'4px', padding:'6px 22px', fontSize:'13px', color:'#2563eb', background:'white', cursor:'pointer', fontWeight:500, transition:'all 0.15s' }}
            onMouseEnter={e=>{(e.currentTarget as HTMLButtonElement).style.background='#2563eb';(e.currentTarget as HTMLButtonElement).style.color='white'}}
            onMouseLeave={e=>{(e.currentTarget as HTMLButtonElement).style.background='white';(e.currentTarget as HTMLButtonElement).style.color='#2563eb'}}
          >OK</button>
          <button
            onClick={onCancel}
            style={{ border:'1px solid #6b7280', borderRadius:'4px', padding:'6px 18px', fontSize:'13px', color:'#6b7280', background:'white', cursor:'pointer', fontWeight:500, transition:'all 0.15s' }}
            onMouseEnter={e=>{(e.currentTarget as HTMLButtonElement).style.background='#f3f4f6'}}
            onMouseLeave={e=>{(e.currentTarget as HTMLButtonElement).style.background='white'}}
          >Cancel</button>
        </div>
      </div>
    </div>
  )
}

// ── Select Measurement popup (FS10.2.4) ───────────────────────────────────────
function SelectMeasurementPopup({ study, onStart, onCancel }: {
  study: StudyJob; onStart:(m:string[])=>void; onCancel:()=>void
}) {
  const isCsv   = ['CSV','SEND Dataset','OpenVMS'].includes(study.source_type)
  const options = isCsv ? CSV_DOMAINS : PRISTIMA_MEASUREMENTS
  const [chosen,setChosen] = useState<string[]>([])
  const toggle    = (m:string) => setChosen(p=>p.includes(m)?p.filter(x=>x!==m):[...p,m])
  const toggleAll = () => setChosen(p=>p.length===options.length?[]:options)
  return (
    <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background:'rgba(0,0,0,0.5)' }}>
      <div className="bg-white rounded border shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] flex flex-col" style={{ borderColor:'#c5d0e0' }}>
        <div className="px-5 py-3 border-b flex items-center justify-between flex-shrink-0" style={{ background:'#e8eef7', borderColor:'#c5d0e0' }}>
          <div>
            <p className="font-semibold text-sm text-gray-800">{isCsv?'Select Files to Load':'Select Measurements to Load'} (FS10.2.4)</p>
            <p className="text-xs text-gray-500 mt-0.5">Study: <strong>{study.pts_study_name}</strong> · {study.source_type}</p>
          </div>
          <button onClick={onCancel}><X size={16} className="text-gray-500"/></button>
        </div>
        <div className="px-5 py-2 border-b flex-shrink-0" style={{ borderColor:'#e5e7eb' }}>
          <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
            <input type="checkbox" checked={chosen.length===options.length} onChange={toggleAll} className="accent-blue-600"/>Select All
          </label>
          {isCsv&&<p className="text-xs text-blue-600 mt-1">Note: For CSV data source, DT, NT and DA domain types are supported.</p>}
        </div>
        <div className="px-5 py-3 overflow-y-auto flex-1">
          <div className="grid grid-cols-2 gap-1">
            {options.map(m=>(
              <label key={m} className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer py-1 hover:bg-blue-50 rounded px-1">
                <input type="checkbox" checked={chosen.includes(m)} onChange={()=>toggle(m)} className="accent-blue-600 flex-shrink-0"/>{m}
              </label>
            ))}
          </div>
        </div>
        <div className="px-5 py-3 border-t flex-shrink-0 flex items-center justify-between" style={{ borderColor:'#e5e7eb' }}>
          <span className="text-xs text-gray-500">{chosen.length} selected</span>
          <div className="flex gap-2">
            <button onClick={onCancel} className={btn}>Cancel</button>
            <button onClick={()=>{ if(chosen.length) onStart(chosen) }} disabled={!chosen.length}
              className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-1 rounded disabled:opacity-40 disabled:cursor-not-allowed">
              Proceed to Load
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main StudyLoadPage ─────────────────────────────────────────────────────────
export default function StudyLoadPage() {
  const navigate = useNavigate()
  const [studyName,      setStudyName]      = useState('')
  const [jobFrom,        setJobFrom]        = useState('')
  const [jobTo,          setJobTo]          = useState('')
  const [statusFilter,   setStatusFilter]   = useState<string[]>([])
  const [latest10,       setLatest10]       = useState(false)
  const [showIndividual, setShowIndividual] = useState(true)
  const [loginConnector, setLoginConnector] = useState(false)
  const [rows,           setRows]           = useState<StudyJob[]>(ALL_JOBS)
  const [selected,       setSelected]       = useState<Set<string>>(new Set())
  const [loadingSet,     setLoadingSet]     = useState<Set<string>>(new Set())
  const [lockedStudies,  setLockedStudies]  = useState<Set<string>>(LOCKED_STUDIES)
  const [alert,          setAlert]          = useState<{msg:string;yes?:()=>void;no?:()=>void}|null>(null)
  const [showReason,     setShowReason]     = useState(false)
  const [showNewStudy,   setShowNewStudy]   = useState(false)
  const [showMeasure,    setShowMeasure]    = useState(false)
  const [statusOpen,     setStatusOpen]     = useState(false)
  const statusRef = useRef<HTMLDivElement>(null)

  useEffect(()=>{
    const h=(e:MouseEvent)=>{ if(statusRef.current&&!statusRef.current.contains(e.target as Node)) setStatusOpen(false) }
    document.addEventListener('mousedown',h); return ()=>document.removeEventListener('mousedown',h)
  },[])

  const selectedRows = rows.filter(r=>selected.has(r.id))
  const toggleSelect = (id:string)=>setSelected(p=>{const n=new Set(p);n.has(id)?n.delete(id):n.add(id);return n})
  const toggleAll    = ()=>setSelected(selected.size===rows.length?new Set():new Set(rows.map(r=>r.id)))

  const handleSearch = () => {
    let r = ALL_JOBS
    if (studyName.trim()) { const q=studyName.toLowerCase(); r=r.filter(x=>x.pts_study_name.toLowerCase().includes(q)||x.original_study_name.toLowerCase().includes(q)) }
    if (statusFilter.length) r=r.filter(x=>statusFilter.includes(x.status))
    if (jobFrom) r=r.filter(x=>new Date(x.job_created)>=new Date(jobFrom))
    if (jobTo)   r=r.filter(x=>new Date(x.job_created)<=new Date(jobTo))
    if (loginConnector) r=r.filter(x=>x.source_type==='Pristima API')
    if (!showIndividual) { const seen=new Set<string>(); r=r.filter(x=>{ if(seen.has(x.pts_study_name))return false; seen.add(x.pts_study_name); return true }) }
    if (latest10) r=r.slice(0,10)
    setRows(r); setSelected(new Set())
  }

  // FS12 — New Study OK handler
  const handleNewStudyOK = (studyName: string, mergeWith: string | null, groupExpand: boolean) => {
    // Lock the study so no other user can pick it (FS12.2.1)
    setLockedStudies(prev => new Set([...prev, studyName]))
    const newJob: StudyJob = {
      id: String(Date.now()),
      original_study_name: studyName,
      pts_study_name: mergeWith ? `${mergeWith} (merged: ${studyName})` : studyName,
      measurements: '',
      job_created: new Date().toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}).replace(/ /g,'-').toUpperCase(),
      status: 'Queued',
      source_type: 'Pristima API',
      is_migrated: false,
      protocol_status: 'Open',
      locked: true,
    }
    setRows(p => [newJob, ...p])
    setShowNewStudy(false)
    setAlert({
      msg: mergeWith
        ? `Study "${studyName}" added and merged with "${mergeWith}"${groupExpand ? ' (Group Expand enabled)' : ''}. Study is now locked. Select measurements and start load.`
        : `Study "${studyName}" added and locked. Select measurements and start load.`
    })
  }

  const handleEditStudy = () => {
    if (!selected.size) { setAlert({msg:'Please select a study to edit.'}); return }
    if (selected.size>1){ setAlert({msg:'Please select only one study to edit.'}); return }
    const row=selectedRows[0]
    if (row.source_type==='Pristima API') {
      setAlert({ msg:'This is a Pristima API study. Do you want to refresh the protocol and animal level data in PtsSEND? (Yes = refresh, No = open without refresh)',
        yes:()=>{ setAlert(null); navigate(`/studies/${row.id}?refresh=true`) },
        no: ()=>{ setAlert(null); navigate(`/studies/${row.id}`) },
      })
    } else { navigate(`/studies/${row.id}`) }
  }

  const handleSelectMeasurement = () => {
    if (!selected.size) { setAlert({msg:'Please select a study first to choose measurements/files to load.'}); return }
    if (selected.size>1){ setAlert({msg:'Please select only one study to select measurements.'}); return }
    setShowMeasure(true)
  }
  const doMeasureLoad = (measurements:string[]) => {
    setShowMeasure(false)
    const id=[...selected][0]
    setRows(p=>p.map(r=>r.id===id?{...r,measurements:measurements.join(',')}:r))
    setAlert({msg:`Measurements selected for "${selectedRows[0].pts_study_name}". Click "Start Load" to begin.`})
  }

  const handleStartLoad = () => {
    if (!selected.size) { setAlert({msg:'Please select a study to start loading.'}); return }
    const inProg=selectedRows.filter(r=>r.status==='In Progress')
    if (inProg.length) { setAlert({msg:`"${inProg[0].pts_study_name}" is already In Progress. Loading the same study with status In Progress is not allowed.`}); return }
    const noMeas=selectedRows.filter(r=>!r.measurements)
    if (noMeas.length) { setAlert({msg:`Please select measurements/files for "${noMeas[0].pts_study_name}" before starting the load.`}); return }
    const ids=new Set([...selected])
    setLoadingSet(ids); setRows(p=>p.map(r=>ids.has(r.id)?{...r,status:'In Progress'}:r)); setSelected(new Set())
    setTimeout(()=>{
      setRows(p=>p.map(r=>ids.has(r.id)?{...r,status:'Done',job_created:new Date().toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}).replace(/ /g,'-').toUpperCase()}:r))
      setLoadingSet(new Set())
    },3000)
  }

  const handleAbortLoad = () => {
    if (!selected.size) { setAlert({msg:'Please select a study to abort.'}); return }
    const canAbort=selectedRows.filter(r=>r.status==='In Progress')
    if (!canAbort.length) { setAlert({msg:'Abort Load is only enabled for studies with status "In Progress".'}); return }
    const ids=new Set(canAbort.map(r=>r.id))
    setRows(p=>p.map(r=>ids.has(r.id)?{...r,status:'Aborted'}:r))
    setLoadingSet(p=>{const n=new Set(p);ids.forEach(id=>n.delete(id));return n})
    setSelected(new Set())
  }

  const handleDelete = () => {
    if (!selected.size) { setAlert({msg:'Please select a study to delete.'}); return }
    const needsAudit=selectedRows.some(r=>['Done','In Progress'].includes(r.status))
    if (needsAudit) { setShowReason(true); return }
    doDelete('No reason required','')
  }
  const doDelete = (reason:string,comment:string) => {
    setShowReason(false)
    const cnt=selected.size
    setRows(p=>p.filter(r=>!selected.has(r.id)))
    setSelected(new Set())
    setAlert({msg:`${cnt} study job(s) deleted. Study group, animal, trial design and measurement data removed. Master reference data retained. Audit: "${reason}${comment?' — '+comment:''}"` })
  }

  return (
    <div className="min-h-screen" style={{ background:'#f0f4f8' }}>
      <div className="px-4 py-4">
        <div className="text-center text-sm font-medium text-gray-700 mb-3">PtsSEND - Load Study</div>

        <div className="bg-white border border-gray-300 rounded px-4 py-3 mb-2" style={{ boxShadow:'0 1px 4px rgba(0,0,0,0.06)' }}>
          <div className="flex flex-wrap items-start gap-2 mb-2">
            <input value={studyName} onChange={e=>setStudyName(e.target.value)} placeholder="Study Name"
              className={inp} style={{ width:140 }} onKeyDown={e=>e.key==='Enter'&&handleSearch()}/>
            <div className="flex items-center gap-1">
              <input value={jobFrom} onChange={e=>setJobFrom(e.target.value)} type="date" className={inp} style={{ width:130 }}/>
              <Calendar size={14} className="text-gray-400 flex-shrink-0"/>
            </div>
            <div className="flex items-center gap-1">
              <input value={jobTo} onChange={e=>setJobTo(e.target.value)} type="date" className={inp} style={{ width:130 }}/>
              <Calendar size={14} className="text-gray-400 flex-shrink-0"/>
            </div>
            <div className="relative" ref={statusRef}>
              <button onClick={()=>setStatusOpen(v=>!v)} className={`${inp} flex items-center gap-1 justify-between`} style={{ minWidth:130 }}>
                <span className="truncate text-sm" style={{ maxWidth:90 }}>{statusFilter.length===0?'Status':statusFilter.join(', ')}</span>
                <ChevronDown size={12} className={`flex-shrink-0 transition-transform ${statusOpen?'rotate-180':''}`}/>
              </button>
              {statusOpen&&(
                <div className="absolute top-full left-0 mt-1 bg-white border border-gray-300 rounded shadow-lg z-30 min-w-[160px]">
                  {STATUS_OPTIONS.map(s=>(
                    <label key={s} className="flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-blue-50 cursor-pointer">
                      <input type="checkbox" checked={statusFilter.includes(s)} onChange={()=>setStatusFilter(p=>p.includes(s)?p.filter(x=>x!==s):[...p,s])} className="accent-blue-600"/>{s}
                    </label>
                  ))}
                </div>
              )}
            </div>
            <div className="flex flex-col gap-1 pt-0.5">
              <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer whitespace-nowrap">
                <input type="checkbox" checked={latest10} onChange={e=>setLatest10(e.target.checked)} className="accent-blue-600"/>Latest 10 Job Created
              </label>
              <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer whitespace-nowrap">
                <input type="checkbox" checked={showIndividual} onChange={e=>setShowIndividual(e.target.checked)} className="accent-blue-600"/>Show Individual Jobs
              </label>
              <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer whitespace-nowrap">
                <input type="checkbox" checked={loginConnector} onChange={e=>setLoginConnector(e.target.checked)} className="accent-blue-600"/>Only studies for the login connector
              </label>
            </div>
            <button onClick={handleSearch} className={`${btn} flex items-center gap-1`}><Search size={13}/>Search</button>
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-gray-100">
            <button onClick={()=>setShowNewStudy(true)}    className={btn}>New Study</button>
            <button onClick={handleEditStudy}              className={btn}>Edit Study</button>
            <button onClick={handleDelete}                 className={btn}>Delete</button>
            <button onClick={handleSelectMeasurement}      className={btn}>Select Measurement to Load</button>
            <button onClick={handleStartLoad}              className={btn}>Start Load</button>
            <button onClick={handleAbortLoad}
              disabled={!rows.some(r=>selected.has(r.id)&&r.status==='In Progress')}
              className={btn}>Abort Load</button>
          </div>
        </div>

        <div className="border border-gray-300 rounded overflow-hidden" style={{ boxShadow:'0 1px 4px rgba(0,0,0,0.06)' }}>
          <div className="overflow-x-auto overflow-y-auto" style={{ maxHeight:'calc(100vh - 270px)' }}>
            <table className="w-full bg-white" style={{ borderCollapse:'collapse', minWidth:800 }}>
              <thead style={{ position:'sticky', top:0, zIndex:10 }}>
                <tr>
                  <th className={thCl} style={{ width:36 }}>
                    <button onClick={toggleAll} className="text-white">
                      {selected.size>0&&selected.size===rows.length?<CheckSquare size={14}/>:<Square size={14}/>}
                    </button>
                  </th>
                  <th className={thCl}>Original Study Name</th>
                  <th className={thCl}>PtsSEND Study Name</th>
                  <th className={thCl} style={{ minWidth:300 }}>Measurements</th>
                  <th className={thCl}>Job Created</th>
                  <th className={thCl}>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.length===0 ? (
                  <tr><td colSpan={6} className="text-center text-sm text-gray-400 py-10">No studies match the search criteria.</td></tr>
                ) : rows.map((row,i)=>{
                  const isSel=selected.has(row.id)
                  const isLd_=loadingSet.has(row.id)
                  const sc=row.status==='Done'?'#15803d':row.status==='In Progress'?'#1d4ed8':row.status==='Failed'?'#b91c1c':row.status==='Aborted'?'#92400e':row.status==='Queued'?'#7c3aed':'#374151'
                  return (
                    <tr key={row.id} onClick={()=>toggleSelect(row.id)}
                      style={{ background:isSel?'#dbeafe':i%2===0?'white':'#f9fafb', cursor:'pointer' }}
                      className="hover:bg-blue-50 transition-colors">
                      <td className={tdCl} onClick={e=>{e.stopPropagation();toggleSelect(row.id)}}>
                        <input type="checkbox" checked={isSel} onChange={()=>toggleSelect(row.id)} className="accent-blue-600" onClick={e=>e.stopPropagation()}/>
                      </td>
                      <td className={tdCl}>
                        <button className="text-blue-600 hover:underline text-xs" onClick={e=>{e.stopPropagation();navigate(`/studies/${row.id}`)}}>{row.original_study_name}</button>
                        {row.locked&&<span style={{ marginLeft:4, fontSize:9, color:'#ef4444', background:'#fee2e2', padding:'1px 4px', borderRadius:'3px' }}>LOCKED</span>}
                      </td>
                      <td className={tdCl}>
                        <button className="text-blue-600 hover:underline text-xs" onClick={e=>{e.stopPropagation();navigate(`/studies/${row.id}`)}}>{row.pts_study_name}</button>
                      </td>
                      <td className={tdCl} style={{ textAlign:'center', maxWidth:380 }}>
                        <span className="text-gray-700 text-xs leading-relaxed">{row.measurements||'—'}</span>
                      </td>
                      <td className={tdCl}><span className="text-gray-700 text-xs">{row.job_created}</span></td>
                      <td className={tdCl}>
                        <span style={{ color:sc, fontSize:11, fontWeight:500 }} className="flex items-center justify-center gap-1">
                          {isLd_&&<Loader2 size={10} className="animate-spin"/>}{row.status}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {rows.length>0&&(
            <div className="px-3 py-1.5 text-xs text-gray-500 border-t border-gray-200 bg-gray-50 flex items-center gap-4">
              <span>{rows.length} study job{rows.length!==1?'s':''} displayed (max 20)</span>
              {selected.size>0&&<span className="text-blue-600">{selected.size} selected</span>}
              {loadingSet.size>0&&<span className="text-blue-700 font-medium flex items-center gap-1"><Loader2 size={11} className="animate-spin"/>{loadingSet.size} loading…</span>}
            </div>
          )}
        </div>
      </div>

      {alert       && <AlertPopup message={alert.msg} onClose={()=>setAlert(null)} onYes={alert.yes} onNo={alert.no}/>}
      {showReason  && <ReasonPopup onConfirm={doDelete} onCancel={()=>setShowReason(false)}/>}
      {showNewStudy&& <NewStudyPopup onOK={handleNewStudyOK} onCancel={()=>setShowNewStudy(false)} lockedStudies={lockedStudies}/>}
      {showMeasure && selectedRows[0] && <SelectMeasurementPopup study={selectedRows[0]} onStart={doMeasureLoad} onCancel={()=>setShowMeasure(false)}/>}
    </div>
  )
}
