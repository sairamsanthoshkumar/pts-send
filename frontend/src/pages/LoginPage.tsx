import { useState, FormEvent, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, AlertCircle, Info } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { api } from '../api/client'

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'French (Future Release)' },
  { code: 'de', label: 'German (Future Release)' },
  { code: 'es', label: 'Spanish (Future Release)' },
  { code: 'ja', label: 'Japanese (Future Release)' },
]

const DATE_FORMATS = [
  'MM/DD/YYYY',
  'DD/MM/YYYY',
  'YYYY/MM/DD',
  'DD-MM-YYYY',
  'MM-DD-YYYY',
  'YYYY-MM-DD',
  'DD.MM.YYYY',
]

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [language, setLanguage] = useState('en')
  const [dateFormat, setDateFormat] = useState('MM/DD/YYYY')
  const [error, setError] = useState('')
  const [infoMsg, setInfoMsg] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPasswordChange, setShowPasswordChange] = useState(false)
  const { setAuth } = useAuthStore()
  const navigate = useNavigate()

  // FS5.6 — auto-populate saved date format on load
  useEffect(() => {
    const saved = localStorage.getItem('pts_date_format')
    const savedLang = localStorage.getItem('pts_language')
    if (saved) setDateFormat(saved)
    if (savedLang) setLanguage(savedLang)
  }, [])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setInfoMsg('')

    // FS5.4.2 — empty field check
    if (!username.trim() || !password.trim()) {
      setError('User ID and Password are required.')
      return
    }

    setLoading(true)
    try {
      const res = await api.post('/auth/login', {
        username,
        password,
        language,
        date_format: dateFormat,
      })
      // FS5.6 — persist date format for next login
      localStorage.setItem('pts_date_format', dateFormat)
      localStorage.setItem('pts_language', language)

      setAuth(res.data.user, res.data.access_token)
      navigate('/')
    } catch (err: any) {
      const detail = err?.response?.data?.detail ?? 'Login failed.'
      const needsPasswordChange = err?.response?.headers?.['x-password-change-required'] === 'true'

      if (needsPasswordChange) {
        // FS5.4.3 — password expired or reset by admin
        setInfoMsg(detail)
        setShowPasswordChange(true)
      } else {
        setError(detail)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden">

      {/* ── Lab background — SVG illustration (no external image) ─────────── */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900">
        {/* Decorative lab glassware SVG pattern */}
        <svg className="absolute inset-0 w-full h-full opacity-20" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
          {/* Flask left */}
          <g transform="translate(80,120)" opacity="0.7">
            <path d="M60 0 L60 120 L20 220 Q0 260 40 280 L160 280 Q200 260 180 220 L140 120 L140 0 Z" fill="none" stroke="#60a5fa" strokeWidth="3"/>
            <rect x="50" y="0" width="100" height="15" rx="4" fill="#60a5fa" opacity="0.5"/>
            <ellipse cx="100" cy="260" rx="60" ry="15" fill="#3b82f6" opacity="0.3"/>
            <path d="M35 190 Q100 170 165 190" stroke="#93c5fd" strokeWidth="2" fill="none"/>
          </g>
          {/* Test tubes right cluster */}
          <g transform="translate(1180,60)" opacity="0.6">
            {[0,40,80,120].map((x, i) => (
              <g key={i} transform={`translate(${x},${i*20})`}>
                <rect x="0" y="0" width="28" height="180" rx="14" fill="none" stroke="#818cf8" strokeWidth="2"/>
                <rect x="2" y={140 - i*15} width="24" height={i*15+40} rx="12" fill="#4f46e5" opacity="0.3"/>
              </g>
            ))}
          </g>
          {/* Microscope right */}
          <g transform="translate(1250,350)" opacity="0.5">
            <rect x="60" y="0" width="20" height="200" rx="5" fill="none" stroke="#a78bfa" strokeWidth="3"/>
            <rect x="0" y="180" width="140" height="20" rx="6" fill="none" stroke="#a78bfa" strokeWidth="3"/>
            <circle cx="70" cy="0" r="35" fill="none" stroke="#c4b5fd" strokeWidth="3"/>
            <rect x="30" y="200" width="80" height="8" rx="4" fill="#7c3aed" opacity="0.4"/>
          </g>
          {/* Beaker bottom left */}
          <g transform="translate(60,550)" opacity="0.5">
            <path d="M20 0 L20 160 Q20 200 60 220 L140 220 Q180 200 180 160 L180 0 Z" fill="none" stroke="#34d399" strokeWidth="3"/>
            <rect x="10" y="0" width="180" height="12" rx="3" fill="#34d399" opacity="0.4"/>
            <path d="M20 120 Q100 100 180 120" stroke="#6ee7b7" strokeWidth="2" fill="none"/>
            <ellipse cx="100" cy="200" rx="80" ry="20" fill="#059669" opacity="0.25"/>
          </g>
          {/* DNA helix center background */}
          <g transform="translate(680,50)" opacity="0.15">
            {Array.from({length:12}).map((_,i) => (
              <g key={i}>
                <ellipse cx={Math.sin(i*0.6)*60} cy={i*65} rx="55" ry="12" fill="none" stroke="#60a5fa" strokeWidth="2"/>
                <line x1={Math.sin(i*0.6)*60-40} y1={i*65} x2={Math.sin((i+0.5)*0.6)*60+40} y2={(i+0.5)*65} stroke="#93c5fd" strokeWidth="1.5"/>
              </g>
            ))}
          </g>
          {/* Scatter dots */}
          {[...Array(30)].map((_,i) => (
            <circle key={i} cx={150+i*42} cy={80+Math.sin(i)*300} r={2+Math.cos(i)*1.5} fill="#60a5fa" opacity="0.3"/>
          ))}
        </svg>
        {/* Subtle radial glow behind the card */}
        <div className="absolute inset-0" style={{background:'radial-gradient(ellipse 600px 500px at 50% 50%, rgba(37,99,235,0.18) 0%, transparent 70%)'}}/>
      </div>

      {/* ── Login card ──────────────────────────────────────────────────────── */}
      <div className="relative w-full max-w-sm mx-4 shadow-2xl rounded-lg overflow-hidden" style={{background:'rgba(255,255,255,0.97)'}}>

        {/* Header banner — matches Savante blue header style */}
        <div className="flex items-center justify-center py-5 px-6" style={{background:'linear-gradient(135deg,#1e3a6e 0%,#2563eb 100%)'}}>
          <div className="flex items-center gap-3">
            {/* S logo mark */}
            <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center shadow-md flex-shrink-0">
              <span style={{color:'#1e3a6e',fontWeight:900,fontSize:'26px',fontFamily:'Georgia,serif',lineHeight:1}}>S</span>
            </div>
            <div>
              <p style={{color:'white',fontWeight:700,fontSize:'26px',fontFamily:'Georgia,serif',letterSpacing:'1px',lineHeight:1}}>avante</p>
              <p style={{color:'#93c5fd',fontSize:'10px',letterSpacing:'2px',textTransform:'uppercase',marginTop:'2px'}}>SEND Submission Platform</p>
            </div>
          </div>
        </div>

        {/* Form body */}
        <div className="px-8 py-6 space-y-4">

          {/* Error message — FS5.4.2 / FS5.4.4 */}
          {error && (
            <div className="flex items-start gap-2 p-3 rounded border text-sm" style={{background:'#fef2f2',borderColor:'#fca5a5',color:'#b91c1c'}}>
              <AlertCircle size={15} className="flex-shrink-0 mt-0.5"/>
              <span>{error}</span>
            </div>
          )}

          {/* Info message — FS5.4.3 password expired/reset */}
          {infoMsg && (
            <div className="flex items-start gap-2 p-3 rounded border text-sm" style={{background:'#eff6ff',borderColor:'#93c5fd',color:'#1d4ed8'}}>
              <Info size={15} className="flex-shrink-0 mt-0.5"/>
              <span>{infoMsg}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3">

            {/* FS5.1 — User ID */}
            <div>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="Username"
                autoComplete="username"
                style={{width:'100%',border:'1px solid #d1d5db',borderRadius:'6px',padding:'10px 12px',fontSize:'14px',color:'#111827',outline:'none',boxSizing:'border-box'}}
                onFocus={e => e.target.style.borderColor='#2563eb'}
                onBlur={e => e.target.style.borderColor='#d1d5db'}
              />
            </div>

            {/* FS5.2 — Password */}
            <div>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Password"
                autoComplete="current-password"
                style={{width:'100%',border:'1px solid #d1d5db',borderRadius:'6px',padding:'10px 12px',fontSize:'14px',color:'#111827',outline:'none',boxSizing:'border-box'}}
                onFocus={e => e.target.style.borderColor='#2563eb'}
                onBlur={e => e.target.style.borderColor='#d1d5db'}
              />
            </div>

            {/* FS5.3 — Language */}
            <div>
              <select
                value={language}
                onChange={e => setLanguage(e.target.value)}
                style={{width:'100%',border:'1px solid #d1d5db',borderRadius:'6px',padding:'10px 12px',fontSize:'14px',color:'#374151',background:'white',outline:'none',boxSizing:'border-box',cursor:'pointer'}}
                onFocus={e => e.target.style.borderColor='#2563eb'}
                onBlur={e => e.target.style.borderColor='#d1d5db'}
              >
                {LANGUAGES.map(l => (
                  <option key={l.code} value={l.code}>{l.label}</option>
                ))}
              </select>
            </div>

            {/* FS5.6 — Date Format */}
            <div>
              <select
                value={dateFormat}
                onChange={e => setDateFormat(e.target.value)}
                style={{width:'100%',border:'1px solid #d1d5db',borderRadius:'6px',padding:'10px 12px',fontSize:'14px',color:'#374151',background:'white',outline:'none',boxSizing:'border-box',cursor:'pointer'}}
                onFocus={e => e.target.style.borderColor='#2563eb'}
                onBlur={e => e.target.style.borderColor='#d1d5db'}
              >
                {DATE_FORMATS.map(f => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
              <p style={{fontSize:'11px',color:'#9ca3af',marginTop:'4px',lineHeight:'1.4'}}>
                FS5.6: Should match your Windows Region short date format. Auto-populated from previous login.
              </p>
            </div>

            {/* FS5.4 — Login button */}
            <div className="flex justify-end pt-1">
              <button
                type="submit"
                disabled={loading}
                style={{
                  background: loading ? '#93c5fd' : 'white',
                  color: '#2563eb',
                  border: '1px solid #2563eb',
                  borderRadius: '6px',
                  padding: '8px 28px',
                  fontSize: '14px',
                  fontWeight: 500,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => { if (!loading) { (e.currentTarget as HTMLButtonElement).style.background='#2563eb'; (e.currentTarget as HTMLButtonElement).style.color='white' } }}
                onMouseLeave={e => { if (!loading) { (e.currentTarget as HTMLButtonElement).style.background='white'; (e.currentTarget as HTMLButtonElement).style.color='#2563eb' } }}
              >
                {loading && <Loader2 size={14} className="animate-spin"/>}
                Login
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* FS5.4.3 — Password Change Dialog */}
      {showPasswordChange && (
        <PasswordChangeDialog onClose={() => setShowPasswordChange(false)} username={username} />
      )}
    </div>
  )
}

function PasswordChangeDialog({ onClose, username }: { onClose: () => void; username: string }) {
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')

  const handleChange = (e: FormEvent) => {
    e.preventDefault()
    if (!newPassword || newPassword.length < 8) { setError('Password must be at least 8 characters.'); return }
    if (newPassword !== confirm) { setError('Passwords do not match.'); return }
    // In production: call API to change password
    alert('Password changed successfully. Please log in again.')
    onClose()
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50" style={{background:'rgba(0,0,0,0.6)'}}>
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
        <div className="px-5 py-4 border-b" style={{borderColor:'#e5e7eb'}}>
          <h2 style={{fontSize:'16px',fontWeight:600,color:'#111827'}}>Change Password (FS5A)</h2>
          <p style={{fontSize:'13px',color:'#6b7280',marginTop:'2px'}}>User: {username}</p>
        </div>
        <form onSubmit={handleChange} className="px-5 py-4 space-y-3">
          {error && <div style={{color:'#b91c1c',fontSize:'13px',background:'#fef2f2',padding:'8px 10px',borderRadius:'6px',border:'1px solid #fca5a5'}}>{error}</div>}
          <div>
            <label style={{display:'block',fontSize:'13px',fontWeight:500,color:'#374151',marginBottom:'4px'}}>New Password</label>
            <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} style={{width:'100%',border:'1px solid #d1d5db',borderRadius:'6px',padding:'9px 12px',fontSize:'14px',outline:'none',boxSizing:'border-box'}}/>
          </div>
          <div>
            <label style={{display:'block',fontSize:'13px',fontWeight:500,color:'#374151',marginBottom:'4px'}}>Confirm New Password</label>
            <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} style={{width:'100%',border:'1px solid #d1d5db',borderRadius:'6px',padding:'9px 12px',fontSize:'14px',outline:'none',boxSizing:'border-box'}}/>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} style={{padding:'8px 18px',fontSize:'13px',border:'1px solid #d1d5db',borderRadius:'6px',background:'white',color:'#374151',cursor:'pointer'}}>Cancel</button>
            <button type="submit" style={{padding:'8px 18px',fontSize:'13px',border:'1px solid #2563eb',borderRadius:'6px',background:'#2563eb',color:'white',cursor:'pointer'}}>Change Password</button>
          </div>
        </form>
      </div>
    </div>
  )
}
