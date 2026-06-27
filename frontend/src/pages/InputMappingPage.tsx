/**
 * FS11 — Input Mapping Page
 * CDR - Connection Administrator - Mapping Connector file
 * Maps PtsSEND Identifiers to incoming API Category/Tag fields
 * Columns: PtsSEND Identifier | Import or Manual | Allow Override | Pick from Previous Entry | Incoming Category | Incoming Tag
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Save, X } from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────
interface MappingRow {
  id: string
  identifier: string          // PtsSEND Identifier (read-only, fixed order)
  import_or_manual: 'Import' | 'Manual'   // FS11.1.1
  allow_override: 'Yes' | 'No'            // FS11.1.2 (future)
  pick_from_prev: 'Yes' | 'No'            // FS11.1.3 (future)
  incoming_category: string               // FS11.1.4
  incoming_tag: string                    // FS11.1.5
  tag_highlighted?: boolean               // some tags shown as links in screenshot
}

// ── Reason for Edit options (FS11.1.6) ────────────────────────────────────────
const EDIT_REASONS = [
  'Reason 1 for edit a record',
  'Reason 2 for edit a record',
  'Correcting mapping error',
  'Protocol update',
  'System configuration change',
  'Data quality improvement',
  'User request',
  'Other (specify)',
]

// ── Default mapping rows — fixed order, no sorting (per spec) ─────────────────
const DEFAULT_ROWS: MappingRow[] = [
  // ── Protocol Info ──────────────────────────────────────────────────────────
  { id:'1',  identifier:'Study Name',          import_or_manual:'Import', allow_override:'No',  pick_from_prev:'No',  incoming_category:'ProtocolInfo', incoming_tag:'StudyName' },
  { id:'2',  identifier:'Title',               import_or_manual:'Import', allow_override:'No',  pick_from_prev:'No',  incoming_category:'ProtocolInfo', incoming_tag:'StudyTitle',           tag_highlighted:true  },
  { id:'3',  identifier:'Site',                import_or_manual:'Import', allow_override:'Yes', pick_from_prev:'No',  incoming_category:'ProtocolInfo', incoming_tag:'SiteID/SiteName' },
  { id:'4',  identifier:'Study Director',      import_or_manual:'Import', allow_override:'No',  pick_from_prev:'No',  incoming_category:'ProtocolInfo', incoming_tag:'StudyDirector/StudyDirectorID' },
  { id:'5',  identifier:'Study Type',          import_or_manual:'Import', allow_override:'Yes', pick_from_prev:'No',  incoming_category:'ProtocolInfo', incoming_tag:'StudyTypeName' },
  { id:'6',  identifier:'Study Subtype',       import_or_manual:'Import', allow_override:'Yes', pick_from_prev:'No',  incoming_category:'ProtocolInfo', incoming_tag:'StudySubtypeName' },
  { id:'7',  identifier:'Species',             import_or_manual:'Import', allow_override:'Yes', pick_from_prev:'Yes', incoming_category:'ProtocolInfo', incoming_tag:'SpeciesName/SpeciesRefID/SpeciesID' },
  { id:'8',  identifier:'GLP Study',           import_or_manual:'Import', allow_override:'Yes', pick_from_prev:'Yes', incoming_category:'ProtocolInfo', incoming_tag:'GLPStudy',             tag_highlighted:true  },
  { id:'9',  identifier:'Start date',          import_or_manual:'Import', allow_override:'Yes', pick_from_prev:'No',  incoming_category:'ProtocolInfo', incoming_tag:'PlannedPHSTDate' },
  { id:'10', identifier:'End date',            import_or_manual:'Import', allow_override:'Yes', pick_from_prev:'No',  incoming_category:'ProtocolInfo', incoming_tag:'ActualPHSTDate' },
  { id:'11', identifier:'Lab Name',            import_or_manual:'Import', allow_override:'No',  pick_from_prev:'No',  incoming_category:'ProtocolInfo', incoming_tag:'LaboratoryName' },
  { id:'12', identifier:'Principal Investigator', import_or_manual:'Import', allow_override:'No', pick_from_prev:'No', incoming_category:'ProtocolInfo', incoming_tag:'PrincipalInvestigator' },
  // ── Group Info ─────────────────────────────────────────────────────────────
  { id:'13', identifier:'Group Number',        import_or_manual:'Import', allow_override:'No',  pick_from_prev:'No',  incoming_category:'GroupInfo',    incoming_tag:'GroupNumber' },
  { id:'14', identifier:'Group Label',         import_or_manual:'Import', allow_override:'No',  pick_from_prev:'No',  incoming_category:'GroupInfo',    incoming_tag:'GroupLabel' },
  { id:'15', identifier:'Group Description',   import_or_manual:'Import', allow_override:'No',  pick_from_prev:'No',  incoming_category:'GroupInfo',    incoming_tag:'GroupDescription' },
  { id:'16', identifier:'Compound',            import_or_manual:'Import', allow_override:'Yes', pick_from_prev:'No',  incoming_category:'GroupInfo',    incoming_tag:'CompoundName' },
  { id:'17', identifier:'Route',               import_or_manual:'Import', allow_override:'Yes', pick_from_prev:'Yes', incoming_category:'GroupInfo',    incoming_tag:'RouteName' },
  { id:'18', identifier:'Dose Level',          import_or_manual:'Import', allow_override:'Yes', pick_from_prev:'No',  incoming_category:'GroupInfo',    incoming_tag:'DoseLevel' },
  { id:'19', identifier:'Dose Unit',           import_or_manual:'Import', allow_override:'Yes', pick_from_prev:'Yes', incoming_category:'GroupInfo',    incoming_tag:'DoseUnit' },
  // ── Animal Info ────────────────────────────────────────────────────────────
  { id:'20', identifier:'Animal Number',       import_or_manual:'Import', allow_override:'No',  pick_from_prev:'No',  incoming_category:'AnimalInfo',   incoming_tag:'AnimalNumber' },
  { id:'21', identifier:'Sex',                 import_or_manual:'Import', allow_override:'Yes', pick_from_prev:'No',  incoming_category:'AnimalInfo',   incoming_tag:'SexName',              tag_highlighted:true  },
  { id:'22', identifier:'Strain',              import_or_manual:'Import', allow_override:'Yes', pick_from_prev:'Yes', incoming_category:'AnimalInfo',   incoming_tag:'StrainName/StrainRefID' },
  { id:'23', identifier:'Body Weight',         import_or_manual:'Import', allow_override:'No',  pick_from_prev:'No',  incoming_category:'AnimalInfo',   incoming_tag:'BodyWeight' },
  // ── Measurement Info ───────────────────────────────────────────────────────
  { id:'24', identifier:'Test Name',           import_or_manual:'Import', allow_override:'No',  pick_from_prev:'No',  incoming_category:'MeasurementInfo', incoming_tag:'TestName' },
  { id:'25', identifier:'Test Code',           import_or_manual:'Import', allow_override:'No',  pick_from_prev:'No',  incoming_category:'MeasurementInfo', incoming_tag:'TestCode' },
  { id:'26', identifier:'Result Value',        import_or_manual:'Import', allow_override:'No',  pick_from_prev:'No',  incoming_category:'MeasurementInfo', incoming_tag:'ResultValue' },
  { id:'27', identifier:'Result Unit',         import_or_manual:'Import', allow_override:'Yes', pick_from_prev:'Yes', incoming_category:'MeasurementInfo', incoming_tag:'ResultUnit' },
  { id:'28', identifier:'Sample Date',         import_or_manual:'Import', allow_override:'No',  pick_from_prev:'No',  incoming_category:'MeasurementInfo', incoming_tag:'SampleDate' },
]

// ── Styles ────────────────────────────────────────────────────────────────────
const thCl   = 'px-3 py-2 text-xs font-semibold text-center border-r border-blue-600 whitespace-nowrap bg-blue-600 text-white'
const tdId   = 'px-4 py-1.5 text-xs text-center border-b border-gray-200 bg-gray-50 text-gray-700 font-medium whitespace-nowrap'
const tdCl   = 'px-2 py-1.5 text-xs text-center border-b border-gray-200'
const selCl  = 'border border-gray-300 rounded px-1.5 py-1 text-xs text-gray-700 bg-white focus:outline-none focus:border-blue-400 w-full'
const inpCl  = 'border border-gray-300 rounded px-2 py-1 text-xs text-gray-700 bg-white focus:outline-none focus:border-blue-400 w-full'

// ── Component ─────────────────────────────────────────────────────────────────
export default function InputMappingPage() {
  const navigate = useNavigate()
  const [rows,      setRows]      = useState<MappingRow[]>(DEFAULT_ROWS)
  const [reason,    setReason]    = useState(EDIT_REASONS[0])  // FS11.1.6
  const [customReason, setCustomReason] = useState('')
  const [saved,     setSaved]     = useState(false)
  const [dirty,     setDirty]     = useState(false)

  // Track which rows the user changed (for audit trail)
  const [changedIds, setChangedIds] = useState<Set<string>>(new Set())

  const updateRow = (id: string, field: keyof MappingRow, value: string) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r))
    setChangedIds(prev => new Set([...prev, id]))
    setDirty(true)
    setSaved(false)
  }

  // FS11.2.1 Save
  const handleSave = () => {
    const auditReason = reason === 'Other (specify)' ? customReason.trim() || 'Other' : reason
    // In production: POST /api/v1/connections/mapping with rows + auditReason
    console.log('Saving mapping with audit reason:', auditReason, 'Changed rows:', [...changedIds])
    setSaved(true)
    setDirty(false)
    setChangedIds(new Set())
    // FS11.2.1: After save, navigate to study loading screen
    setTimeout(() => navigate('/setup/load'), 800)
  }

  // FS11.2.2 Cancel — reset to defaults
  const handleCancel = () => {
    setRows(DEFAULT_ROWS)
    setReason(EDIT_REASONS[0])
    setCustomReason('')
    setDirty(false)
    setSaved(false)
    setChangedIds(new Set())
  }

  // Group rows by category for visual separation
  const categoryOf = (r: MappingRow) => r.incoming_category
  let lastCategory = ''

  return (
    <div className="min-h-screen" style={{ background:'#f0f4f8' }}>
      <div className="px-4 py-4">

        {/* Page title */}
        <div className="text-center text-sm font-medium text-gray-700 mb-4">
          CDR - Connection Administrator - Mapping Connector file
        </div>

        {/* ── Top bar: Reason for Edit + Save + Cancel ──────────────────────── */}
        <div className="flex items-center justify-center gap-3 mb-4 flex-wrap">
          {/* FS11.1.6 Reason for Edit */}
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700 whitespace-nowrap"
              style={{ background:'#e8eef7', border:'1px solid #c5d0e0', borderRadius:'4px', padding:'6px 14px' }}>
              Reason for Edit
            </label>
            <select
              value={reason}
              onChange={e => { setReason(e.target.value); setDirty(true) }}
              style={{ minWidth:240, border:'1px solid #c5d0e0', borderRadius:'4px', padding:'6px 28px 6px 10px', fontSize:'13px', color:'#374151', background:'white', cursor:'pointer', outline:'none' }}
            >
              {EDIT_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>

          {/* Free-text reason when "Other" selected */}
          {reason === 'Other (specify)' && (
            <input
              value={customReason}
              onChange={e => setCustomReason(e.target.value)}
              placeholder="Enter reason..."
              style={{ border:'1px solid #c5d0e0', borderRadius:'4px', padding:'6px 10px', fontSize:'13px', width:200, outline:'none' }}
            />
          )}

          {/* FS11.2.1 Save */}
          <button
            onClick={handleSave}
            style={{ border:'1px solid #2563eb', borderRadius:'4px', padding:'6px 22px', fontSize:'13px', color:'#2563eb', background:'white', cursor:'pointer', fontWeight:500, display:'flex', alignItems:'center', gap:'5px', transition:'all 0.15s' }}
            onMouseEnter={e => { (e.currentTarget).style.background='#2563eb'; (e.currentTarget).style.color='white' }}
            onMouseLeave={e => { (e.currentTarget).style.background='white'; (e.currentTarget).style.color='#2563eb' }}
          >
            <Save size={13}/>Save
          </button>

          {/* FS11.2.2 Cancel */}
          <button
            onClick={handleCancel}
            style={{ border:'1px solid #6b7280', borderRadius:'4px', padding:'6px 18px', fontSize:'13px', color:'#6b7280', background:'white', cursor:'pointer', fontWeight:500, display:'flex', alignItems:'center', gap:'5px', transition:'all 0.15s' }}
            onMouseEnter={e => { (e.currentTarget).style.background='#f3f4f6' }}
            onMouseLeave={e => { (e.currentTarget).style.background='white' }}
          >
            <X size={13}/>Cancel
          </button>

          {saved && (
            <span style={{ fontSize:'12px', color:'#15803d', background:'#f0fdf4', border:'1px solid #86efac', borderRadius:'4px', padding:'5px 12px' }}>
              ✓ Mapping saved. Redirecting to Study Load…
            </span>
          )}
        </div>

        {/* ── Notes banner */}
        <div style={{ background:'#fffbeb', border:'1px solid #fcd34d', borderRadius:'6px', padding:'8px 16px', marginBottom:'12px', fontSize:'12px', color:'#92400e' }}>
          <strong>Note:</strong> Allow Override (FS11.1.2) and Pick from Previous Entry (FS11.1.3) are designed for future release and are not functional in this release.
          Mapping items are displayed in a fixed order — no sorting is allowed.
          {dirty && <span style={{ marginLeft:12, color:'#b45309' }}>⚠ Unsaved changes ({changedIds.size} row{changedIds.size!==1?'s':''} modified)</span>}
        </div>

        {/* ── Mapping Grid ──────────────────────────────────────────────────── */}
        <div className="border border-gray-300 rounded overflow-hidden" style={{ boxShadow:'0 1px 4px rgba(0,0,0,0.06)' }}>
          <div className="overflow-x-auto overflow-y-auto" style={{ maxHeight:'calc(100vh - 230px)' }}>
            <table className="w-full bg-white" style={{ borderCollapse:'collapse', minWidth:900 }}>
              <thead style={{ position:'sticky', top:0, zIndex:10 }}>
                <tr style={{ background:'#bdd7ee' }}>
                  {/* Column headers matching the screenshot exactly */}
                  <th className={thCl} style={{ minWidth:150, background:'#bdd7ee', color:'#1e3a6e', borderBottom:'2px solid #93bbdb' }}>
                    PtsSEND Identifier
                  </th>
                  <th className={thCl} style={{ minWidth:140, background:'#bdd7ee', color:'#1e3a6e', borderBottom:'2px solid #93bbdb' }}>
                    Import or Manual
                  </th>
                  <th className={thCl} style={{ minWidth:130, background:'#bdd7ee', color:'#1e3a6e', borderBottom:'2px solid #93bbdb' }}>
                    Allow Override
                  </th>
                  <th className={thCl} style={{ minWidth:160, background:'#bdd7ee', color:'#1e3a6e', borderBottom:'2px solid #93bbdb' }}>
                    Pick from Previous Entry
                  </th>
                  <th className={thCl} style={{ minWidth:180, background:'#bdd7ee', color:'#1e3a6e', borderBottom:'2px solid #93bbdb' }}>
                    Incoming Category
                  </th>
                  <th className={thCl} style={{ minWidth:250, background:'#bdd7ee', color:'#1e3a6e', borderBottom:'2px solid #93bbdb', borderRight:'none' }}>
                    Incoming Tag
                  </th>
                </tr>
              </thead>

              <tbody>
                {rows.map((row, i) => {
                  // Show category section separator
                  const cat = categoryOf(row)
                  const showSep = cat !== lastCategory
                  lastCategory = cat
                  const isChanged = changedIds.has(row.id)
                  const isManual  = row.import_or_manual === 'Manual'

                  return (
                    <>
                      {/* Category section header */}
                      {showSep && (
                        <tr key={`sep-${cat}`}>
                          <td colSpan={6} style={{ background:'#e8eef7', borderBottom:'1px solid #c5d0e0', borderTop: i > 0 ? '2px solid #93bbdb' : 'none', padding:'4px 16px', fontSize:'11px', fontWeight:600, color:'#1e3a6e', letterSpacing:'0.05em', textTransform:'uppercase' }}>
                            {cat}
                          </td>
                        </tr>
                      )}

                      <tr key={row.id}
                        style={{ background: isChanged ? '#fefce8' : i % 2 === 0 ? 'white' : '#f8fafc' }}>

                        {/* PtsSEND Identifier (read-only) */}
                        <td className={tdId} style={{ background: isChanged ? '#fef9c3' : '#f0f4f8', fontWeight: isChanged ? 600 : 500 }}>
                          <span style={{ color: isChanged ? '#92400e' : '#374151' }}>{row.identifier}</span>
                          {isChanged && <span style={{ marginLeft:4, fontSize:10, color:'#b45309' }}>✎</span>}
                        </td>

                        {/* FS11.1.1 Import or Manual */}
                        <td className={tdCl}>
                          <select value={row.import_or_manual}
                            onChange={e => updateRow(row.id, 'import_or_manual', e.target.value)}
                            className={selCl}>
                            <option value="Import">Import</option>
                            <option value="Manual">Manual</option>
                          </select>
                        </td>

                        {/* FS11.1.2 Allow Override (future) */}
                        <td className={tdCl}>
                          <select value={row.allow_override}
                            onChange={e => updateRow(row.id, 'allow_override', e.target.value)}
                            className={selCl}
                            style={{ opacity: 0.8 }}
                            title="For future release — not functional in this release">
                            <option value="No">No</option>
                            <option value="Yes">Yes</option>
                          </select>
                        </td>

                        {/* FS11.1.3 Pick from Previous Entry (future) */}
                        <td className={tdCl}>
                          <select value={row.pick_from_prev}
                            onChange={e => updateRow(row.id, 'pick_from_prev', e.target.value)}
                            className={selCl}
                            style={{ opacity: 0.8 }}
                            title="For future release — not functional in this release">
                            <option value="No">No</option>
                            <option value="Yes">Yes</option>
                          </select>
                        </td>

                        {/* FS11.1.4 Incoming Category — editable, disabled when Manual */}
                        <td className={tdCl}>
                          <input
                            value={row.incoming_category}
                            onChange={e => updateRow(row.id, 'incoming_category', e.target.value)}
                            disabled={isManual}
                            className={inpCl}
                            style={{ opacity: isManual ? 0.4 : 1, cursor: isManual ? 'not-allowed' : 'text' }}
                            title={isManual ? 'Incoming Category not required when Manual' : 'Incoming Category (FS11.1.4)'}
                          />
                        </td>

                        {/* FS11.1.5 Incoming Tag — editable, disabled when Manual */}
                        <td className={tdCl}>
                          <input
                            value={row.incoming_tag}
                            onChange={e => updateRow(row.id, 'incoming_tag', e.target.value)}
                            disabled={isManual}
                            className={inpCl}
                            style={{
                              opacity: isManual ? 0.4 : 1,
                              cursor: isManual ? 'not-allowed' : 'text',
                              color: row.tag_highlighted ? '#2563eb' : '#374151',
                              fontWeight: row.tag_highlighted ? 500 : 400,
                            }}
                            title={isManual ? 'Incoming Tag not required when Manual' : 'Incoming Tag (FS11.1.5)'}
                          />
                        </td>
                      </tr>
                    </>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Footer row count */}
          <div style={{ padding:'6px 12px', background:'#f8fafc', borderTop:'1px solid #e5e7eb', fontSize:'11px', color:'#6b7280', display:'flex', justifyContent:'space-between' }}>
            <span>{rows.length} mapping items (fixed order)</span>
            {dirty && <span style={{ color:'#b45309' }}>{changedIds.size} row{changedIds.size!==1?'s':''} modified — remember to Save</span>}
          </div>
        </div>
      </div>
    </div>
  )
}
