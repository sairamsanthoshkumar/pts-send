/**
 * FS13 — Study-Measurement Selection Page
 * Two-panel shuttle: Available Measurement (left) → Selected Measurement (right)
 * Fields: Import Study Name, Linked Colony Data Only
 * Actions: Move all, Remove all, single-click to move, Filter (both panels), Done, Cancel
 */
import { useState, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ChevronDown } from 'lucide-react'

// ── All available measurements per source type ────────────────────────────────
const PRISTIMA_MEASUREMENTS = [
  'Adult Pathology',
  'Body Weights',
  'Cesarean Section',
  'Clinical Observations',
  'Direct Dosing',
  'Empty Feeder Weights',
  'Fetal Necropsy Observations',
  'Full Feeder Weights',
  'Generalized Measurement',
  'Gross Observations',
  'Indirect Dosing',
  'Laboratory Results',
  'Load Summary Data',
  'Mass Tracking',
  'Mating Monitoring',
  'Organ Weights',
  'Parturition',
  'Pup Necropsy observations',
  'Sample Collection',
  'Standard Clinical Observations',
  'Time Bleed Collection',
  'Uterine Exam',
]

const CSV_DOMAINS = [
  'DM – Demographics',
  'BW – Body Weights',
  'LB – Laboratory Results',
  'CL – Clinical Observations',
  'MA – Macroscopic Findings',
  'MI – Microscopic Findings',
  'VS – Vital Signs',
  'DS – Disposition',
  'EX – Exposure',
  'FW – Food / Water Consumption',
  'OM – Organ Measurements',
  'BG – Body Weight Gains',
  'PM – Palpable Masses',
  'TS – Trial Summary',
  'TE – Trial Elements',
  'TA – Trial Arms',
  'TX – Trial Sets',
]

// FS13.1.3 — Generalized measurement domain mapping options
const GENERALIZED_DOMAINS = ['', 'VS', 'EG', 'LB', 'CL', 'RE', 'CV', 'XY', 'XZ', 'XV']

// Mock study list
const STUDY_LIST = [
  'XI42_Study', 'XI42_Study2', 'RFMDemo', 'bwstats', 'mg1', 'mg',
  'va-indose3', 'va-indose1', 'DemoStudy1', 'DemoStudy2',
]

// Shared styles
const panelBox: React.CSSProperties = {
  border: '1px solid #c5d0e0',
  borderRadius: '2px',
  background: 'white',
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
}
const filterInp: React.CSSProperties = {
  width: '100%',
  border: 'none',
  borderBottom: '1px solid #e5e7eb',
  padding: '6px 10px',
  fontSize: '12px',
  outline: 'none',
  color: '#374151',
  background: 'transparent',
}
const moveBtn: React.CSSProperties = {
  width: '100%',
  padding: '5px 0',
  fontSize: '13px',
  fontWeight: 500,
  color: '#2563eb',
  background: '#f0f6ff',
  border: 'none',
  borderBottom: '1px solid #c5d0e0',
  cursor: 'pointer',
  transition: 'background 0.15s',
}
const actionBtn: React.CSSProperties = {
  border: '1px solid #2563eb',
  borderRadius: '4px',
  padding: '6px 22px',
  fontSize: '13px',
  color: '#2563eb',
  background: 'white',
  cursor: 'pointer',
  fontWeight: 500,
  transition: 'all 0.15s',
}

export default function MeasurementSelectionPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  // FS13.1.1 — Import Study Name
  const [studyName,     setStudyName]     = useState(searchParams.get('study') || STUDY_LIST[0])
  const [studyDropOpen, setStudyDropOpen] = useState(false)

  // FS13.1.4 — Linked Colony Data Only
  const [linkedColony, setLinkedColony] = useState(false)

  // Determine source type from study (simplified — in prod from API)
  const isCsv = studyName.startsWith('Demo')
  const allMeasurements = isCsv ? CSV_DOMAINS : PRISTIMA_MEASUREMENTS

  // Shuttle state
  const [available,    setAvailable]    = useState<string[]>(allMeasurements)
  const [selected,     setSelected]     = useState<string[]>([])
  const [filterLeft,   setFilterLeft]   = useState('')
  const [filterRight,  setFilterRight]  = useState('')

  // FS13.1.3 — Domain mapping for Generalized Measurement items
  const [genDomains,   setGenDomains]   = useState<Record<string, string>>({})

  // Highlight states for single-click visual feedback
  const [hlLeft,  setHlLeft]  = useState<string | null>(null)
  const [hlRight, setHlRight] = useState<string | null>(null)

  // Filtered lists
  const filteredAvailable = useMemo(() =>
    available.filter(m => m.toLowerCase().includes(filterLeft.toLowerCase())),
    [available, filterLeft]
  )
  const filteredSelected = useMemo(() =>
    selected.filter(m => m.toLowerCase().includes(filterRight.toLowerCase())),
    [selected, filterRight]
  )

  // FS13.2.5 — Single click left → move to right
  const moveToRight = (item: string) => {
    setHlLeft(item)
    setTimeout(() => setHlLeft(null), 300)
    setAvailable(p => p.filter(x => x !== item))
    setSelected(p => [...p, item])
    setFilterLeft('')
  }

  // FS13.2.5 — Single click right → move to left
  const moveToLeft = (item: string) => {
    setHlRight(item)
    setTimeout(() => setHlRight(null), 300)
    setSelected(p => p.filter(x => x !== item))
    setAvailable(p => {
      // re-insert in original order
      const orig = allMeasurements
      const next = [...p, item]
      return orig.filter(m => next.includes(m))
    })
    setFilterRight('')
    // Remove domain mapping when deselected
    setGenDomains(p => { const n = {...p}; delete n[item]; return n })
  }

  // FS13.2.4 — Move all left → right
  const moveAll = () => {
    setSelected(p => {
      const existing = new Set(p)
      return [...p, ...available.filter(x => !existing.has(x))]
    })
    setAvailable([])
    setFilterLeft('')
  }

  // FS13.2.6 — Remove all right → left
  const removeAll = () => {
    const orig = allMeasurements
    setAvailable(orig.filter(m => !selected.some(s => s === m) ? true : true))
    setAvailable(orig)
    setSelected([])
    setGenDomains({})
    setFilterRight('')
  }

  // Reset when study changes
  const changeStudy = (name: string) => {
    setStudyName(name)
    setStudyDropOpen(false)
    const csv = name.startsWith('Demo')
    const all = csv ? CSV_DOMAINS : PRISTIMA_MEASUREMENTS
    setAvailable(all)
    setSelected([])
    setGenDomains({})
    setFilterLeft('')
    setFilterRight('')
  }

  // FS13.2.1 — Done
  const handleDone = () => {
    // In production: POST selected measurements + genDomains to API
    console.log('Saving measurements:', selected, 'Domain mappings:', genDomains)
    navigate('/setup/load')
  }

  // FS13.2.2 — Cancel
  const handleCancel = () => navigate('/setup/load')

  const isGeneralized = (m: string) =>
    m === 'Generalized Measurement' || m.toLowerCase().includes('generalized')

  return (
    <div className="min-h-screen" style={{ background: '#f0f4f8' }}>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px' }}>

        {/* Page title */}
        <div style={{ textAlign: 'center', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 20 }}>
          Study-Measurement Selection
        </div>

        {/* ── Top bar: Import Study Name + Linked Colony Data Only ────────── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 32, marginBottom: 20, flexWrap: 'wrap' }}>

          {/* FS13.1.1 — Import Study Name */}
          <div style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
            <div style={{
              background: '#e8eef7', border: '1px solid #c5d0e0',
              borderRadius: '4px 0 0 4px', padding: '6px 14px',
              fontSize: 13, fontWeight: 500, color: '#374151', whiteSpace: 'nowrap',
            }}>
              Import Study Name
            </div>
            <button
              onClick={() => setStudyDropOpen(v => !v)}
              style={{
                border: '1px solid #c5d0e0', borderLeft: 'none',
                borderRadius: '0 4px 4px 0', padding: '6px 28px 6px 12px',
                fontSize: 13, color: '#111827', background: 'white',
                cursor: 'pointer', outline: 'none', minWidth: 160,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
              }}
            >
              <span>{studyName}</span>
              <ChevronDown size={14} style={{ transform: studyDropOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s', color: '#6b7280' }}/>
            </button>
            {studyDropOpen && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, right: 0,
                background: 'white', border: '1px solid #c5d0e0', borderTop: 'none',
                zIndex: 50, maxHeight: 200, overflowY: 'auto',
                boxShadow: '0 4px 12px rgba(0,0,0,0.10)',
              }}>
                {STUDY_LIST.map(s => (
                  <div key={s} onClick={() => changeStudy(s)}
                    style={{
                      padding: '7px 14px', fontSize: 13, cursor: 'pointer',
                      background: studyName === s ? '#dbeafe' : 'white',
                      color: studyName === s ? '#1d4ed8' : '#111827',
                    }}
                    onMouseEnter={e => { if (studyName !== s) (e.currentTarget as HTMLElement).style.background = '#eff6ff' }}
                    onMouseLeave={e => { if (studyName !== s) (e.currentTarget as HTMLElement).style.background = 'white' }}
                  >
                    {s}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* FS13.1.4 — Linked Colony Data Only */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
            <div style={{
              background: '#e8eef7', border: '1px solid #c5d0e0',
              borderRadius: '4px 0 0 4px', padding: '6px 14px',
              fontSize: 13, fontWeight: 500, color: '#374151', whiteSpace: 'nowrap',
            }}>
              Linked Colony Data Only
            </div>
            <div style={{
              border: '1px solid #c5d0e0', borderLeft: 'none',
              borderRadius: '0 4px 4px 0', padding: '6px 10px',
              background: 'white', display: 'flex', alignItems: 'center',
            }}>
              <input
                type="checkbox"
                checked={linkedColony}
                onChange={e => setLinkedColony(e.target.checked)}
                style={{ width: 14, height: 14, accentColor: '#2563eb', cursor: 'pointer' }}
              />
            </div>
          </div>
        </div>

        {/* ── Column headers ────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 24, marginBottom: 4 }}>
          <div style={{ flex: 1, textAlign: 'center', fontSize: 12, color: '#b91c1c', fontWeight: 500 }}>
            Available Measurement
          </div>
          <div style={{ flex: 1, textAlign: 'center', fontSize: 12, color: '#374151', fontWeight: 500 }}>
            Selected Measurement
          </div>
        </div>

        {/* ── Shuttle panels ────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 24, height: 360 }}>

          {/* ── LEFT panel — Available ────────────────────────────────────── */}
          <div style={panelBox}>
            {/* FS13.2.3 — Filter left */}
            <input
              value={filterLeft}
              onChange={e => setFilterLeft(e.target.value)}
              placeholder="Filter"
              style={filterInp}
            />
            {/* FS13.2.4 — Move all */}
            <button
              onClick={moveAll}
              style={moveBtn}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#dbeafe'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = '#f0f6ff'}
            >
              Move all
            </button>
            {/* List */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {filteredAvailable.length === 0 ? (
                <div style={{ padding: '12px 10px', fontSize: 12, color: '#9ca3af', textAlign: 'center' }}>
                  {filterLeft ? 'No matches' : 'All measurements selected'}
                </div>
              ) : filteredAvailable.map(m => (
                <div
                  key={m}
                  onClick={() => moveToRight(m)}
                  style={{
                    padding: '5px 10px', fontSize: 13, cursor: 'pointer',
                    color: m === 'Body Weights' ? '#b91c1c' : '#111827',
                    background: hlLeft === m ? '#dbeafe' : 'white',
                    borderBottom: '1px solid #f3f4f6',
                    transition: 'background 0.1s',
                    userSelect: 'none',
                  }}
                  onMouseEnter={e => { if (hlLeft !== m) (e.currentTarget as HTMLElement).style.background = '#eff6ff' }}
                  onMouseLeave={e => { if (hlLeft !== m) (e.currentTarget as HTMLElement).style.background = 'white' }}
                >
                  {m}
                </div>
              ))}
            </div>
            <div style={{ padding: '4px 10px', fontSize: 11, color: '#9ca3af', borderTop: '1px solid #f3f4f6', background: '#fafafa' }}>
              {available.length} available
            </div>
          </div>

          {/* ── RIGHT panel — Selected ────────────────────────────────────── */}
          <div style={panelBox}>
            {/* FS13.2.3 — Filter right */}
            <input
              value={filterRight}
              onChange={e => setFilterRight(e.target.value)}
              placeholder="Filter"
              style={filterInp}
            />
            {/* FS13.2.6 — Remove all */}
            <button
              onClick={removeAll}
              style={moveBtn}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#dbeafe'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = '#f0f6ff'}
            >
              Remove all
            </button>
            {/* List */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {filteredSelected.length === 0 ? (
                <div style={{ padding: '12px 10px', fontSize: 12, color: '#9ca3af', textAlign: 'center' }}>
                  {filterRight ? 'No matches' : 'No measurements selected'}
                </div>
              ) : filteredSelected.map(m => (
                <div key={m} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  {/* FS13.2.5 — Click to move back left */}
                  <div
                    onClick={() => moveToLeft(m)}
                    style={{
                      padding: '5px 10px', fontSize: 13, cursor: 'pointer',
                      color: '#111827',
                      background: hlRight === m ? '#fee2e2' : 'white',
                      transition: 'background 0.1s',
                      userSelect: 'none',
                    }}
                    onMouseEnter={e => { if (hlRight !== m) (e.currentTarget as HTMLElement).style.background = '#fff1f2' }}
                    onMouseLeave={e => { if (hlRight !== m) (e.currentTarget as HTMLElement).style.background = 'white' }}
                  >
                    {m}
                  </div>

                  {/* FS13.1.3 — Domain dropdown for Generalized Measurement */}
                  {isGeneralized(m) && (
                    <div style={{ padding: '3px 10px 6px 10px', display: 'flex', alignItems: 'center', gap: 8, background: '#f8fafc' }}>
                      <span style={{ fontSize: 11, color: '#6b7280', whiteSpace: 'nowrap' }}>Domain:</span>
                      <select
                        value={genDomains[m] || ''}
                        onChange={e => setGenDomains(p => ({ ...p, [m]: e.target.value }))}
                        onClick={e => e.stopPropagation()}
                        style={{
                          border: '1px solid #c5d0e0', borderRadius: 3,
                          padding: '2px 6px', fontSize: 11, color: '#374151',
                          background: 'white', cursor: 'pointer', outline: 'none',
                        }}
                      >
                        {GENERALIZED_DOMAINS.map(d => (
                          <option key={d} value={d}>{d === '' ? '(Empty — skip loading)' : d}</option>
                        ))}
                      </select>
                      <span style={{ fontSize: 10, color: '#9ca3af' }}>
                        {genDomains[m] ? `→ ${genDomains[m]} domain` : '(not loaded)'}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div style={{ padding: '4px 10px', fontSize: 11, color: '#9ca3af', borderTop: '1px solid #f3f4f6', background: '#fafafa' }}>
              {selected.length} selected
            </div>
          </div>
        </div>

        {/* FS13.1.4 note */}
        {linkedColony && (
          <div style={{ marginTop: 12, padding: '8px 14px', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 6, fontSize: 12, color: '#92400e' }}>
            <strong>Linked Colony Data Only:</strong> Only linked colony data for selected measurements will be loaded to this study.
          </div>
        )}

        {/* FS13.1.3 note for generalized measurements */}
        {selected.some(m => isGeneralized(m)) && (
          <div style={{ marginTop: 8, padding: '8px 14px', background: '#eff6ff', border: '1px solid #93c5fd', borderRadius: 6, fontSize: 12, color: '#1e40af' }}>
            <strong>Generalized Measurement domains:</strong> Select a domain for each Generalized Measurement.
            Allowed domains: VS, EG, LB, CL, RE, CV and custom domains (XY, XZ, XV…).
            If set to Empty, the measurement will not be loaded.
          </div>
        )}

        {/* ── Done / Cancel ────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 24 }}>
          <button
            onClick={handleDone}
            style={actionBtn}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#2563eb'; (e.currentTarget as HTMLButtonElement).style.color = 'white' }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'white'; (e.currentTarget as HTMLButtonElement).style.color = '#2563eb' }}
          >
            Done
          </button>
          <button
            onClick={handleCancel}
            style={{ ...actionBtn, border: '1px solid #6b7280', color: '#6b7280' }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#f3f4f6' }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'white' }}
          >
            cancel
          </button>
        </div>
      </div>
    </div>
  )
}
