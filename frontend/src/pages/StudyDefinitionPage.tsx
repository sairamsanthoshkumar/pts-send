/**
 * FS14 — Study Definition: Study Tab
 * Fields: PtsSEND Study Status, PtsSEND Study Name, Import Study Name,
 *         Protocol Status, Dataset Approved Status/By/Comment/Date,
 *         Automatic SEND output, Unique Subject ID
 * Actions: Save (FS14.2.1), Next> (FS14.2.2), Cancel (FS14.2.3), Exit (FS14.2.4)
 */
import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { X, AlertCircle, CheckCircle2 } from 'lucide-react'
import StudyDefinitionLayout from '../components/study/StudyDefinitionLayout'
import { api } from '../api/client'

// ── Shared field row styles ────────────────────────────────────────────────────
const labelStyle: React.CSSProperties = {
  display:'flex', alignItems:'center',
  background:'#e8eef7', border:'1px solid #c5d0e0',
  padding:'8px 14px', fontSize:13, fontWeight:500,
  color:'#374151', width:220, flexShrink:0,
}
const inputStyle: React.CSSProperties = {
  flex:1, border:'1px solid #c5d0e0', borderLeft:'none',
  padding:'7px 10px', fontSize:13, color:'#111827',
  background:'white', outline:'none',
}
const disabledInputStyle: React.CSSProperties = {
  ...inputStyle, background:'#f3f4f6', color:'#6b7280', cursor:'not-allowed',
}
const rowStyle: React.CSSProperties = {
  display:'flex', alignItems:'stretch',
  marginBottom:0, borderBottom:'1px solid #c5d0e0',
}
const actionBtn = (primary = false): React.CSSProperties => ({
  border: primary ? '1px solid #2563eb' : '1px solid #6b7280',
  borderRadius:4, padding:'6px 20px', fontSize:13,
  color: primary ? '#2563eb' : '#6b7280',
  background:'white', cursor:'pointer', fontWeight:500,
  transition:'all 0.15s',
})

// ── Audit Reason choices (from system initialization file) ────────────────────
const AUDIT_REASONS = [
  'Correction of data entry error',
  'Protocol amendment',
  'Data quality improvement',
  'Regulatory requirement',
  'User request',
  'Other (specify below)',
]

// ── Audit Reason Popup ────────────────────────────────────────────────────────
function AuditReasonPopup({ onConfirm, onCancel }: {
  onConfirm: (reason: string, comment: string) => void
  onCancel: () => void
}) {
  const [reason,  setReason]  = useState(AUDIT_REASONS[0])
  const [comment, setComment] = useState('')

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:100 }}>
      <div style={{ background:'white', border:'1px solid #c5d0e0', borderRadius:6, width:440, boxShadow:'0 8px 32px rgba(0,0,0,0.18)' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 20px', background:'#e8eef7', borderBottom:'1px solid #c5d0e0', borderRadius:'6px 6px 0 0' }}>
          <span style={{ fontWeight:600, fontSize:14, color:'#1e3a6e' }}>Reason for Edit — Audit Trail Required</span>
          <button onClick={onCancel} style={{ background:'none', border:'none', cursor:'pointer' }}><X size={16} style={{ color:'#6b7280' }}/></button>
        </div>
        <div style={{ padding:'16px 20px' }}>
          <p style={{ fontSize:12, color:'#6b7280', marginBottom:12 }}>Study status is "Data Loaded". An audit reason is required for this change.</p>
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {AUDIT_REASONS.map(r => (
              <label key={r} style={{ display:'flex', alignItems:'center', gap:8, fontSize:13, color:'#374151', cursor:'pointer' }}>
                <input type="radio" name="audit" value={r} checked={reason===r} onChange={()=>setReason(r)} style={{ accentColor:'#2563eb' }}/>
                {r}
              </label>
            ))}
          </div>
          {reason==='Other (specify below)' && (
            <textarea value={comment} onChange={e=>setComment(e.target.value)} rows={3}
              placeholder="Enter reason..."
              style={{ width:'100%', marginTop:10, border:'1px solid #c5d0e0', borderRadius:4, padding:'6px 10px', fontSize:13, resize:'none', outline:'none', boxSizing:'border-box' as any }}/>
          )}
        </div>
        <div style={{ padding:'12px 20px', borderTop:'1px solid #e5e7eb', display:'flex', justifyContent:'flex-end', gap:8 }}>
          <button onClick={onCancel}
            style={actionBtn()}
            onMouseEnter={e=>(e.currentTarget as HTMLButtonElement).style.background='#f3f4f6'}
            onMouseLeave={e=>(e.currentTarget as HTMLButtonElement).style.background='white'}>
            Cancel
          </button>
          <button onClick={()=>onConfirm(reason, comment)}
            style={{ ...actionBtn(true) }}
            onMouseEnter={e=>{(e.currentTarget as HTMLButtonElement).style.background='#2563eb';(e.currentTarget as HTMLButtonElement).style.color='white'}}
            onMouseLeave={e=>{(e.currentTarget as HTMLButtonElement).style.background='white';(e.currentTarget as HTMLButtonElement).style.color='#2563eb'}}>
            Confirm
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Alert Popup ────────────────────────────────────────────────────────────────
function AlertPopup({ message, type = 'info', onClose }: { message:string; type?:'info'|'error'|'success'; onClose:()=>void }) {
  const colors = {
    info:    { bg:'#fef3cd', border:'#fcd34d', icon:<AlertCircle size={16} style={{ color:'#d97706' }}/> },
    error:   { bg:'#fef2f2', border:'#fca5a5', icon:<AlertCircle size={16} style={{ color:'#dc2626' }}/> },
    success: { bg:'#f0fdf4', border:'#86efac', icon:<CheckCircle2 size={16} style={{ color:'#16a34a' }}/> },
  }
  const c = colors[type]
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:100 }}>
      <div style={{ background:'white', border:'1px solid #c5d0e0', borderRadius:6, width:380, boxShadow:'0 8px 32px rgba(0,0,0,0.15)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, padding:'12px 20px', background:c.bg, borderBottom:`1px solid ${c.border}`, borderRadius:'6px 6px 0 0' }}>
          {c.icon}<span style={{ fontWeight:600, fontSize:13 }}>PtsSEND</span>
        </div>
        <div style={{ padding:'16px 20px' }}><p style={{ fontSize:13, color:'#374151', lineHeight:1.6 }}>{message}</p></div>
        <div style={{ padding:'10px 20px', borderTop:'1px solid #e5e7eb', display:'flex', justifyContent:'flex-end' }}>
          <button onClick={onClose}
            style={{ background:'#2563eb', color:'white', border:'none', borderRadius:4, padding:'6px 24px', fontSize:13, cursor:'pointer', fontWeight:500 }}>
            OK
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function StudyDefinitionPage() {
  const navigate = useNavigate()
  const { id }   = useParams<{ id: string }>()

  // ── Form state ────────────────────────────────────────────────────────────
  // FS14.1.1 — PtsSEND Study Status
  const [studyStatus,       setStudyStatus]       = useState<'Setup'|'Data Loaded'>('Setup')
  // FS14.1.2 — PtsSEND Study Name
  const [ptsStudyName,      setPtsStudyName]      = useState('va-rfm')
  // FS14.1.3 — Import Study Name (read-only for Pristima; editable for CSV/migrated)
  const [importStudyName,   setImportStudyName]   = useState('va-rfm')
  const [isPristima]                              = useState(true) // from connection type
  // FS14.1.4 — Protocol Status (read-only for Pristima)
  const [protocolStatus,    setProtocolStatus]    = useState('Active')
  // FS14.1.5 — Dataset Approved Status (checkbox — can only uncheck)
  const [datasetApproved,   setDatasetApproved]   = useState(false)
  // FS14.1.6 — Dataset Approved By (display only)
  const [approvedBy]                              = useState('')
  // FS14.1.7 — Dataset Approved Comment
  const [approvedComment,   setApprovedComment]   = useState('')
  // FS14.1.8 — Dataset Approved Date (display only)
  const [approvedDate]                            = useState('')
  // FS14.1.9 — Automatic SEND output
  const [autoSendOutput,    setAutoSendOutput]    = useState(false)
  // Unique Subject ID
  const [uniqueSubjectId,   setUniqueSubjectId]   = useState(false)

  // ── UI state ──────────────────────────────────────────────────────────────
  const [showAudit,   setShowAudit]   = useState(false)
  const [auditAction, setAuditAction] = useState<'save'|'exit'>('save')
  const [alert,       setAlert]       = useState<{msg:string;type?:'info'|'error'|'success'}|null>(null)
  const [dirty,       setDirty]       = useState(false)

  const needsAudit = studyStatus === 'Data Loaded'

  const markDirty = () => setDirty(true)

  // Load study data from API
  useEffect(() => {
    if (!id) return
    api.get(`/studies/${id}`).then(res => {
      const s = res.data
      if (s.pts_study_name)    setPtsStudyName(s.pts_study_name)
      if (s.import_study_name) setImportStudyName(s.import_study_name)
      if (s.study_status)      setStudyStatus(s.study_status === 'DataLoaded' ? 'Data Loaded' : 'Setup')
      if (s.protocol_status)   setProtocolStatus(s.protocol_status)
      if (s.dataset_approved)  setDatasetApproved(s.dataset_approved)
      if (s.unique_subject_id_flag !== undefined) setUniqueSubjectId(s.unique_subject_id_flag)
    }).catch(() => {}) // fallback to default values on error
  }, [id])

  // ── FS14.2.1 Save ────────────────────────────────────────────────────────
  const handleSave = () => {
    if (needsAudit) { setAuditAction('save'); setShowAudit(true) }
    else doSave('', '')
  }
  const doSave = async (reason: string, comment: string) => {
    setShowAudit(false)
    try {
      await api.patch(`/studies/${id}`, {
        pts_study_name:       ptsStudyName,
        study_status:         studyStatus === 'Data Loaded' ? 'DataLoaded' : 'Setup',
        protocol_status:      protocolStatus,
        dataset_approved:     datasetApproved,
        dataset_approved_comment: approvedComment,
        unique_subject_id_flag:   uniqueSubjectId,
      }, { params: reason ? { reason: `${reason}${comment ? ' — ' + comment : ''}` } : {} })
      setDirty(false)
      setAlert({ msg: 'Study definition saved successfully.', type: 'success' })
    } catch (err: any) {
      setAlert({ msg: err?.response?.data?.detail ?? 'Save failed. Please check your inputs and try again.', type: 'error' })
    }
  }

  // ── FS14.2.2 Next> ───────────────────────────────────────────────────────
  const handleNext = () => {
    if (dirty) {
      setAlert({ msg: 'You have unsaved changes. Please save before proceeding to the next tab.', type: 'info' })
      return
    }
    navigate(`/studies/${id}/define/groups`)
  }

  // ── FS14.2.3 Cancel ──────────────────────────────────────────────────────
  const handleCancel = () => navigate('/setup/load')

  // ── FS14.2.4 Exit ────────────────────────────────────────────────────────
  const handleExit = () => {
    if (dirty) {
      if (needsAudit) { setAuditAction('exit'); setShowAudit(true) }
      else doExit('', '')
    } else {
      navigate('/setup/load')
    }
  }
  const doExit = async (reason: string, comment: string) => {
    setShowAudit(false)
    try {
      await api.patch(`/studies/${id}`, {
        pts_study_name:       ptsStudyName,
        study_status:         studyStatus === 'Data Loaded' ? 'DataLoaded' : 'Setup',
        protocol_status:      protocolStatus,
        dataset_approved:     datasetApproved,
        unique_subject_id_flag: uniqueSubjectId,
      }, { params: reason ? { reason: `${reason}${comment ? ' — ' + comment : ''}` } : {} })
      navigate('/setup/load')
    } catch (err: any) {
      setAlert({ msg: err?.response?.data?.detail ?? 'Save failed during exit.', type: 'error' })
    }
  }

  const onAuditConfirm = (reason: string, comment: string) => {
    if (auditAction === 'save') doSave(reason, comment)
    else                        doExit(reason, comment)
  }

  return (
    <StudyDefinitionLayout title="Study">
      <div style={{ maxWidth: 700 }}>

        {/* Form fields */}
        <div style={{ border:'1px solid #c5d0e0', borderBottom:'none', borderRadius:'4px 4px 0 0', overflow:'hidden' }}>

          {/* FS14.1.1 — PtsSEND Study Status */}
          <div style={rowStyle}>
            <div style={labelStyle}>PtsSEND Study Completion Status</div>
            <select value={studyStatus}
              onChange={e => { setStudyStatus(e.target.value as 'Setup'|'Data Loaded'); markDirty() }}
              style={{ ...inputStyle, cursor:'pointer', appearance:'auto' as any }}>
              <option value="Setup">Setup</option>
              <option value="Data Loaded">Data Loaded</option>
            </select>
          </div>

          {/* FS14.1.2 — PtsSEND Study Name */}
          <div style={rowStyle}>
            <div style={labelStyle}>PtsSEND Study Name</div>
            <input value={ptsStudyName}
              onChange={e => { setPtsStudyName(e.target.value); markDirty() }}
              style={inputStyle}/>
          </div>

          {/* FS14.1.3 — Import Study Name */}
          <div style={rowStyle}>
            <div style={{ ...labelStyle, alignItems:'flex-start', paddingTop:10 }}>Import Study Name</div>
            <textarea
              value={importStudyName}
              onChange={e => { if (!isPristima) { setImportStudyName(e.target.value); markDirty() } }}
              readOnly={isPristima}
              rows={3}
              style={{
                ...inputStyle,
                resize:'none', paddingTop:8,
                background: isPristima ? '#f3f4f6' : 'white',
                color: isPristima ? '#6b7280' : '#111827',
                cursor: isPristima ? 'default' : 'text',
              }}
              title={isPristima ? 'Import Study Name cannot be edited for Pristima studies' : ''}
            />
          </div>

          {/* FS14.1.4 — Protocol Status */}
          <div style={rowStyle}>
            <div style={labelStyle}>Protocol Status</div>
            <input
              value={protocolStatus}
              onChange={e => { if (!isPristima) { setProtocolStatus(e.target.value); markDirty() } }}
              readOnly={isPristima}
              style={isPristima ? disabledInputStyle : inputStyle}
              title={isPristima ? 'Protocol Status cannot be edited for Pristima studies' : ''}
            />
          </div>

          {/* FS14.1.5 — Dataset Approved Status */}
          <div style={rowStyle}>
            <div style={labelStyle}>Dataset Approved Status</div>
            <div style={{ ...inputStyle, display:'flex', alignItems:'center' }}>
              <input
                type="checkbox"
                checked={datasetApproved}
                onChange={e => {
                  // FS14.1.5: can only uncheck if currently checked
                  if (datasetApproved && !e.target.checked) { setDatasetApproved(false); markDirty() }
                  else if (!datasetApproved) setAlert({ msg:'Dataset can only be approved through the Approve Dataset function in the Studies screen.', type:'info' })
                }}
                style={{ width:16, height:16, accentColor:'#2563eb', cursor:'pointer' }}
              />
            </div>
          </div>

          {/* FS14.1.6 — Dataset Approved By (display only) */}
          <div style={rowStyle}>
            <div style={labelStyle}>Dataset Approved by</div>
            <input value={approvedBy} readOnly style={disabledInputStyle} placeholder=""/>
          </div>

          {/* FS14.1.8 — Dataset Approved Date (display only) */}
          <div style={rowStyle}>
            <div style={labelStyle}>Dataset Approved Date</div>
            <input value={approvedDate} readOnly style={disabledInputStyle} placeholder=""/>
          </div>

          {/* FS14.1.7 — Dataset Approved Comment */}
          <div style={rowStyle}>
            <div style={{ ...labelStyle, alignItems:'flex-start', paddingTop:10 }}>Dataset Approved comment</div>
            <textarea
              value={approvedComment}
              onChange={e => { setApprovedComment(e.target.value); markDirty() }}
              rows={3}
              style={{ ...inputStyle, resize:'none', paddingTop:8 }}
            />
          </div>

          {/* Automatic SEND output */}
          <div style={rowStyle}>
            <div style={labelStyle}>Automatic SEND output</div>
            <div style={{ ...inputStyle, display:'flex', alignItems:'center' }}>
              <input type="checkbox" checked={autoSendOutput}
                onChange={e => { setAutoSendOutput(e.target.checked); markDirty() }}
                style={{ width:16, height:16, accentColor:'#2563eb', cursor:'pointer' }}/>
            </div>
          </div>

          {/* FS14.1.9 — Unique Subject ID */}
          <div style={{ ...rowStyle, borderBottom:'1px solid #c5d0e0' }}>
            <div style={labelStyle}>Unique subject ID</div>
            <div style={{ ...inputStyle, display:'flex', alignItems:'center' }}>
              <input type="checkbox" checked={uniqueSubjectId}
                onChange={e => { setUniqueSubjectId(e.target.checked); markDirty() }}
                style={{ width:16, height:16, accentColor:'#2563eb', cursor:'pointer' }}
                title="If checked, SUBJID is used as USUBJID. If unchecked, STUDYID-SUBJID is used. Does not apply to CSV or SEND Dataset studies."
              />
            </div>
          </div>
        </div>

        {/* Notes */}
        <div style={{ marginTop:8, fontSize:11, color:'#9ca3af', lineHeight:1.5 }}>
          {isPristima && '* Import Study Name and Protocol Status are read-only for Pristima API studies. '}
          Unique Subject ID does not apply to CSV or SEND Dataset study types.
          {needsAudit && <span style={{ color:'#b45309', marginLeft:8 }}>⚠ Status is "Data Loaded" — audit reason required on Save/Exit.</span>}
        </div>

        {/* ── Action buttons ──────────────────────────────────────────────── */}
        <div style={{ display:'flex', justifyContent:'center', gap:10, marginTop:20 }}>

          {/* FS14.2.1 Save */}
          <button onClick={handleSave} style={actionBtn(true)}
            onMouseEnter={e=>{(e.currentTarget as HTMLButtonElement).style.background='#2563eb';(e.currentTarget as HTMLButtonElement).style.color='white'}}
            onMouseLeave={e=>{(e.currentTarget as HTMLButtonElement).style.background='white';(e.currentTarget as HTMLButtonElement).style.color='#2563eb'}}>
            Save
          </button>

          {/* FS14.2.2 Next> */}
          <button onClick={handleNext} style={actionBtn(true)}
            onMouseEnter={e=>{(e.currentTarget as HTMLButtonElement).style.background='#2563eb';(e.currentTarget as HTMLButtonElement).style.color='white'}}
            onMouseLeave={e=>{(e.currentTarget as HTMLButtonElement).style.background='white';(e.currentTarget as HTMLButtonElement).style.color='#2563eb'}}>
            Next&gt;
          </button>

          {/* FS14.2.3 Cancel */}
          <button onClick={handleCancel} style={actionBtn()}
            onMouseEnter={e=>(e.currentTarget as HTMLButtonElement).style.background='#f3f4f6'}
            onMouseLeave={e=>(e.currentTarget as HTMLButtonElement).style.background='white'}>
            Cancel
          </button>

          {/* FS14.2.4 Exit */}
          <button onClick={handleExit} style={actionBtn()}
            onMouseEnter={e=>(e.currentTarget as HTMLButtonElement).style.background='#f3f4f6'}
            onMouseLeave={e=>(e.currentTarget as HTMLButtonElement).style.background='white'}>
            Exit
          </button>
        </div>
      </div>

      {/* Audit Reason popup */}
      {showAudit && (
        <AuditReasonPopup onConfirm={onAuditConfirm} onCancel={()=>setShowAudit(false)}/>
      )}

      {/* Alert popup */}
      {alert && (
        <AlertPopup message={alert.msg} type={alert.type} onClose={()=>setAlert(null)}/>
      )}
    </StudyDefinitionLayout>
  )
}
