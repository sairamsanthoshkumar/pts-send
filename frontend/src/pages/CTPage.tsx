import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BookOpen, Tag } from 'lucide-react'
import { getCTCodelists } from '../api/client'

interface CTTerm { code: string; label: string }
interface Codelist { codelist: string; terms: CTTerm[] }

export default function CTPage() {
  const [selected, setSelected] = useState<string | null>(null)
  const { data: codelists } = useQuery({ queryKey:['ct-codelists'], queryFn: () => getCTCodelists().then(r => r.data as Codelist[]) })

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">FS24/FS25 — Controlled Terminology</h1>
        <p className="text-slate-400 mt-1">CDISC SEND Controlled Terminology version and codelists</p>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="card p-0 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-800 flex items-center gap-2"><BookOpen size={15} className="text-brand-400"/><h3 className="text-sm font-medium text-slate-300">Codelists</h3></div>
          <div className="divide-y divide-slate-800">
            {(codelists ?? []).map(cl => (
              <button key={cl.codelist} onClick={() => setSelected(cl.codelist)} className={`w-full text-left px-4 py-3 text-sm transition-colors ${selected===cl.codelist ? 'bg-brand-600/20 text-brand-400' : 'text-slate-300 hover:bg-slate-800/50'}`}>
                <span className="font-mono">{cl.codelist}</span>
                <span className="text-xs text-slate-500 ml-2">({cl.terms.length} terms)</span>
              </button>
            ))}
          </div>
        </div>

        <div className="col-span-2 card p-0 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-800 flex items-center gap-2"><Tag size={15} className="text-brand-400"/><h3 className="text-sm font-medium text-slate-300">{selected ? `Terms — ${selected}` : 'Select a codelist'}</h3></div>
          {!selected ? (
            <div className="px-5 py-12 text-center text-slate-600 text-sm">Select a codelist on the left to view its CDISC SEND submission terms.</div>
          ) : (
            <table className="w-full">
              <thead><tr className="border-b border-slate-800">{['Submission Code','Label'].map(h => <th key={h} className="text-left text-xs font-medium text-slate-500 uppercase px-5 py-3">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-slate-800">
                {(codelists ?? []).find(c => c.codelist===selected)?.terms.map(t => (
                  <tr key={t.code} className="hover:bg-slate-800/30">
                    <td className="px-5 py-3 font-mono text-sm text-brand-400">{t.code}</td>
                    <td className="px-5 py-3 text-sm text-slate-300">{t.label}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
