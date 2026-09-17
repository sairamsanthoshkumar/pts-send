import { useState, useRef, useMemo, ChangeEvent, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Calendar, ChevronDown, CheckSquare, Square, X, AlertCircle, Loader2, Search } from 'lucide-react'
import { getStudies, loadStudyFromConnector, uploadFile } from '../api/client'
import type { Study } from '../types'

const CONNECTION_LABELS = {
  CSV: 'CSV Data Source',
  SEND_DATASET: 'SEND Dataset',
  OPENVMS: 'OpenVMS',
  PRISTIMA_API: 'Pristima API',
} as const

type ConnectionType = keyof typeof CONNECTION_LABELS

type StudyRow = {
  id: string
  pts_study_name: string
  original_study_name: string
  protocol_status?: string
  study_status: string
  connection_type: ConnectionType
  created_at: string
}

const STATUS_OPTIONS = ['Setup', 'DataLoaded', 'Validated', 'Approved', 'Locked'] as const
const connectionTypeFilters: ConnectionType[] = ['CSV', 'SEND_DATASET', 'OPENVMS']

const inputCls = 'border border-gray-300 rounded px-2 py-1 text-sm text-gray-700 focus:outline-none focus:border-blue-400 bg-white'
const btn = 'border border-blue-500 text-blue-600 bg-white hover:bg-blue-50 px-3 py-1 text-sm rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap'
const thCls = 'px-3 py-2 text-xs font-semibold text-center bg-blue-700 text-white border-r border-blue-600 whitespace-nowrap'
const tdCls = 'px-3 py-2 text-xs text-center border-b border-gray-200 align-top'

function AlertPopup({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background:'rgba(0,0,0,0.45)' }}>
      <div className="bg-white rounded border shadow-2xl w-full max-w-sm mx-4" style={{ borderColor:'#c5d0e0' }}>
        <div className="px-5 py-3 border-b flex items-center gap-2" style={{ background:'#fef3cd', borderColor:'#c5d0e0' }}>
          <AlertCircle size={16} className="text-yellow-600"/>
          <span className="font-semibold text-sm text-gray-800">PtsSEND</span>
        </div>
        <div className="px-5 py-4"><p className="text-sm text-gray-700">{message}</p></div>
        <div className="px-5 pb-4 flex justify-end">
          <button onClick={onClose} className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-6 py-1 rounded border border-blue-700">OK</button>
        </div>
      </div>
    </div>
  )
}

function NewStudyPopup({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void
  onSubmit: (name: string, protocolNumber: string) => void
}) {
  const [studyName, setStudyName] = useState('')
  const [protocolNumber, setProtocolNumber] = useState('')
  const [error, setError] = useState('')

  const handleOK = () => {
    if (!studyName.trim()) { setError('Please enter a Study Name.'); return }
    if (!protocolNumber.trim()) { setError('Please enter a Protocol Number.'); return }
    onSubmit(studyName.trim(), protocolNumber.trim())
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background:'rgba(0,0,0,0.45)' }}>
      <div className="bg-white rounded shadow-2xl border w-full max-w-md mx-4" style={{ borderColor:'#c5d0e0' }}>
        <div className="px-6 pt-6 pb-2">
          <p className="text-base font-semibold text-slate-800">New Study</p>
          <p className="text-xs text-slate-500 mt-1">Create a new CSV Data Source study and upload CSV files after creation.</p>
        </div>
        <div className="px-6 py-4 space-y-4">
          {error && (
            <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div>
          )}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">PtsSEND Study Name</label>
            <input value={studyName} onChange={e => { setStudyName(e.target.value); setError('') }} className={inputCls} placeholder="Study Name" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Protocol Number</label>
            <input value={protocolNumber} onChange={e => { setProtocolNumber(e.target.value); setError('') }} className={inputCls} placeholder="Protocol Number" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Connection Type</label>
            <div className="rounded border border-gray-300 bg-gray-100 px-3 py-2 text-sm text-gray-700">CSV Data Source</div>
          </div>
        </div>
        <div className="px-6 pb-6 flex justify-end gap-3">
          <button onClick={onCancel} className="border border-slate-400 text-slate-700 bg-white hover:bg-slate-50 px-4 py-1 rounded text-sm">Cancel</button>
          <button onClick={handleOK} className="bg-blue-600 text-white hover:bg-blue-700 px-4 py-1 rounded text-sm">Create Study</button>
        </div>
      </div>
    </div>
  )
}

export default function StudyLoadPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const [searchName, setSearchName] = useState('')
  const [searchValue, setSearchValue] = useState('')
  const [jobFrom, setJobFrom] = useState('')
  const [jobTo, setJobTo] = useState('')
  const [statusFilter, setStatusFilter] = useState<string[]>([])
  const [latest10, setLatest10] = useState(false)
  const [showIndividual, setShowIndividual] = useState(true)
  const [statusOpen, setStatusOpen] = useState(false)
  const [connectionFilter, setConnectionFilter] = useState<ConnectionType | 'ALL'>('ALL')
  const [loginConnector, setLoginConnector] = useState(false)
  const [alertMessage, setAlertMessage] = useState<string | null>(null)
  const [selectedStudyId, setSelectedStudyId] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  const location = useLocation()
  const qs = useMemo(() => new URLSearchParams(location.search), [location.search])
  const connectorUrl = qs.get('connector_url') || ''
  const connectorTypeParam = (qs.get('connector_type') || '') as ConnectionType | ''

  useEffect(() => {
    if (connectorUrl) {
      setLoginConnector(true)
    }
    if (connectorTypeParam && connectorTypeParam in CONNECTION_LABELS) {
      setConnectionFilter(connectorTypeParam as ConnectionType)
    }
  }, [connectorUrl, connectorTypeParam])

  const studiesQuery = useQuery({
    queryKey: ['studies', connectorUrl, loginConnector],
    queryFn: () => getStudies((loginConnector && connectorUrl) ? { connector_url: connectorUrl } : undefined).then(res => res.data),
    refetchOnWindowFocus: false,
  })

  const handleNewStudy = async () => {
    if (!connectorUrl) {
      setAlertMessage('No connector URL is configured. Use Save and Connect first.')
      return
    }
    try {
      const loadedStudyNames = rows.map(row => row.original_study_name || row.pts_study_name).filter(Boolean)
      const response = await loadStudyFromConnector({
        connector_url: connectorUrl,
        connector_type: connectorTypeParam || 'CSV',
        connector_name: qs.get('connector_name') || undefined,
        loaded_study_names: loadedStudyNames,
      })
      queryClient.invalidateQueries({ queryKey: ['studies', connectorUrl, loginConnector] })
      setAlertMessage(`New study loaded: ${response.data.pts_study_name}`)
    } catch (error: any) {
      const detail = error?.response?.data?.detail
      if (detail === 'No new study available to load') {
        setAlertMessage(detail)
      } else if (detail) {
        setAlertMessage(detail)
      } else {
        setAlertMessage('Unable to load new study. Please try again.')
      }
    }
  }

  const rows: StudyRow[] = useMemo(() => {
    const raw = studiesQuery.data || []
    return raw
      .map((study: Study) => ({
        id: study.id,
        pts_study_name: study.pts_study_name,
        original_study_name: study.import_study_name || study.pts_study_name,
        protocol_status: study.protocol_status,
        study_status: study.study_status,
        connection_type: ((study.connection_type as ConnectionType) in CONNECTION_LABELS
          ? (study.connection_type as ConnectionType)
          : 'CSV'),
        created_at: study.created_at,
      }))
      .filter((row: StudyRow) => {
        if (searchName && !row.pts_study_name.toLowerCase().includes(searchName.toLowerCase()) && !row.original_study_name.toLowerCase().includes(searchName.toLowerCase())) {
          return false
        }
        if (connectionFilter !== 'ALL' && row.connection_type !== connectionFilter) {
          return false
        }
        if (loginConnector && connectorUrl) {
          // backend filtered by connector_url already; keep client-side safety
          // no-op here, but could filter by original_study_name including connector identifier
        }
        return true
      })
  }, [studiesQuery.data, searchName, connectionFilter])

  const selectedRow = rows.find(row => row.id === selectedStudyId)

  const handleSelect = (id: string) => setSelectedStudyId(prev => prev === id ? null : id)

  const handleSearch = () => setSearchName(searchValue.trim())
  const handleClearSearch = () => { setSearchValue(''); setSearchName('') }

  const triggerUpload = () => {
    if (!selectedRow) { setAlertMessage('Select a single CSV study first.'); return }
    if (selectedRow.connection_type !== 'CSV') { setAlertMessage('CSV upload is only available for CSV Data Source studies.'); return }
    fileInputRef.current?.click()
  }

  const onFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file || !selectedRow) return
    setUploading(true)
    try {
      await uploadFile(selectedRow.id, file, 'AUTO')
      setAlertMessage('CSV file uploaded successfully. Refresh the study list if needed.')
    } catch {
      setAlertMessage('CSV upload failed. Please try again.')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const statusColor = (status: string) => {
    switch (status) {
      case 'Validated': return '#15803d'
      case 'Approved': return '#0f766e'
      case 'Locked': return '#7c3aed'
      case 'DataLoaded': return '#1d4ed8'
      case 'Setup': return '#c2410c'
      default: return '#374151'
    }
  }

  return (
    <div className="min-h-screen" style={{ background:'#f0f4f8' }}>
      <div className="px-4 py-4">
        <div className="text-center text-sm font-medium text-gray-700 mb-3">PtsSEND - Load Study</div>

        <div className="bg-white border border-gray-300 rounded px-4 py-4 mb-3" style={{ boxShadow:'0 1px 4px rgba(0,0,0,0.06)' }}>
          <div className="flex flex-wrap items-start gap-2">
            <input value={searchValue} onChange={e => setSearchValue(e.target.value)} placeholder="Study Name" className={inputCls} style={{ width: 180 }} />
            <div className="flex items-center gap-1">
              <input value={jobFrom} onChange={e => setJobFrom(e.target.value)} type="date" className={inputCls} style={{ width:130 }} />
              <Calendar size={14} className="text-gray-400 flex-shrink-0" />
            </div>
            <div className="flex items-center gap-1">
              <input value={jobTo} onChange={e => setJobTo(e.target.value)} type="date" className={inputCls} style={{ width:130 }} />
              <Calendar size={14} className="text-gray-400 flex-shrink-0" />
            </div>
            <div className="relative" style={{ minWidth:140 }}>
              <button onClick={() => setStatusOpen(v=>!v)} className={`${inputCls} flex items-center gap-1 justify-between`} style={{ minWidth:140 }}>
                <span className="truncate text-sm" style={{ maxWidth:100 }}>{statusFilter.length===0?'Status':statusFilter.join(', ')}</span>
                <ChevronDown size={12} className="text-gray-500" />
              </button>
              {statusOpen && (
                <div className="absolute top-full left-0 mt-1 bg-white border border-gray-300 rounded shadow-lg z-30 min-w-[160px]">
                  {STATUS_OPTIONS.map(s => (
                    <label key={s} className="flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-blue-50 cursor-pointer">
                      <input type="checkbox" checked={statusFilter.includes(s)} onChange={()=>setStatusFilter(p=>p.includes(s)?p.filter(x=>x!==s):[...p,s])} className="accent-blue-600" />{s}
                    </label>
                  ))}
                </div>
              )}
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <input type="checkbox" checked={latest10} onChange={e => setLatest10(e.target.checked)} className="accent-blue-600" /> Latest 10 Job Created
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <input type="checkbox" checked={showIndividual} onChange={e => setShowIndividual(e.target.checked)} className="accent-blue-600" /> Show Individual Jobs
            </label>
            <label className="flex items-center gap-2 ml-2 text-sm text-gray-600">
              <input type="checkbox" checked={loginConnector} onChange={e => setLoginConnector(e.target.checked)} className="accent-blue-600" /> Only studies for the login connector
            </label>
            <div className="ml-auto flex items-center gap-2">
              <button onClick={handleSearch} className={`${btn} flex items-center gap-1`}><Search size={13} />Search</button>
              <button onClick={handleClearSearch} className={btn}>Clear</button>
            </div>
          </div>
          
          <div className="flex flex-wrap items-center gap-2 mt-4">
            <button onClick={handleNewStudy} className={btn}>New Study</button>
            <button onClick={() => selectedRow ? navigate(`/studies/${selectedRow.id}`) : setAlertMessage('Select a study to view details.')} className={btn}>Edit Study</button>
            <button onClick={() => {
              if (!selectedRow) { setAlertMessage('Select a study to delete.'); return }
              // simple client-side delete via API
              if (confirm(`Delete study "${selectedRow.pts_study_name}"?`)) {
                // call backend delete if available
                fetch(`/api/v1/studies/${selectedRow.id}`, { method: 'DELETE' }).then(() => {
                  queryClient.invalidateQueries({ queryKey: ['studies'] })
                  setSelectedStudyId(null)
                }).catch(()=>setAlertMessage('Delete failed.'))
              }
            }} className={btn}>Delete</button>
            <button onClick={triggerUpload} disabled={!selectedRow || selectedRow.connection_type !== 'CSV' || uploading} className={btn}>Select Files to Load</button>
            <button onClick={() => setAlertMessage('Start Load triggered for selected study.')} className={btn}>Start Load</button>
            <button onClick={() => setAlertMessage('Abort Load requested.')} className={btn} disabled={!selectedRow}>Abort Load</button>
          </div>
        </div>

        <div className="border border-gray-300 rounded overflow-hidden bg-white" style={{ boxShadow:'0 1px 4px rgba(0,0,0,0.06)' }}>
          <div className="overflow-x-auto" style={{ maxHeight:'calc(100vh - 260px)' }}>
            <table className="w-full bg-white" style={{ borderCollapse:'collapse', minWidth:900 }}>
              <thead style={{ position:'sticky', top:0, zIndex:10 }}>
                <tr>
                  <th className={thCls} style={{ width:36 }} />
                  <th className={thCls}>Original Study Name</th>
                  <th className={thCls}>PtsSEND Study Name</th>
                  <th className={thCls}>Source</th>
                  <th className={thCls}>Protocol Status</th>
                  <th className={thCls}>Study Status</th>
                  <th className={thCls}>Created</th>
                </tr>
              </thead>
              <tbody>
                {studiesQuery.isLoading ? (
                  <tr><td colSpan={7} className="text-center py-10 text-sm text-gray-500"><Loader2 size={18} className="animate-spin mx-auto" />Loading studies...</td></tr>
                ) : studiesQuery.isError ? (
                  <tr><td colSpan={7} className="text-center py-10 text-sm text-red-600">Unable to load studies. Please refresh or try again.</td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-10 text-sm text-gray-500">{searchName ? 'No studies match the search criteria.' : 'No studies have been loaded yet. Click New Study to create one.'}</td></tr>
                ) : rows.map((row, idx) => {
                  const selected = row.id === selectedStudyId
                  return (
                    <tr key={row.id} onClick={() => handleSelect(row.id)} className={`hover:bg-blue-50 transition-colors ${selected ? 'bg-blue-50' : idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}`} style={{ cursor: 'pointer' }}>
                      <td className={tdCls}>
                        <button onClick={e => { e.stopPropagation(); handleSelect(row.id) }} className="text-blue-600">
                          {selected ? <CheckSquare size={16} /> : <Square size={16} />}
                        </button>
                      </td>
                      <td className={tdCls}>
                        <button className="text-blue-600 hover:underline text-xs" onClick={e => { e.stopPropagation(); navigate(`/studies/${row.id}`) }}>{row.original_study_name}</button>
                      </td>
                      <td className={tdCls}>{row.pts_study_name}</td>
                      <td className={tdCls}>{CONNECTION_LABELS[row.connection_type]}</td>
                      <td className={tdCls}>{row.protocol_status || '—'}</td>
                      <td className={tdCls}><span style={{ color: statusColor(row.study_status), fontWeight: 600 }}>{row.study_status}</span></td>
                      <td className={tdCls}>{new Date(row.created_at).toLocaleDateString()}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {rows.length > 0 && (
            <div className="px-3 py-2 text-xs text-gray-500 border-t border-gray-200 bg-slate-50 flex flex-wrap gap-4 items-center">
              <span>{rows.length} study{rows.length !== 1 ? 'ies' : 'y'} displayed</span>
              {selectedRow && <span className="text-blue-600">Selected: {selectedRow.pts_study_name}</span>}
              {uploading && <span className="text-blue-700 flex items-center gap-1"><Loader2 size={12} className="animate-spin" />Uploading…</span>}
            </div>
          )}
        </div>
      </div>

      {alertMessage && <AlertPopup message={alertMessage} onClose={() => setAlertMessage(null)} />}
      <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={onFileChange} />
    </div>
  )
}
