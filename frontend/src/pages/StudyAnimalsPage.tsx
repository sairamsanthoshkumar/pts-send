/**
 * FS16 — Study Definition: Animal Tab
 * Left panel: Animal Details with Males/Females tabs + animal number list
 * Right panel: DEMOGRAPHICS - DM fields for selected animal
 * Actions: Export to CSV | Import from CSV | Save | <Back | Next> | Cancel | Exit
 */
import { useState, useRef, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Calendar, Upload, Download, X, AlertCircle, CheckCircle2 } from 'lucide-react'
import StudyDefinitionLayout from '../components/study/StudyDefinitionLayout'
import { api } from '../api/client'

// ── Types ──────────────────────────────────────────────────────────────────────
interface Animal {
  id: string
  animal_number: string         // FS16.1.1/16.1.2
  sex: 'M' | 'F'
  study_group: string           // FS16.2.1  read-only
  strain: string                // FS16.2.2  editable
  strain_substrain_details: string  // FS16.2.2a editable
  date_of_birth: string         // FS16.2.3  editable
  rfstdtc: string               // FS16.2.4  Subject Ref Start Date/Time
  rfendtc: string               // FS16.2.5  Subject Ref End Date/Time
  age_range: string             // FS16.2.6  editable
  age: string                   // FS16.2.6a calculated
  age_units: string             // FS16.2.7  editable
  planned_arm_code: string      // FS16.2.8  read-only
  set_code: string              // FS16.2.9  editable
  date_of_death: string         // FS16.2.10 editable
  death_status_category: string // FS16.2.11 editable dropdown
  death_status: string          // FS16.2.12 editable
  death_type: string            // FS16.2.13 editable
  planned_path_code: string     // FS16.2.24 editable (DART studies)
  origin_of_animal: string      // FS16.2.25 editable
}

// ── Mock data matching the screenshot ─────────────────────────────────────────
const MOCK_MALES: Animal[] = [
  { id:'1', animal_number:'AN00001', sex:'M', study_group:'1', strain:'Dino_Unused', strain_substrain_details:'', date_of_birth:'', rfstdtc:'06-FEB-2025', rfendtc:'15-APR-2025', age_range:'', age:'', age_units:'', planned_arm_code:'1', set_code:'1', date_of_death:'15-APR-2025 6:08:01 am', death_status_category:'Unscheduled', death_status:'Accidentals', death_type:'Unscheduled', planned_path_code:'', origin_of_animal:'India' },
  { id:'2', animal_number:'AN00002', sex:'M', study_group:'1', strain:'Dino_Unused', strain_substrain_details:'', date_of_birth:'', rfstdtc:'06-FEB-2025', rfendtc:'15-APR-2025', age_range:'', age:'', age_units:'', planned_arm_code:'1', set_code:'1', date_of_death:'', death_status_category:'Scheduled', death_status:'', death_type:'', planned_path_code:'', origin_of_animal:'India' },
  { id:'3', animal_number:'AN00003', sex:'M', study_group:'2', strain:'Dino_Unused', strain_substrain_details:'', date_of_birth:'', rfstdtc:'06-FEB-2025', rfendtc:'15-APR-2025', age_range:'', age:'', age_units:'', planned_arm_code:'2', set_code:'1', date_of_death:'', death_status_category:'', death_status:'', death_type:'', planned_path_code:'', origin_of_animal:'India' },
]
const MOCK_FEMALES: Animal[] = [
  { id:'4', animal_number:'AN00004', sex:'F', study_group:'1', strain:'Dino_Unused', strain_substrain_details:'', date_of_birth:'', rfstdtc:'06-FEB-2025', rfendtc:'15-APR-2025', age_range:'', age:'', age_units:'', planned_arm_code:'1', set_code:'1', date_of_death:'', death_status_category:'', death_status:'', death_type:'', planned_path_code:'', origin_of_animal:'India' },
  { id:'5', animal_number:'AN00005', sex:'F', study_group:'2', strain:'Dino_Unused', strain_substrain_details:'', date_of_birth:'', rfstdtc:'06-FEB-2025', rfendtc:'15-APR-2025', age_range:'', age:'', age_units:'', planned_arm_code:'2', set_code:'1', date_of_death:'', death_status_category:'', death_status:'', death_type:'', planned_path_code:'', origin_of_animal:'India' },
]

const DEATH_STATUS_CATEGORIES = ['','Scheduled','Unscheduled','Moribund','Found Dead']
const AGE_UNITS_OPTIONS        = ['','Days','Weeks','Months','Years']

const AUDIT_REASONS = [
  'Correction of data entry error','Protocol amendment',
  'Data quality improvement','Regulatory requirement',
  'User request','Other (specify below)',
]

// ── Shared styles ──────────────────────────────────────────────────────────────
const labelStyle: React.CSSProperties = {
  background:'#e8eef7', border:'1px solid #c5d0e0',
  padding:'7px 12px', fontSize:12, fontWeight:500,
  color:'#374151', width:230, flexShrink:0, display:'flex', alignItems:'center',
}
const inputStyle: React.CSSProperties = {
  flex:1, border:'1px solid #c5d0e0', borderLeft:'none',
  padding:'6px 8px', fontSize:12, color:'#111827',
  background:'white', outline:'none',
}
const readStyle: React.CSSProperties = {
  ...inputStyle, background:'#f3f4f6', color:'#6b7280', cursor:'default',
}
const rowStyle: React.CSSProperties = {
  display:'flex', alignItems:'stretch', borderBottom:'1px solid #c5d0e0',
}
const actionBtn = (primary = false): React.CSSProperties => ({
  border: primary ? '1px solid #2563eb' : '1px solid #6b7280',
  borderRadius:4, padding:'5px 14px', fontSize:12,
  color: primary ? '#2563eb' : '#6b7280',
  background:'white', cursor:'pointer', fontWeight:500,
  transition:'all 0.15s', display:'flex', alignItems:'center', gap:4,
  whiteSpace:'nowrap' as any,
})

// ── Audit Reason Popup ────────────────────────────────────────────────────────
function AuditReasonPopup({ onConfirm, onCancel }: {
  onConfirm:(r:string,c:string)=>void; onCancel:()=>void
}) {
  const [reason, setReason]   = useState(AUDIT_REASONS[0])
  const [comment, setComment] = useState('')
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:100 }}>
      <div style={{ background:'white', border:'1px solid #c5d0e0', borderRadius:6, width:440, boxShadow:'0 8px 32px rgba(0,0,0,0.18)' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 20px', background:'#e8eef7', borderBottom:'1px solid #c5d0e0', borderRadius:'6px 6px 0 0' }}>
          <span style={{ fontWeight:600, fontSize:14, color:'#1e3a6e' }}>Reason for Edit — Audit Trail</span>
          <button onClick={onCancel} style={{ background:'none', border:'none', cursor:'pointer' }}><X size={16} style={{ color:'#6b7280' }}/></button>
        </div>
        <div style={{ padding:'16px 20px' }}>
          <p style={{ fontSize:12, color:'#6b7280', marginBottom:12 }}>Study status is "Data Loaded". An audit reason is required.</p>
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {AUDIT_REASONS.map(r=>(
              <label key={r} style={{ display:'flex', alignItems:'center', gap:8, fontSize:13, color:'#374151', cursor:'pointer' }}>
                <input type="radio" name="audit" value={r} checked={reason===r} onChange={()=>setReason(r)} style={{ accentColor:'#2563eb' }}/>{r}
              </label>
            ))}
          </div>
          {reason==='Other (specify below)'&&(
            <textarea value={comment} onChange={e=>setComment(e.target.value)} rows={3} placeholder="Enter reason..."
              style={{ width:'100%', marginTop:10, border:'1px solid #c5d0e0', borderRadius:4, padding:'6px 10px', fontSize:13, resize:'none', outline:'none', boxSizing:'border-box' as any }}/>
          )}
        </div>
        <div style={{ padding:'12px 20px', borderTop:'1px solid #e5e7eb', display:'flex', justifyContent:'flex-end', gap:8 }}>
          <button onClick={onCancel} style={actionBtn()}
            onMouseEnter={e=>(e.currentTarget as HTMLButtonElement).style.background='#f3f4f6'}
            onMouseLeave={e=>(e.currentTarget as HTMLButtonElement).style.background='white'}>Cancel</button>
          <button onClick={()=>onConfirm(reason,comment)} style={actionBtn(true)}
            onMouseEnter={e=>{(e.currentTarget as HTMLButtonElement).style.background='#2563eb';(e.currentTarget as HTMLButtonElement).style.color='white'}}
            onMouseLeave={e=>{(e.currentTarget as HTMLButtonElement).style.background='white';(e.currentTarget as HTMLButtonElement).style.color='#2563eb'}}>Confirm</button>
        </div>
      </div>
    </div>
  )
}

// ── Alert Popup ────────────────────────────────────────────────────────────────
function AlertPopup({ message, type='info', onClose }: { message:string; type?:'info'|'error'|'success'; onClose:()=>void }) {
  const cfg = {
    info:    { bg:'#fef3cd', icon:<AlertCircle size={16} style={{ color:'#d97706' }}/> },
    error:   { bg:'#fef2f2', icon:<AlertCircle size={16} style={{ color:'#dc2626' }}/> },
    success: { bg:'#f0fdf4', icon:<CheckCircle2 size={16} style={{ color:'#16a34a' }}/> },
  }
  const c = cfg[type]
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:100 }}>
      <div style={{ background:'white', border:'1px solid #c5d0e0', borderRadius:6, width:380, boxShadow:'0 8px 32px rgba(0,0,0,0.15)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, padding:'12px 20px', background:c.bg, borderRadius:'6px 6px 0 0', borderBottom:'1px solid #e5e7eb' }}>
          {c.icon}<span style={{ fontWeight:600, fontSize:13 }}>PtsSEND</span>
        </div>
        <div style={{ padding:'16px 20px' }}><p style={{ fontSize:13, color:'#374151', lineHeight:1.6 }}>{message}</p></div>
        <div style={{ padding:'10px 20px', borderTop:'1px solid #e5e7eb', display:'flex', justifyContent:'flex-end' }}>
          <button onClick={onClose} style={{ background:'#2563eb', color:'white', border:'none', borderRadius:4, padding:'6px 24px', fontSize:13, cursor:'pointer', fontWeight:500 }}>OK</button>
        </div>
      </div>
    </div>
  )
}

// ── Date input with calendar icon ─────────────────────────────────────────────
function DateField({ value, onChange, readOnly = false }: { value:string; onChange:(v:string)=>void; readOnly?:boolean }) {
  return (
    <div style={{ flex:1, display:'flex', alignItems:'center', borderLeft:'none' }}>
      <input type="text" value={value}
        onChange={e=>onChange(e.target.value)}
        readOnly={readOnly}
        placeholder="DD-MMM-YYYY"
        style={{ ...inputStyle, flex:1, borderLeft:'none', background: readOnly ? '#f3f4f6' : 'white' }}/>
      {!readOnly && (
        <label style={{ padding:'4px 8px', borderLeft:'1px solid #c5d0e0', cursor:'pointer', background:'white', display:'flex', alignItems:'center' }}>
          <Calendar size={14} style={{ color:'#6b7280' }}/>
          <input type="date" style={{ display:'none' }}
            onChange={e=>{
              if (e.target.value) {
                const d=new Date(e.target.value)
                const months=['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC']
                onChange(`${String(d.getDate()).padStart(2,'0')}-${months[d.getMonth()]}-${d.getFullYear()}`)
              }
            }}
          />
        </label>
      )}
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function StudyAnimalsPage() {
  const navigate  = useNavigate()
  const { id }    = useParams<{ id: string }>()
  const fileRef   = useRef<HTMLInputElement>(null)

  const [sexTab,       setSexTab]       = useState<'M'|'F'>('M')
  const [males,        setMales]        = useState<Animal[]>(MOCK_MALES)
  const [females,      setFemales]      = useState<Animal[]>(MOCK_FEMALES)
  const [selectedId,   setSelectedId]   = useState<string>(MOCK_MALES[0]?.id ?? '')
  const [dirty,        setDirty]        = useState(false)
  const [needsAudit,   setNeedsAudit]   = useState(false)
  const [showAudit,    setShowAudit]    = useState(false)
  const [auditAction,  setAuditAction]  = useState<'save'|'exit'>('save')
  const [alert,        setAlert]        = useState<{msg:string;type?:'info'|'error'|'success'}|null>(null)

  const animals  = sexTab === 'M' ? males   : females
  const setList  = sexTab === 'M' ? setMales : setFemales
  const selected = animals.find(a => a.id === selectedId) ?? animals[0] ?? null

  useEffect(()=>{
    if (!id) return
    api.get(`/studies/${id}`).then(res=>{
      setNeedsAudit(res.data.study_status === 'DataLoaded')
    }).catch(()=>{})
    api.get(`/studies/${id}/animals`).then(res=>{
      if (res.data?.length) {
        setMales(res.data.filter((a:Animal)=>a.sex==='M'))
        setFemales(res.data.filter((a:Animal)=>a.sex==='F'))
      }
    }).catch(()=>{})
  },[id])

  // When switching sex tab, select first animal
  const handleSexTab = (sex: 'M'|'F') => {
    setSexTab(sex)
    const list = sex==='M' ? males : females
    setSelectedId(list[0]?.id ?? '')
  }

  // Update a field on the selected animal
  const updateField = (field: keyof Animal, value: string) => {
    setList(prev => prev.map(a => {
      if (a.id !== selectedId) return a
      const updated = { ...a, [field]: value }
      // FS16.2.6a — auto-calculate age from DOB and RFSTDTC
      if ((field==='date_of_birth'||field==='rfstdtc') && updated.date_of_birth && updated.rfstdtc) {
        try {
          const dob   = new Date(updated.date_of_birth)
          const start = new Date(updated.rfstdtc)
          if (!isNaN(dob.getTime()) && !isNaN(start.getTime())) {
            const diffDays = Math.floor((start.getTime()-dob.getTime())/86400000)
            updated.age = String(diffDays)
            updated.age_units = updated.age_units || 'Days'
          }
        } catch {}
      }
      return updated
    }))
    setDirty(true)
  }

  // ── FS16.3.1 Export to CSV ────────────────────────────────────────────────
  const handleExportCSV = () => {
    const all = [...males, ...females]
    const headers = ['Animal Number','Sex','Study Group','Strain','Strain/Substrain Details','Date of Birth','Subject Ref Start Date','Subject Ref End Date','Age Range','Age','Age Units','Planned Arm Code','Set Code','Date of Death','Death Status Category','Death Status','Death Type','Planned Path Code','Origin of Animal']
    const rows = all.map(a=>[a.animal_number,a.sex,a.study_group,a.strain,a.strain_substrain_details,a.date_of_birth,a.rfstdtc,a.rfendtc,a.age_range,a.age,a.age_units,a.planned_arm_code,a.set_code,a.date_of_death,a.death_status_category,a.death_status,a.death_type,a.planned_path_code,a.origin_of_animal])
    const csv = [headers,...rows].map(r=>r.map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(',')).join('\n')
    const blob = new Blob([csv],{type:'text/csv'})
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href=url; a.download=`animals_study_${id}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  // ── FS16.3.2 Import from CSV ──────────────────────────────────────────────
  const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const lines = (ev.target?.result as string).trim().split('\n')
        const data: Animal[] = lines.slice(1).map((line,i)=>{
          const c = line.split(',').map(v=>v.replace(/^"|"$/g,'').trim())
          return { id:String(i+1), animal_number:c[0]||'', sex:(c[1]||'M') as 'M'|'F', study_group:c[2]||'', strain:c[3]||'', strain_substrain_details:c[4]||'', date_of_birth:c[5]||'', rfstdtc:c[6]||'', rfendtc:c[7]||'', age_range:c[8]||'', age:c[9]||'', age_units:c[10]||'', planned_arm_code:c[11]||'', set_code:c[12]||'', date_of_death:c[13]||'', death_status_category:c[14]||'', death_status:c[15]||'', death_type:c[16]||'', planned_path_code:c[17]||'', origin_of_animal:c[18]||'' }
        })
        setMales(data.filter(a=>a.sex==='M'))
        setFemales(data.filter(a=>a.sex==='F'))
        setDirty(true)
        setAlert({ msg:`${data.length} animal(s) imported from CSV.`, type:'success' })
      } catch { setAlert({ msg:'Failed to parse CSV file.', type:'error' }) }
    }
    reader.readAsText(file); e.target.value=''
  }

  // ── Save / Exit helpers ────────────────────────────────────────────────────
  const handleSave = () => { if (needsAudit) { setAuditAction('save'); setShowAudit(true) } else doSave('','') }
  const doSave = async (reason:string, comment:string) => {
    setShowAudit(false)
    try {
      const all = [...males,...females]
      await Promise.all(all.map(a=>
        api.patch(`/studies/${id}/animals/${a.id}`,{
          strain:a.strain, date_of_birth:a.date_of_birth, rfstdtc:a.rfstdtc,
          rfendtc:a.rfendtc, age_range:a.age_range, age_units:a.age_units,
          set_code:a.set_code, date_of_death:a.date_of_death,
          death_status_category:a.death_status_category, death_status:a.death_status,
          death_type:a.death_type, origin_of_animal:a.origin_of_animal,
        },{ params: reason?{reason:`${reason}${comment?' — '+comment:''}`}:{} }).catch(()=>{})
      ))
      setDirty(false)
      setAlert({ msg:'Animal data saved successfully.', type:'success' })
    } catch { setAlert({ msg:'Save failed. Please try again.', type:'error' }) }
  }

  const handleBack   = () => { if (dirty) { setAlert({ msg:'Unsaved changes — please save first.', type:'info' }); return } navigate(`/studies/${id}/define/groups`) }
  const handleNext   = () => { if (dirty) { setAlert({ msg:'Unsaved changes — please save first.', type:'info' }); return } navigate(`/studies/${id}/define/trial-summary`) }
  const handleCancel = () => navigate('/setup/load')
  const handleExit   = () => { if (dirty) { if (needsAudit) { setAuditAction('exit'); setShowAudit(true) } else doExit('','') } else navigate('/setup/load') }
  const doExit = async (r:string,c:string) => { setShowAudit(false); await doSave(r,c); navigate('/setup/load') }
  const onAuditConfirm = (r:string,c:string) => { if (auditAction==='save') doSave(r,c); else doExit(r,c) }

  return (
    <StudyDefinitionLayout title="Animal">
      <div style={{ display:'flex', gap:16, alignItems:'flex-start' }}>

        {/* ── LEFT: Animal Details panel ─────────────────────────────────── */}
        <div style={{ width:160, flexShrink:0, border:'1px solid #c5d0e0', borderRadius:4, background:'white', overflow:'hidden' }}>
          <div style={{ padding:'8px 10px', fontSize:12, fontWeight:600, color:'#374151', borderBottom:'1px solid #e5e7eb', background:'#f8fafc' }}>
            Animal Details
          </div>

          {/* Males / Females tabs */}
          <div style={{ display:'flex', borderBottom:'1px solid #e5e7eb' }}>
            {(['M','F'] as const).map(sex=>(
              <button key={sex} onClick={()=>handleSexTab(sex)}
                style={{ flex:1, padding:'6px 0', fontSize:12, fontWeight: sexTab===sex ? 600 : 400,
                  color: sexTab===sex ? '#2563eb' : '#6b7280',
                  background: sexTab===sex ? 'white' : '#f3f4f6',
                  border:'none', borderBottom: sexTab===sex ? '2px solid #2563eb' : '2px solid transparent',
                  cursor:'pointer', transition:'all 0.15s',
                }}>
                {sex==='M' ? 'Males' : 'Females'}
              </button>
            ))}
          </div>

          {/* Animal number list */}
          <div style={{ overflowY:'auto', maxHeight:320 }}>
            {animals.map(a=>(
              <button key={a.id} onClick={()=>setSelectedId(a.id)}
                style={{ display:'block', width:'100%', textAlign:'left', padding:'6px 12px', fontSize:12,
                  color: selectedId===a.id ? '#1d4ed8' : '#2563eb',
                  background: selectedId===a.id ? '#dbeafe' : 'white',
                  border:'none', borderBottom:'1px solid #f3f4f6', cursor:'pointer',
                  fontWeight: selectedId===a.id ? 600 : 400,
                }}
                onMouseEnter={e=>{ if(selectedId!==a.id)(e.currentTarget as HTMLElement).style.background='#eff6ff' }}
                onMouseLeave={e=>{ if(selectedId!==a.id)(e.currentTarget as HTMLElement).style.background='white' }}
              >
                {a.animal_number}
              </button>
            ))}
            {animals.length===0&&(
              <p style={{ padding:'10px 12px', fontSize:11, color:'#9ca3af' }}>No animals</p>
            )}
          </div>
        </div>

        {/* ── RIGHT: Demographics - DM fields ───────────────────────────── */}
        {selected ? (
          <div style={{ flex:1 }}>
            <div style={{ fontSize:13, fontWeight:700, color:'#1e3a6e', marginBottom:8 }}>
              DEMOGRAPHICS - DM
            </div>

            <div style={{ border:'1px solid #c5d0e0', borderBottom:'none', borderRadius:'4px 4px 0 0', overflow:'hidden' }}>

              {/* FS16.2.1 Study Group — read-only */}
              <div style={rowStyle}>
                <div style={labelStyle}>Study group</div>
                <input value={selected.study_group} readOnly style={readStyle}/>
              </div>

              {/* FS16.2.2 Strain — editable */}
              <div style={rowStyle}>
                <div style={labelStyle}>Strain</div>
                <input value={selected.strain} onChange={e=>updateField('strain',e.target.value)} style={inputStyle}/>
              </div>

              {/* FS16.2.2a Strain/Substrain Details — editable */}
              <div style={rowStyle}>
                <div style={labelStyle}>Strain/Substrain Details</div>
                <input value={selected.strain_substrain_details} onChange={e=>updateField('strain_substrain_details',e.target.value)} style={inputStyle}/>
              </div>

              {/* FS16.2.3 Date of Birth — editable with date picker */}
              <div style={rowStyle}>
                <div style={labelStyle}>Date of Birth</div>
                <DateField value={selected.date_of_birth} onChange={v=>updateField('date_of_birth',v)}/>
              </div>

              {/* FS16.2.4 Subject Reference Start Date/Time */}
              <div style={rowStyle}>
                <div style={labelStyle}>Subject Reference Start Date/Time</div>
                <DateField value={selected.rfstdtc} onChange={v=>updateField('rfstdtc',v)}/>
              </div>

              {/* FS16.2.5 Subject Reference End Date/Time */}
              <div style={rowStyle}>
                <div style={labelStyle}>Subject Reference End Date/Time</div>
                <DateField value={selected.rfendtc} onChange={v=>updateField('rfendtc',v)}/>
              </div>

              {/* FS16.2.6 Age Range — editable */}
              <div style={rowStyle}>
                <div style={labelStyle}>Age range</div>
                <input value={selected.age_range} onChange={e=>updateField('age_range',e.target.value)} style={inputStyle}/>
              </div>

              {/* FS16.2.6a Age — calculated (read-only) */}
              <div style={rowStyle}>
                <div style={labelStyle}>Age</div>
                <input value={selected.age} readOnly style={readStyle} title="Calculated: Subject Ref Start Date − Date of Birth"/>
              </div>

              {/* FS16.2.7 Age Units — editable */}
              <div style={rowStyle}>
                <div style={labelStyle}>Age units</div>
                <select value={selected.age_units} onChange={e=>updateField('age_units',e.target.value)}
                  style={{ ...inputStyle, cursor:'pointer', appearance:'auto' as any }}>
                  {AGE_UNITS_OPTIONS.map(u=><option key={u} value={u}>{u}</option>)}
                </select>
              </div>

              {/* FS16.2.8 Planned Arm Code — read-only */}
              <div style={rowStyle}>
                <div style={labelStyle}>Planned Arm Code</div>
                <input value={selected.planned_arm_code} readOnly style={readStyle}/>
              </div>

              {/* FS16.2.9 Set Code — editable */}
              <div style={rowStyle}>
                <div style={labelStyle}>Set code</div>
                <input value={selected.set_code} onChange={e=>updateField('set_code',e.target.value)} style={inputStyle}/>
              </div>

              {/* FS16.2.25 Origin of Animal — editable */}
              <div style={rowStyle}>
                <div style={labelStyle}>Origin of Animal</div>
                <input value={selected.origin_of_animal} onChange={e=>updateField('origin_of_animal',e.target.value)} style={inputStyle}/>
              </div>

              {/* FS16.2.10 Date of Death — editable with date picker */}
              <div style={rowStyle}>
                <div style={labelStyle}>Date of Death</div>
                <DateField value={selected.date_of_death} onChange={v=>updateField('date_of_death',v)}/>
              </div>

              {/* FS16.2.11 Death Status Category — editable dropdown */}
              <div style={rowStyle}>
                <div style={labelStyle}>Death Status Category</div>
                <select value={selected.death_status_category} onChange={e=>updateField('death_status_category',e.target.value)}
                  style={{ ...inputStyle, cursor:'pointer', appearance:'auto' as any }}>
                  {DEATH_STATUS_CATEGORIES.map(d=><option key={d} value={d}>{d}</option>)}
                </select>
              </div>

              {/* FS16.2.12 Death Status — editable */}
              <div style={rowStyle}>
                <div style={labelStyle}>Death Status</div>
                <input value={selected.death_status} onChange={e=>updateField('death_status',e.target.value)} style={inputStyle}/>
              </div>

              {/* FS16.2.13 Death Type — editable */}
              <div style={rowStyle}>
                <div style={labelStyle}>Death Type</div>
                <input value={selected.death_type} onChange={e=>updateField('death_type',e.target.value)} style={{ ...inputStyle, borderBottom:'none' }}/>
              </div>

              {/* FS16.2.24 Planned Path Code — DART studies */}
              <div style={{ ...rowStyle, borderBottom:'1px solid #c5d0e0' }}>
                <div style={labelStyle}>Planned Path Code <span style={{ fontSize:10, color:'#9ca3af', marginLeft:4 }}>(DART)</span></div>
                <input value={selected.planned_path_code} onChange={e=>updateField('planned_path_code',e.target.value)} style={inputStyle}/>
              </div>
            </div>

            {dirty && <p style={{ fontSize:11, color:'#b45309', marginTop:6 }}>⚠ Unsaved changes on animal {selected.animal_number}</p>}
          </div>
        ) : (
          <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:'#9ca3af', fontSize:13 }}>
            Select an animal from the list on the left.
          </div>
        )}
      </div>

      {/* Hidden file input */}
      <input ref={fileRef} type="file" accept=".csv" style={{ display:'none' }} onChange={handleImportCSV}/>

      {/* ── Action buttons ─────────────────────────────────────────────────── */}
      <div style={{ display:'flex', justifyContent:'center', gap:6, marginTop:24, flexWrap:'wrap' }}>
        <button onClick={handleExportCSV} style={actionBtn()}
          onMouseEnter={e=>(e.currentTarget as HTMLButtonElement).style.background='#f3f4f6'}
          onMouseLeave={e=>(e.currentTarget as HTMLButtonElement).style.background='white'}>
          <Download size={12}/>Export to CSV
        </button>
        <button onClick={()=>fileRef.current?.click()} style={actionBtn()}
          onMouseEnter={e=>(e.currentTarget as HTMLButtonElement).style.background='#f3f4f6'}
          onMouseLeave={e=>(e.currentTarget as HTMLButtonElement).style.background='white'}>
          <Upload size={12}/>Import from CSV
        </button>
        <button onClick={handleSave} style={actionBtn(true)}
          onMouseEnter={e=>{(e.currentTarget as HTMLButtonElement).style.background='#2563eb';(e.currentTarget as HTMLButtonElement).style.color='white'}}
          onMouseLeave={e=>{(e.currentTarget as HTMLButtonElement).style.background='white';(e.currentTarget as HTMLButtonElement).style.color='#2563eb'}}>Save</button>
        <button onClick={handleBack} style={actionBtn(true)}
          onMouseEnter={e=>{(e.currentTarget as HTMLButtonElement).style.background='#2563eb';(e.currentTarget as HTMLButtonElement).style.color='white'}}
          onMouseLeave={e=>{(e.currentTarget as HTMLButtonElement).style.background='white';(e.currentTarget as HTMLButtonElement).style.color='#2563eb'}}>&lt;Back</button>
        <button onClick={handleNext} style={actionBtn(true)}
          onMouseEnter={e=>{(e.currentTarget as HTMLButtonElement).style.background='#2563eb';(e.currentTarget as HTMLButtonElement).style.color='white'}}
          onMouseLeave={e=>{(e.currentTarget as HTMLButtonElement).style.background='white';(e.currentTarget as HTMLButtonElement).style.color='#2563eb'}}>Next&gt;</button>
        <button onClick={handleCancel} style={actionBtn()}
          onMouseEnter={e=>(e.currentTarget as HTMLButtonElement).style.background='#f3f4f6'}
          onMouseLeave={e=>(e.currentTarget as HTMLButtonElement).style.background='white'}>Cancel</button>
        <button onClick={handleExit} style={actionBtn()}
          onMouseEnter={e=>(e.currentTarget as HTMLButtonElement).style.background='#f3f4f6'}
          onMouseLeave={e=>(e.currentTarget as HTMLButtonElement).style.background='white'}>Exit</button>
      </div>

      {showAudit && <AuditReasonPopup onConfirm={onAuditConfirm} onCancel={()=>setShowAudit(false)}/>}
      {alert     && <AlertPopup message={alert.msg} type={alert.type} onClose={()=>setAlert(null)}/>}
    </StudyDefinitionLayout>
  )
}
