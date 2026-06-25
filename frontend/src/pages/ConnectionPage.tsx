/**
 * FS7 — Study Setup: Connection Page
 * Choose Connector Type → Configure → Test / Mapping / Save and Connect / Save / Cancel
 */
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, XCircle, Loader2, AlertCircle, Info } from 'lucide-react'
import { api } from '../api/client'

// ── Types ─────────────────────────────────────────────────────────────────────
type ConnectorType = 'PRISTIMA_API' | 'OPENVMS' | 'CSV' | 'SEND_DATASET'

interface Connector {
  id: string
  name: string
  connector_type: ConnectorType
  url?: string
  user_id_field?: string
  is_active: boolean
}

const CONNECTOR_TYPES: { value: ConnectorType; label: string }[] = [
  { value: 'PRISTIMA_API',  label: 'Pristima API' },                              // FS7.1.6
  { value: 'OPENVMS',       label: 'OpenVMS PATH/TOX SYSTEM Offload files' },    // FS7.1.7
  { value: 'CSV',           label: 'CSV Data Source' },                           // FS7.1.8
  { value: 'SEND_DATASET',  label: 'SEND Dataset' },                              // FS7.1.9
]

const NEW_CONN = '__new__'

// ── URL placeholder per type ───────────────────────────────────────────────────
const URL_PLACEHOLDER: Record<ConnectorType, string> = {
  PRISTIMA_API:  'http://ptsapplication/PtsAPI/servlet/PtsAPIServlet',
  OPENVMS:       '\\\\server\\share\\studies  or  /mnt/openvms/studies',
  CSV:           'C:\\StudyData\\  or  /data/studies/',
  SEND_DATASET:  'C:\\SENDDatasets\\  or  /data/send/',
}

// ── Savante form field style ──────────────────────────────────────────────────
const labelStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center',
  background: '#e8eef7', borderRight: '1px solid #c5d0e0',
  padding: '8px 16px', fontWeight: 500, fontSize: '13px',
  color: '#374151', minWidth: '140px', flexShrink: 0,
}
const inputStyle: React.CSSProperties = {
  flex: 1, border: 'none', outline: 'none',
  padding: '8px 12px', fontSize: '13px', color: '#111827',
  background: 'white',
}
const rowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center',
  border: '1px solid #c5d0e0', borderBottom: 'none',
}
const btnBase: React.CSSProperties = {
  padding: '7px 22px', fontSize: '13px', borderRadius: '4px',
  border: '1px solid #2563eb', cursor: 'pointer', fontWeight: 500,
  transition: 'all 0.15s',
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function ConnectionPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [connectorType, setConnectorType] = useState<ConnectorType>('PRISTIMA_API')
  const [selectedName, setSelectedName]   = useState<string>('')
  const [newName, setNewName]             = useState('')
  const [url, setUrl]                     = useState('')
  const [userId, setUserId]               = useState('')
  const [password, setPassword]           = useState('')
  const [popup, setPopup]                 = useState<{ success: boolean; message: string } | null>(null)
  const [dirty, setDirty]                 = useState(false)

  // FS7.2.1 — load connectors for chosen type
  const { data: connectors = [] } = useQuery<Connector[]>({
    queryKey: ['connectors', connectorType],
    queryFn: () => api.get(`/connections/?connector_type=${connectorType}`).then(r => r.data),
  })

  // When connector selection changes, populate fields
  useEffect(() => {
    if (selectedName === NEW_CONN || selectedName === '') {
      setUrl(''); setUserId(''); setPassword('')
    } else {
      const found = connectors.find(c => c.name === selectedName)
      if (found) {
        setUrl(found.url ?? '')
        setUserId(found.user_id_field ?? '')
        setPassword('')
      }
    }
    setDirty(false)
  }, [selectedName, connectors])

  // Reset when connector type changes
  useEffect(() => {
    setSelectedName('')
    setNewName('')
    setUrl('')
    setUserId('')
    setPassword('')
    setPopup(null)
    setDirty(false)
  }, [connectorType])

  const isNew         = selectedName === NEW_CONN
  const isPristimaAPI = connectorType === 'PRISTIMA_API'
  const currentId     = connectors.find(c => c.name === selectedName)?.id

  // ── FS7.3.1 Test ─────────────────────────────────────────────────────────
  const testMutation = useMutation({
    mutationFn: () => api.post('/connections/test', {
      connector_type: connectorType,
      url: url || undefined,
      user_id_field: userId || undefined,
      password_field: password || undefined,
    }).then(r => r.data),
    onSuccess: (data) => setPopup({ success: data.success, message: data.message }),
    onError: () => setPopup({ success: false, message: 'Test failed. Please check connection details.' }),
  })

  // ── FS7.3.4 Save ─────────────────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: () => {
      const name = isNew ? newName.trim() : selectedName
      if (!name) throw new Error('Connection Name is required.')
      if (!url.trim()) throw new Error('URL is required (FS7.2.3).')
      if (isPristimaAPI && !userId.trim()) throw new Error('User ID is required for Pristima API (FS7.2.4).')

      if (isNew) {
        return api.post('/connections/', {
          name, connector_type: connectorType, url,
          user_id_field: userId || undefined,
          password_field: password || undefined,
        }).then(r => r.data)
      } else {
        return api.patch(`/connections/${currentId}`, {
          url, user_id_field: userId || undefined,
          password_field: password || undefined,
        }).then(r => r.data)
      }
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['connectors', connectorType] })
      setSelectedName(data.name)
      setDirty(false)
      setPopup({ success: true, message: `Connection "${data.name}" saved successfully.` })
    },
    onError: (err: any) => {
      setPopup({ success: false, message: err?.message ?? err?.response?.data?.detail ?? 'Save failed.' })
    },
  })

  // ── FS7.3.3 Save and Connect ──────────────────────────────────────────────
  const saveAndConnectMutation = useMutation({
    mutationFn: async () => {
      // Save first if dirty or new
      let savedId = currentId
      if (dirty || isNew) {
        const saved = await saveMutation.mutateAsync() as any
        savedId = saved.id
      }
      if (!savedId) throw new Error('Please save the connection first.')
      return api.post(`/connections/${savedId}/save-and-connect`).then(r => r.data)
    },
    onSuccess: (data) => {
      setPopup({ success: true, message: data.message })
      setTimeout(() => navigate(data.redirect ?? '/studies'), 1200)
    },
    onError: (err: any) => {
      setPopup({ success: false, message: err?.message ?? err?.response?.data?.detail ?? 'Connection failed.' })
    },
  })

  // ── FS7.3.5 Cancel ────────────────────────────────────────────────────────
  const handleCancel = () => {
    setSelectedName('')
    setNewName('')
    setUrl('')
    setUserId('')
    setPassword('')
    setPopup(null)
    setDirty(false)
  }

  const isLoading = testMutation.isPending || saveMutation.isPending || saveAndConnectMutation.isPending

  return (
    <div className="min-h-screen" style={{ background: '#f0f4f8' }}>
      <div className="max-w-3xl mx-auto pt-8 px-4">

        {/* Page card — white box matching Savante UI */}
        <div className="bg-white rounded border" style={{ borderColor: '#c5d0e0', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>

          {/* ── Section 1: Choose Connector Type ─────────────────────────── */}
          <div className="px-6 pt-5 pb-4">
            <div className="text-center text-sm font-medium mb-3 pb-1" style={{ color: '#374151', borderBottom: '1px solid #e5e7eb' }}>
              Choose Connector Type
            </div>
            <select
              value={connectorType}
              onChange={e => setConnectorType(e.target.value as ConnectorType)}
              style={{ width: '100%', border: '1px solid #c5d0e0', borderRadius: '4px', padding: '8px 12px', fontSize: '14px', color: '#111827', background: 'white', cursor: 'pointer', outline: 'none' }}
            >
              {CONNECTOR_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          <div style={{ borderTop: '1px solid #e5e7eb' }} />

          {/* ── Section 2: Connection Administrator ──────────────────────── */}
          <div className="px-6 py-4">
            <div className="text-center text-sm font-medium mb-4 pb-1" style={{ color: '#374151', borderBottom: '1px solid #e5e7eb' }}>
              Savante - Connection Administrator
            </div>

            {/* FS7.2.1 — Connector Name dropdown */}
            <div style={{ ...rowStyle }}>
              <div style={labelStyle}>Connector Name</div>
              <select
                value={selectedName}
                onChange={e => setSelectedName(e.target.value)}
                style={{ ...inputStyle, cursor: 'pointer' }}
              >
                <option value="">— Select —</option>
                {connectors.map(c => (
                  <option key={c.id} value={c.name}>{c.name}</option>
                ))}
                <option value={NEW_CONN}>New Connection</option>
              </select>
            </div>

            {/* FS7.2.2 — New Connection Name (only when New Connection chosen) */}
            {isNew && (
              <div style={{ ...rowStyle }}>
                <div style={labelStyle}>New Connection Name</div>
                <input
                  type="text"
                  value={newName}
                  onChange={e => { setNewName(e.target.value); setDirty(true) }}
                  placeholder="Enter new connection name"
                  style={inputStyle}
                />
              </div>
            )}

            {/* FS7.2.3 — URL */}
            <div style={{ ...rowStyle }}>
              <div style={labelStyle}>URL</div>
              <input
                type="text"
                value={url}
                onChange={e => { setUrl(e.target.value); setDirty(true) }}
                placeholder={URL_PLACEHOLDER[connectorType]}
                style={inputStyle}
              />
            </div>

            {/* FS7.2.4/7.2.5 — User ID + Password (Pristima API only) */}
            {isPristimaAPI && (
              <>
                <div style={{ ...rowStyle }}>
                  <div style={labelStyle}>User ID</div>
                  <input
                    type="text"
                    value={userId}
                    onChange={e => { setUserId(e.target.value); setDirty(true) }}
                    placeholder=""
                    style={inputStyle}
                  />
                </div>
                <div style={{ ...rowStyle, borderBottom: '1px solid #c5d0e0' }}>
                  <div style={labelStyle}>Password</div>
                  <input
                    type="password"
                    value={password}
                    onChange={e => { setPassword(e.target.value); setDirty(true) }}
                    placeholder=""
                    style={inputStyle}
                  />
                </div>
              </>
            )}
            {!isPristimaAPI && (
              <div style={{ borderBottom: '1px solid #c5d0e0', height: 0 }} />
            )}

            {/* URL hint per connector type */}
            <p style={{ fontSize: '11px', color: '#9ca3af', marginTop: '6px', lineHeight: '1.5' }}>
              {connectorType === 'PRISTIMA_API'
                ? 'FS7.2.3: Enter the Pristima API server URL for the zone being accessed.'
                : 'FS7.2.3: Enter the directory path where studies are stored in subdirectories named by STUDYID.'}
            </p>
          </div>

          {/* ── Action Buttons ─────────────────────────────────────────────── */}
          <div className="px-6 pb-6 flex items-center justify-center gap-3 flex-wrap">

            {/* FS7.3.1 Test */}
            <button
              onClick={() => testMutation.mutate()}
              disabled={isLoading}
              style={{ ...btnBase, background: 'white', color: '#2563eb' }}
              onMouseEnter={e => { (e.currentTarget).style.background = '#eff6ff' }}
              onMouseLeave={e => { (e.currentTarget).style.background = 'white' }}
            >
              {testMutation.isPending ? <Loader2 size={13} className="animate-spin inline mr-1"/> : null}
              Test
            </button>

            {/* FS7.3.2 Mapping */}
            <button
              onClick={() => navigate('/setup/mapping')}
              disabled={isLoading || !selectedName || selectedName === NEW_CONN}
              style={{ ...btnBase, background: 'white', color: '#2563eb', opacity: (!selectedName || selectedName === NEW_CONN) ? 0.5 : 1 }}
              onMouseEnter={e => { if (!isLoading && selectedName && selectedName !== NEW_CONN) (e.currentTarget).style.background = '#eff6ff' }}
              onMouseLeave={e => { (e.currentTarget).style.background = 'white' }}
            >
              Mapping
            </button>

            {/* FS7.3.3 Save and Connect */}
            <button
              onClick={() => saveAndConnectMutation.mutate()}
              disabled={isLoading}
              style={{ ...btnBase, background: '#2563eb', color: 'white', border: '1px solid #1d4ed8' }}
              onMouseEnter={e => { (e.currentTarget).style.background = '#1d4ed8' }}
              onMouseLeave={e => { (e.currentTarget).style.background = '#2563eb' }}
            >
              {saveAndConnectMutation.isPending ? <Loader2 size={13} className="animate-spin inline mr-1"/> : null}
              Save and Connect
            </button>

            {/* FS7.3.4 Save */}
            <button
              onClick={() => saveMutation.mutate()}
              disabled={isLoading}
              style={{ ...btnBase, background: 'white', color: '#2563eb' }}
              onMouseEnter={e => { (e.currentTarget).style.background = '#eff6ff' }}
              onMouseLeave={e => { (e.currentTarget).style.background = 'white' }}
            >
              {saveMutation.isPending ? <Loader2 size={13} className="animate-spin inline mr-1"/> : null}
              Save
            </button>

            {/* FS7.3.5 Cancel */}
            <button
              onClick={handleCancel}
              disabled={isLoading}
              style={{ ...btnBase, background: 'white', color: '#2563eb' }}
              onMouseEnter={e => { (e.currentTarget).style.background = '#eff6ff' }}
              onMouseLeave={e => { (e.currentTarget).style.background = 'white' }}
            >
              Cancel
            </button>
          </div>
        </div>

        {/* FS35 — DB unavailable notice */}
        <div className="mt-4 flex items-start gap-2 p-3 rounded border text-sm" style={{ background: '#fffbeb', borderColor: '#fcd34d', color: '#92400e' }}>
          <Info size={15} className="flex-shrink-0 mt-0.5" />
          <span>
            <strong>FS35 — Fresh Installation:</strong> If the database is unavailable or not yet configured, login will display "Connection is not available. Please try again later." See the System Migration page for deployment procedures.
          </span>
        </div>
      </div>

      {/* ── Popup modal (Test / Save / Error results) ──────────────────────── */}
      {popup && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: 'rgba(0,0,0,0.45)' }}>
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-sm mx-4 overflow-hidden border" style={{ borderColor: '#c5d0e0' }}>
            {/* Header */}
            <div
              className="px-5 py-3 flex items-center gap-2"
              style={{ background: popup.success ? '#f0fdf4' : '#fef2f2', borderBottom: '1px solid #e5e7eb' }}
            >
              {popup.success
                ? <CheckCircle2 size={18} style={{ color: '#16a34a' }} />
                : <XCircle size={18} style={{ color: '#dc2626' }} />}
              <span style={{ fontWeight: 600, fontSize: '14px', color: popup.success ? '#15803d' : '#b91c1c' }}>
                {popup.success ? 'Success' : 'Error'}
              </span>
            </div>
            {/* Body */}
            <div className="px-5 py-4">
              <p style={{ fontSize: '13px', color: '#374151', lineHeight: '1.6' }}>{popup.message}</p>
            </div>
            {/* Footer */}
            <div className="px-5 pb-4 flex justify-end">
              <button
                onClick={() => setPopup(null)}
                style={{ ...btnBase, padding: '6px 24px', background: '#2563eb', color: 'white', border: '1px solid #1d4ed8' }}
                onMouseEnter={e => { (e.currentTarget).style.background = '#1d4ed8' }}
                onMouseLeave={e => { (e.currentTarget).style.background = '#2563eb' }}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
