import { useState, FormEvent, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, AlertCircle, Info } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { api } from '../api/client'

const LANGUAGES = [
  { code:'en', label:'English' },
  { code:'fr', label:'French (Future Release)' },
  { code:'de', label:'German (Future Release)' },
  { code:'es', label:'Spanish (Future Release)' },
  { code:'ja', label:'Japanese (Future Release)' },
]
const DATE_FORMATS = ['MM/DD/YYYY','DD/MM/YYYY','YYYY/MM/DD','DD-MM-YYYY','MM-DD-YYYY','YYYY-MM-DD','DD.MM.YYYY']

const inp: React.CSSProperties = { width:'100%', border:'1px solid #d1d5db', borderRadius:'6px', padding:'10px 12px', fontSize:'14px', color:'#111827', outline:'none', boxSizing:'border-box' }

export default function LoginPage() {
  const [email,      setEmail]      = useState('admin@ptssend.com')
  const [password,   setPassword]   = useState('admin123')
  const [language,   setLanguage]   = useState('en')
  const [dateFormat, setDateFormat] = useState('MM/DD/YYYY')
  const [error,      setError]      = useState('')
  const [infoMsg,    setInfoMsg]    = useState('')
  const [loading,    setLoading]    = useState(false)
  const [showPwdChg, setShowPwdChg] = useState(false)
  const { setAuth } = useAuthStore()
  const navigate = useNavigate()

  useEffect(() => {
    const d = localStorage.getItem('pts_date_format')
    const l = localStorage.getItem('pts_language')
    if (d) setDateFormat(d)
    if (l) setLanguage(l)
  }, [])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(''); setInfoMsg('')
    if (!email.trim() || !password.trim()) { setError('Email and Password are required.'); return }
    setLoading(true)
    try {
      const res = await api.post('/auth/login', {
        email: email.trim().toLowerCase(), password, language, date_format: dateFormat,
      })
      localStorage.setItem('pts_date_format', dateFormat)
      localStorage.setItem('pts_language',    language)
      setAuth(res.data.user, res.data.access_token)
      navigate('/')
    } catch (err: any) {
      const detail = err?.response?.data?.detail ?? 'Login failed.'
      if (err?.response?.headers?.['x-password-change-required'] === 'true') { setInfoMsg(detail); setShowPwdChg(true) }
      else setError(detail)
    } finally { setLoading(false) }
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* Lab background */}
      <div className="absolute inset-0" style={{ background:'linear-gradient(135deg,#0f2044 0%,#1a3a6e 40%,#0f2044 100%)' }}>
        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" style={{ opacity:0.18 }}>
          <g transform="translate(80,140)"><path d="M55 0 L55 110 L10 210 Q-10 255 35 275 L165 275 Q210 255 190 210 L145 110 L145 0 Z" fill="none" stroke="#60a5fa" strokeWidth="3"/><rect x="45" y="0" width="110" height="14" rx="3" fill="#60a5fa" opacity="0.6"/><path d="M25 185 Q100 165 175 185" stroke="#93c5fd" strokeWidth="2" fill="none"/></g>
          <g transform="translate(1200,40)">{[0,45,90,135].map((x,i)=><g key={i} transform={`translate(${x},${i*18})`}><rect x="0" y="0" width="30" height="190" rx="15" fill="none" stroke="#818cf8" strokeWidth="2"/><rect x="2" y={145-i*12} width="26" height={i*12+45} rx="13" fill="#4f46e5" opacity="0.25"/></g>)}</g>
          <g transform="translate(1260,370)"><rect x="55" y="0" width="22" height="190" rx="5" fill="none" stroke="#a78bfa" strokeWidth="3"/><rect x="0" y="175" width="130" height="18" rx="6" fill="none" stroke="#a78bfa" strokeWidth="3"/><circle cx="66" cy="0" r="38" fill="none" stroke="#c4b5fd" strokeWidth="3"/></g>
          <g transform="translate(50,560)"><path d="M18 0 L18 155 Q18 195 58 215 L142 215 Q182 195 182 155 L182 0 Z" fill="none" stroke="#34d399" strokeWidth="3"/><rect x="8" y="0" width="186" height="12" rx="3" fill="#34d399" opacity="0.4"/></g>
          <g transform="translate(700,30)" opacity="0.5">{Array.from({length:14}).map((_,i)=><g key={i}><ellipse cx={Math.sin(i*0.55)*55} cy={i*60} rx="52" ry="11" fill="none" stroke="#60a5fa" strokeWidth="1.5"/><line x1={Math.sin(i*0.55)*55-38} y1={i*60} x2={Math.sin((i+0.5)*0.55)*55+38} y2={(i+0.5)*60} stroke="#93c5fd" strokeWidth="1.2"/></g>)}</g>
        </svg>
        <div className="absolute inset-0" style={{ background:'radial-gradient(ellipse 600px 500px at 50% 48%,rgba(37,99,235,0.15) 0%,transparent 70%)' }}/>
      </div>

      {/* Login card */}
      <div className="relative w-full max-w-sm mx-4 rounded-lg overflow-hidden shadow-2xl" style={{ background:'rgba(255,255,255,0.97)' }}>
        {/* Header */}
        <div className="flex items-center justify-center py-5 px-6 gap-3" style={{ background:'linear-gradient(135deg,#1e3a6e 0%,#2563eb 100%)' }}>
          <div className="w-11 h-11 rounded-full bg-white flex items-center justify-center shadow-md flex-shrink-0">
            <span style={{ color:'#1e3a6e', fontWeight:900, fontSize:'24px', fontFamily:'Georgia,serif', lineHeight:1 }}>P</span>
          </div>
          <div>
            <p style={{ color:'white', fontWeight:700, fontSize:'22px', letterSpacing:'0.5px', lineHeight:1 }}>PtsSEND</p>
            <p style={{ color:'#93c5fd', fontSize:'10px', letterSpacing:'2px', textTransform:'uppercase', marginTop:'2px' }}>SEND Submission Platform</p>
          </div>
        </div>

        {/* Form */}
        <div className="px-8 py-6 space-y-3">
          {error   && <div className="flex items-start gap-2 p-3 rounded border text-sm" style={{ background:'#fef2f2', borderColor:'#fca5a5', color:'#b91c1c' }}><AlertCircle size={15} className="flex-shrink-0 mt-0.5"/><span>{error}</span></div>}
          {infoMsg && <div className="flex items-start gap-2 p-3 rounded border text-sm" style={{ background:'#eff6ff', borderColor:'#93c5fd', color:'#1d4ed8' }}><Info size={15} className="flex-shrink-0 mt-0.5"/><span>{infoMsg}</span></div>}

          <form onSubmit={handleSubmit} className="space-y-3">
            {/* FS5.1 Email */}
            <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="Email" autoComplete="email"
              style={inp} onFocus={e=>e.target.style.borderColor='#2563eb'} onBlur={e=>e.target.style.borderColor='#d1d5db'}/>

            {/* FS5.2 Password */}
            <input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Password" autoComplete="current-password"
              style={inp} onFocus={e=>e.target.style.borderColor='#2563eb'} onBlur={e=>e.target.style.borderColor='#d1d5db'}/>

            {/* FS5.3 Language */}
            <select value={language} onChange={e=>setLanguage(e.target.value)}
              style={{ ...inp, cursor:'pointer' }}
              onFocus={e=>e.target.style.borderColor='#2563eb'} onBlur={e=>e.target.style.borderColor='#d1d5db'}>
              {LANGUAGES.map(l=><option key={l.code} value={l.code}>{l.label}</option>)}
            </select>

            {/* FS5.6 Date Format */}
            <div>
              <select value={dateFormat} onChange={e=>setDateFormat(e.target.value)}
                style={{ ...inp, cursor:'pointer' }}
                onFocus={e=>e.target.style.borderColor='#2563eb'} onBlur={e=>e.target.style.borderColor='#d1d5db'}>
                {DATE_FORMATS.map(f=><option key={f} value={f}>{f}</option>)}
              </select>
              <p style={{ fontSize:'11px', color:'#9ca3af', marginTop:'3px' }}>Match your Windows Region short date format. Auto-saved for next login.</p>
            </div>

            <div className="flex justify-end pt-1">
              <button type="submit" disabled={loading}
                style={{ background:'white', color:'#2563eb', border:'1px solid #2563eb', borderRadius:'6px', padding:'8px 28px', fontSize:'14px', fontWeight:500, cursor:loading?'not-allowed':'pointer', display:'flex', alignItems:'center', gap:'6px' }}
                onMouseEnter={e=>{if(!loading){const b=e.currentTarget as HTMLButtonElement;b.style.background='#2563eb';b.style.color='white'}}}
                onMouseLeave={e=>{if(!loading){const b=e.currentTarget as HTMLButtonElement;b.style.background='white';b.style.color='#2563eb'}}}>
                {loading&&<Loader2 size={14} className="animate-spin"/>}Login
              </button>
            </div>
          </form>

          <div style={{ padding:'10px 12px', background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:'6px', fontSize:'12px', color:'#64748b' }}>
            <p style={{ fontWeight:600, color:'#475569', marginBottom:'4px' }}>Demo credentials:</p>
            <p>admin@ptssend.com / admin123</p>
            <p>analyst@ptssend.com / analyst123</p>
          </div>
        </div>
      </div>

      {showPwdChg && <PasswordChangeDialog onClose={()=>setShowPwdChg(false)} email={email}/>}
    </div>
  )
}

function PasswordChangeDialog({ onClose, email }: { onClose: ()=>void; email: string }) {
  const [newPwd, setNewPwd] = useState(''); const [confirm, setConfirm] = useState(''); const [err, setErr] = useState('')
  const handle = (e: FormEvent) => { e.preventDefault(); if (newPwd.length<8){setErr('Min 8 characters.');return} if(newPwd!==confirm){setErr('Passwords do not match.');return} alert('Password changed. Please log in.'); onClose() }
  return (
    <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background:'rgba(0,0,0,0.6)' }}>
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
        <div className="px-5 py-4 border-b"><h2 style={{ fontSize:'16px', fontWeight:600 }}>Change Password</h2><p style={{ fontSize:'13px', color:'#6b7280' }}>{email}</p></div>
        <form onSubmit={handle} className="px-5 py-4 space-y-3">
          {err && <div style={{ color:'#b91c1c', fontSize:'13px', background:'#fef2f2', padding:'8px 10px', borderRadius:'6px' }}>{err}</div>}
          <div><label style={{ display:'block', fontSize:'13px', fontWeight:500, marginBottom:'4px' }}>New Password</label><input type="password" value={newPwd} onChange={e=>setNewPwd(e.target.value)} style={{ width:'100%', border:'1px solid #d1d5db', borderRadius:'6px', padding:'9px 12px', fontSize:'14px', outline:'none', boxSizing:'border-box' as any }}/></div>
          <div><label style={{ display:'block', fontSize:'13px', fontWeight:500, marginBottom:'4px' }}>Confirm Password</label><input type="password" value={confirm} onChange={e=>setConfirm(e.target.value)} style={{ width:'100%', border:'1px solid #d1d5db', borderRadius:'6px', padding:'9px 12px', fontSize:'14px', outline:'none', boxSizing:'border-box' as any }}/></div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} style={{ padding:'8px 18px', fontSize:'13px', border:'1px solid #d1d5db', borderRadius:'6px', background:'white', cursor:'pointer' }}>Cancel</button>
            <button type="submit" style={{ padding:'8px 18px', fontSize:'13px', border:'1px solid #2563eb', borderRadius:'6px', background:'#2563eb', color:'white', cursor:'pointer' }}>Change</button>
          </div>
        </form>
      </div>
    </div>
  )
}
