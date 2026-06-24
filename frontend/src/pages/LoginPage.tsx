import { useState, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Dna, Loader2 } from 'lucide-react'
import { login } from '../api/client'
import { useAuthStore } from '../store/authStore'

export default function LoginPage() {
  const [email, setEmail] = useState('admin@ptssend.com')
  const [password, setPassword] = useState('admin123')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { setAuth } = useAuthStore()
  const navigate = useNavigate()

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault(); setError(''); setLoading(true)
    try { const res = await login(email, password); setAuth(res.data.user, res.data.access_token); navigate('/') }
    catch { setError('Invalid email or password') }
    finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[linear-gradient(rgba(41,82,245,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(41,82,245,0.03)_1px,transparent_1px)] bg-[size:48px_48px]" />
      <div className="relative w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-brand-600 mb-4 shadow-lg shadow-brand-600/30"><Dna size={28} className="text-white"/></div>
          <h1 className="text-2xl font-bold text-white">PtsSEND</h1>
          <p className="text-slate-400 text-sm mt-1">Pristima Savante SEND Platform</p>
        </div>
        <div className="card">
          <h2 className="text-lg font-semibold text-white mb-6">Sign in</h2>
          {error && <div className="mb-4 p-3 rounded-lg bg-red-900/30 border border-red-800 text-red-400 text-sm">{error}</div>}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div><label className="block text-sm font-medium text-slate-300 mb-1.5">Email</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} required className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"/></div>
            <div><label className="block text-sm font-medium text-slate-300 mb-1.5">Password</label><input type="password" value={password} onChange={e => setPassword(e.target.value)} required className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"/></div>
            <button type="submit" disabled={loading} className="btn-primary w-full py-2.5 flex items-center justify-center gap-2">{loading && <Loader2 size={16} className="animate-spin"/>}{loading ? 'Signing in…' : 'Sign in'}</button>
          </form>
          <div className="mt-4 p-3 rounded-lg bg-slate-800/50 text-xs text-slate-500 space-y-1"><p className="font-medium text-slate-400">Demo credentials:</p><p>admin@ptssend.com / admin123</p><p>analyst@ptssend.com / analyst123</p></div>
        </div>
      </div>
    </div>
  )
}
