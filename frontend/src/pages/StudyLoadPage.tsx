/**
 * FS10 — PtsSEND: Study Load Page
 * Filters: Study Name, Status, Job From/To, Latest 10, Show Individual Jobs, Only login connector
 * Actions: New Study (FS10.2.2), Edit Study (FS10.2.3), Select Measurement to Load (FS10.2.4),
 *          Start Load (FS10.2.5), Abort Load (FS10.2.6), Delete (FS10.2.7)
 * Grid: Original Study Name | PtsSEND Study Name | Measurements | Job Created | Status
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
}

// ── Mock data matching the screenshot ─────────────────────────────────────────
const LONG_MEAS = 'Adult Pathology,Body Weights,Cesarean Section,Direct Dosing,Empty Feeder Weights,Fetal Necropsy Observations,Full Feeder Weights,Generalized Measurement,Gross Observations,Mass Tracking,Mating Monitoring,Organ Weights,Parturition,Pup Necropsy observations,Sample Collection,Standard Clinical Observations,Time Bleed Collection,Uterine Exam'
const ALL_JOBS: StudyJob[] = [
  { id:'1', original_study_name:'XI42_Study',  pts_study_name:'XI42_Study',  measurements:'Generalized Measurement',                                job_created:'19-MAR-2021', status:'Done',        source_type:'Pristima API', is_migrated:false, protocol_status:'Open'   },
  { id:'2', original_study_name:'XI42_Study',  pts_study_name:'XI42_Study',  measurements:'Fetal Necropsy Observations',                           job_created:'16-APR-2021', status:'Done',        source_type:'Pristima API', is_migrated:false, protocol_status:'Open'   },
  { id:'3', original_study_name:'XI42_Study',  pts_study_name:'XI42_Study',  measurements:'Generalized Measurement',                                job_created:'12-MAR-2021', status:'Done',        source_type:'Pristima API', is_migrated:false, protocol_status:'Open'   },
  { id:'4', original_study_name:'XI42_Study',  pts_study_name:'XI42_Study',  measurements:LONG_MEAS,                                                job_created:'10-MAR-2021', status:'Done',        source_type:'Pristima API', is_migrated:false, protocol_status:'Closed' },
  { id:'5', original_study_name:'XI42_Study',  pts_study_name:'XI42_Study',  measurements:LONG_MEAS,                                                job_created:'09-SEP-2021', status:'Done',        source_type:'Pristima API', is_migrated:false, protocol_status:'Open'   },
  { id:'6', original_study_name:'XI42_Study',  pts_study_name:'XI42_Study',  measurements:'Adult Pathology,Gross Observations,Standard Clinical Observations', job_created:'09-MAR-2021', status:'Done', source_type:'Pristima API', is_migrated:false, protocol_status:'Open' },
  { id:'7', original_study_name:'XI42_Study',  pts_study_name:'XI42_Study',  measurements:LONG_MEAS,                                                job_created:'03-AUG-2021', status:'Done',        source_type:'Pristima API', is_migrated:false, protocol_status:'Open'   },
  { id:'8', original_study_name:'RFMDemo',     pts_study_name:'RFMDemo',     measurements:'Load Summary Data',                                      job_created:'16-SEP-2021', status:'Done',        source_type:'Pristima API', is_migrated:false, protocol_status:'Open'   },
  { id:'9', original_study_name:'bwstats',     pts_study_name:'bwstats',     measurements:'Mass Tracking',                                          job_created:'15-SEP-2021', status:'Done',        source_type:'Pristima API', is_migrated:false, protocol_status:'Open'   },
  { id:'10',original_study_name:'mg1',         pts_study_name:'mg1',         measurements:'Organ Weights',                                          job_created:'14-SEP-2021', status:'Done',        source_type:'Pristima API', is_migrated:false, protocol_status:'Closed' },
  { id:'11',original_study_name:'DemoStudy1',  pts_study_name:'DemoStudy1',  measurements:'Body Weights,Clinical Observations',                     job_created:'01-JUN-2021', status:'In Progress', source_type:'CSV',          is_migrated:false, protocol_status:'Open'   },
  { id:'12',original_study_name:'DemoStudy2',  pts_study_name:'DemoStudy2',  measurements:'',                                                       job_created:'15-JUN-2021', status:'Queued',      source_type:'SEND Dataset', is_migrated:true,  protocol_status:'Open'   },
]

const PRISTIMA_MEASUREMENTS = [
  'Adult Pathology','Body Weights','Cesarean Section','Clinical Observations','Direct Dosing',
  'Empty Feeder Weights','Fetal Necropsy Observations','Full Feeder Weights','Generalized Measurement',
  'Gross Observations','Indirect Dosing','Laboratory Results','Load Summary Data','Mass Tracking',
  'Mating Monitoring','Organ Weights','Parturition','Pup Necropsy observations','Sample Collection',
  'Standard Clinical Observations','Time Bleed Collection','Uterine Exam',
]
const CSV_DOMAINS    = ['DM','BW','LB','CL','MA','MI','VS','DS','EX','FW','OM','BG','PM','TS','TE','TA','TX']
const STATUS_OPTIONS = ['Done','In Progress','Failed','Aborted','Queued']

const inp  = 'border border-gray-300 rounded px-2 py-1 text-sm text-gray-700 focus:outline-none focus:border-blue-400 bg-white'
const btn  = 'border border-blue-500 text-blue-600 bg-white hover:bg-blue-50 px-3 py-1 text-sm rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap'
const thCl = 'px-3 py-2 text-xs font-semibold text-center bg-blue-700 text-white border-r border-blue-600 whitespace-nowrap'
const tdCl = 'px-3 py-2 text-xs text-center border-b border-gray-200 align-top'

// ── Alert / Confirm Popup ─────────────────────────────────────────────────────
function AlertPopup({ message, onClose, onYes, onNo }: {
  message: string; onClose: ()=>void; onYes?: ()=>void; onNo?: ()=>void
}) {
  const isConfirm = !!onYes
  return (
    <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background:'rgba(0,0,0,0.45)' }}>
      <div className="bg-white rounded border shadow-2xl w-full max-w-sm mx-4" style={{ borderColor:'#c5d0e0' }}>
        <div className="px-5 py-3 border-b flex items-center gap-2" style={{ background:'#fef3cd', borderColor:'#c5d0e0' }}>
          <AlertCircle size={16} className="text-yellow-600 flex-shrink-0"/>
          <span className="font-semibold text-sm text-gray-800">PtsSEND</span>
        </div>
        <div className="px-5 py-4"><p className="text-sm text-gray-700 leading-relaxed">{message}</p></div>
        <div className="px-5 pb-4 flex justify-end gap-2">
          {isConfirm ? (
            <><button onClick={onNo}  className={btn}>No</button>
              <button onClick={onYes} className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-5 py-1 rounded border border-blue-700">Yes</button></>
          ) : (
            <button onClick={onClose} className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-6 py-1 rounded border border-blue-700">OK</button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Audit Reason popup (FS10.2.7) ─────────────────────────────────────────────
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
          <p className="text-xs text-gray-500">An audit reason is required for this operation. Select a reason:</p>
          <div className="space-y-1.5">
            {AUDIT_REASONS.map(r=>(
              <label key={r} className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
                <input type="radio" name="reason" value={r} checked={reason===r} onChange={()=>setReason(r)} className="accent-blue-600"/>{r}
              </label>
            ))}
          </div>
          {reason==='Other (specify below)'&&(
            <textarea value={comment} onChange={e=>setComment(e.target.value)} rows={3} placeholder="Enter reason..."
              className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:border-blue-400 resize-none"/>
          )}
        </div>
        <div className="px-5 pb-4 flex justify-end gap-2">
          <button onClick={onCancel} className={btn}>Cancel</button>
          <button onClick={()=>onConfirm(reason,comment)} className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-1 rounded border border-blue-700">Confirm Delete</button>
        </div>
      </div>
    </div>
  )
}

// ── New Study popup (FS10.2.2) ─────────────────────────────────────────────────
function NewStudyPopup({ onSelect, onCancel }: { onSelect:(name:string)=>void; onCancel:()=>void }) {
  const [sel,setSel] = useState('')
  const AVAILABLE = ['NewStudy_001','NewStudy_002','XI42_Study3','RFMDemo2','TestStudy_A','TestStudy_B','tox2024_001','tox2024_002']
  return (
    <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background:'rgba(0,0,0,0.5)' }}>
      <div className="bg-white rounded border shadow-2xl w-full max-w-sm mx-4" style={{ borderColor:'#c5d0e0' }}>
        <div className="px-5 py-3 border-b flex items-center justify-between" style={{ background:'#e8eef7', borderColor:'#c5d0e0' }}>
          <span className="font-semibold text-sm text-gray-800">New Study (FS10.2.2)</span>
          <button onClick={onCancel}><X size={16} className="text-gray-500"/></button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <p className="text-xs text-gray-500">Select a study from the available list to add:</p>
          <select value={sel} onChange={e=>setSel(e.target.value)}
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm text-gray-700 focus:outline-none focus:border-blue-400">
            <option value="">— Select a study —</option>
            {AVAILABLE.map(s=><option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="px-5 pb-4 flex justify-end gap-2">
          <button onClick={onCancel} className={btn}>Cancel</button>
          <button onClick={()=>{ if(sel) onSelect(sel) }} disabled={!sel}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-1 rounded border border-blue-700 disabled:opacity-40 disabled:cursor-not-allowed">
            Add Study
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Select Measurement popup (FS10.2.4) ───────────────────────────────────────
function SelectMeasurementPopup({ study, onStart, onCancel }: {
  study: StudyJob; onStart:(m:string[])=>void; onCancel:()=>void
}) {
  const isCsv    = ['CSV','SEND Dataset','OpenVMS'].includes(study.source_type)
  const options  = isCsv ? CSV_DOMAINS : PRISTIMA_MEASUREMENTS
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
              className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-1 rounded border border-blue-700 disabled:opacity-40 disabled:cursor-not-allowed">
              Proceed to Load
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function StudyLoadPage() {
  const navigate = useNavigate()
  const [studyName,      setStudyName]      = useState('')
  const [jobFrom,        setJobFrom]        = useState('')
  const [jobTo,          setJobTo]          = useState('')
  const [statusFilter,   setStatusFilter]   = useState<string[]>([])
  const [latest10,       setLatest10]       = useState(false)
  const [showIndividual, setShowIndividual] = useState(true)
  const [loginConnector, setLoginConnector] = useState(false)
  const [rows,      setRows]      = useState<StudyJob[]>(ALL_JOBS)
  const [selected,  setSelected]  = useState<Set<string>>(new Set())
  const [loadingSet,setLoadingSet]= useState<Set<string>>(new Set())
  const [alert,     setAlert]     = useState<{msg:string;yes?:()=>void;no?:()=>void}|null>(null)
  const [showReason,   setShowReason]   = useState(false)
  const [showNewStudy, setShowNewStudy] = useState(false)
  const [showMeasure,  setShowMeasure]  = useState(false)
  const [statusOpen,   setStatusOpen]   = useState(false)
  const statusRef = useRef<HTMLDivElement>(null)

  useEffect(()=>{
    const h=(e:MouseEvent)=>{ if(statusRef.current&&!statusRef.current.contains(e.target as Node)) setStatusOpen(false) }
    document.addEventListener('mousedown',h); return ()=>document.removeEventListener('mousedown',h)
  },[])

  const selectedRows = rows.filter(r=>selected.has(r.id))
  const toggleSelect = (id:string)=>setSelected(p=>{const n=new Set(p);n.has(id)?n.delete(id):n.add(id);return n})
  const toggleAll    = ()=>setSelected(selected.size===rows.length?new Set():new Set(rows.map(r=>r.id)))

  // FS10.2.1 Search
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

  // FS10.2.2 New Study
  const doNewStudy = (name:string) => {
    const j:StudyJob={id:String(Date.now()),original_study_name:name,pts_study_name:name,measurements:'',
      job_created:new Date().toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}).replace(/ /g,'-').toUpperCase(),
      status:'Queued',source_type:'Pristima API',is_migrated:false,protocol_status:'Open'}
    setRows(p=>[j,...p]); setShowNewStudy(false)
    setAlert({msg:`Study "${name}" added. Select measurements and start load.`})
  }

  // FS10.2.3 Edit Study
  const handleEditStudy = () => {
    if (!selected.size) { setAlert({msg:'Please select a study to edit.'}); return }
    if (selected.size>1){ setAlert({msg:'Please select only one study to edit.'}); return }
    const row=selectedRows[0]
    if (row.source_type==='Pristima API') {
      setAlert({ msg:'This is a Pristima API study. Do you want to refresh the protocol and animal level data in PtsSEND? (Yes = refresh from Pristima, No = open without refresh)',
        yes:()=>{ setAlert(null); navigate(`/studies/${row.id}?refresh=true`) },
        no: ()=>{ setAlert(null); navigate(`/studies/${row.id}`) },
      })
    } else { navigate(`/studies/${row.id}`) }
  }

  // FS10.2.4 Select Measurement
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

  // FS10.2.5 Start Load
  const handleStartLoad = () => {
    if (!selected.size) { setAlert({msg:'Please select a study to start loading.'}); return }
    const inProg=selectedRows.filter(r=>r.status==='In Progress')
    if (inProg.length) { setAlert({msg:`"${inProg[0].pts_study_name}" is already In Progress. Loading of the same study with status In Progress is not allowed.`}); return }
    const noMeas=selectedRows.filter(r=>!r.measurements)
    if (noMeas.length) { setAlert({msg:`Please select measurements/files for "${noMeas[0].pts_study_name}" before starting the load.`}); return }
    const ids=new Set([...selected])
    setLoadingSet(ids)
    setRows(p=>p.map(r=>ids.has(r.id)?{...r,status:'In Progress'}:r))
    setSelected(new Set())
    setTimeout(()=>{
      setRows(p=>p.map(r=>ids.has(r.id)?{...r,status:'Done',job_created:new Date().toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}).replace(/ /g,'-').toUpperCase()}:r))
      setLoadingSet(new Set())
    },3000)
  }

  // FS10.2.6 Abort Load
  const handleAbortLoad = () => {
    if (!selected.size) { setAlert({msg:'Please select a study to abort.'}); return }
    const canAbort=selectedRows.filter(r=>r.status==='In Progress')
    if (!canAbort.length) { setAlert({msg:'Abort Load is only enabled for studies with status "In Progress".'}); return }
    const ids=new Set(canAbort.map(r=>r.id))
    setRows(p=>p.map(r=>ids.has(r.id)?{...r,status:'Aborted'}:r))
    setLoadingSet(p=>{const n=new Set(p);ids.forEach(id=>n.delete(id));return n})
    setSelected(new Set())
  }

  // FS10.2.7 Delete
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
    setAlert({msg:`${cnt} study job(s) deleted. Study group, animal, trial design and measurement data removed. Master reference data (tissues, finding names) retained. Audit: "${reason}${comment?' — '+comment:''}"` })
  }

  return (
    <div className="min-h-screen" style={{ background:'#f0f4f8' }}>
      <div className="px-4 py-4">
        <div className="text-center text-sm font-medium text-gray-700 mb-3">PtsSEND - Load Study</div>

        {/* Search + Actions */}
        <div className="bg-white border border-gray-300 rounded px-4 py-3 mb-2" style={{ boxShadow:'0 1px 4px rgba(0,0,0,0.06)' }}>
          <div className="flex flex-wrap items-start gap-2 mb-2">

            {/* FS10.1.1 Study Name */}
            <input value={studyName} onChange={e=>setStudyName(e.target.value)} placeholder="Study Name"
              className={inp} style={{ width:140 }} onKeyDown={e=>e.key==='Enter'&&handleSearch()}/>

            {/* FS10.1.3 Job From */}
            <div className="flex items-center gap-1">
              <input value={jobFrom} onChange={e=>setJobFrom(e.target.value)} type="date" className={inp} style={{ width:130 }}/>
              <Calendar size={14} className="text-gray-400 flex-shrink-0"/>
            </div>

            {/* FS10.1.4 Job To */}
            <div className="flex items-center gap-1">
              <input value={jobTo} onChange={e=>setJobTo(e.target.value)} type="date" className={inp} style={{ width:130 }}/>
              <Calendar size={14} className="text-gray-400 flex-shrink-0"/>
            </div>

            {/* FS10.1.2 Status multi-select */}
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

            {/* FS10.1.5 / FS10.1.7 / FS10.1.8 */}
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

            {/* Search */}
            <button onClick={handleSearch} className={`${btn} flex items-center gap-1`}>
              <Search size={13}/>Search
            </button>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-gray-100">
            <button onClick={()=>setShowNewStudy(true)}     className={btn}>New Study</button>
            <button onClick={handleEditStudy}               className={btn}>Edit Study</button>
            <button onClick={handleDelete}                  className={btn}>Delete</button>
            <button onClick={handleSelectMeasurement}       className={btn}>Select Measurement to Load</button>
            <button onClick={handleStartLoad}               className={btn}>Start Load</button>
            <button onClick={handleAbortLoad}
              disabled={!rows.some(r=>selected.has(r.id)&&r.status==='In Progress')}
              className={btn}>Abort Load</button>
          </div>
        </div>

        {/* Grid */}
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
                  const isLoading_=loadingSet.has(row.id)
                  const statusColor=row.status==='Done'?'#15803d':row.status==='In Progress'?'#1d4ed8':row.status==='Failed'?'#b91c1c':row.status==='Aborted'?'#92400e':row.status==='Queued'?'#7c3aed':'#374151'
                  return (
                    <tr key={row.id} onClick={()=>toggleSelect(row.id)}
                      style={{ background:isSel?'#dbeafe':i%2===0?'white':'#f9fafb', cursor:'pointer' }}
                      className="hover:bg-blue-50 transition-colors">
                      <td className={tdCl} onClick={e=>{e.stopPropagation();toggleSelect(row.id)}}>
                        <input type="checkbox" checked={isSel} onChange={()=>toggleSelect(row.id)} className="accent-blue-600" onClick={e=>e.stopPropagation()}/>
                      </td>
                      <td className={tdCl}>
                        <button className="text-blue-600 hover:underline text-xs" onClick={e=>{e.stopPropagation();navigate(`/studies/${row.id}`)}}>
                          {row.original_study_name}
                        </button>
                      </td>
                      <td className={tdCl}>
                        <button className="text-blue-600 hover:underline text-xs" onClick={e=>{e.stopPropagation();navigate(`/studies/${row.id}`)}}>
                          {row.pts_study_name}
                        </button>
                      </td>
                      <td className={tdCl} style={{ textAlign:'center', maxWidth:380 }}>
                        <span className="text-gray-700 text-xs leading-relaxed">{row.measurements||'—'}</span>
                      </td>
                      <td className={tdCl}><span className="text-gray-700 text-xs">{row.job_created}</span></td>
                      <td className={tdCl}>
                        <span style={{ color:statusColor, fontSize:11, fontWeight:500 }} className="flex items-center justify-center gap-1">
                          {isLoading_&&<Loader2 size={10} className="animate-spin"/>}{row.status}
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

      {/* Popups */}
      {alert       && <AlertPopup message={alert.msg} onClose={()=>setAlert(null)} onYes={alert.yes} onNo={alert.no}/>}
      {showReason  && <ReasonPopup onConfirm={doDelete} onCancel={()=>setShowReason(false)}/>}
      {showNewStudy&& <NewStudyPopup onSelect={doNewStudy} onCancel={()=>setShowNewStudy(false)}/>}
      {showMeasure && selectedRows[0] && <SelectMeasurementPopup study={selectedRows[0]} onStart={doMeasureLoad} onCancel={()=>setShowMeasure(false)}/>}
    </div>
  )
}
