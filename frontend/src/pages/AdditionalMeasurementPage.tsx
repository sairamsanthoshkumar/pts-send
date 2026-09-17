import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Download, Loader2, Pencil, Save, Trash2, Upload } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { exportRawMeasurements, getRawMeasurementConfig, getRawMeasurements, getSendDomains, getStudy, importRawMeasurements, updateRawMeasurement, deleteRawMeasurement } from '../api/client'

type MeasurementRow = { id: string; measurement_type: string; source_filename?: string; data: Record<string, string>; permissions: { can_edit: boolean; can_delete: boolean; editable_columns: string[]; reason?: string }; created_at: string; updated_at: string }

const inputClass = 'bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand-500'

export default function AdditionalMeasurementPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const supplementalFileRef = useRef<HTMLInputElement>(null)
  const [measurementType, setMeasurementType] = useState('')
  const [deleteDomainData, setDeleteDomainData] = useState(false)
  const [reasonForEdit, setReasonForEdit] = useState('')
  const [reasonForNew, setReasonForNew] = useState('')
  const [reasonForDelete, setReasonForDelete] = useState('')
  const [rTransformXptCommandFile, setRTransformXptCommandFile] = useState('')
  const [rTransformXlsxCommandFile, setRTransformXlsxCommandFile] = useState('')
  const [relatedFiles, setRelatedFiles] = useState<Record<string, string>>({ pooldef_file_name: '', relrec_cl_file_name: '', relrec_ma_file_name: '', relrec_mi_file_name: '', relrec_pm_file_name: '', relrec_tf_file_name: '', supp_file_name: '' })
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [selectedSupplementalFile, setSelectedSupplementalFile] = useState<File | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [message, setMessage] = useState('')
  const domainsQuery = useQuery({ queryKey: ['send-domains'], queryFn: () => getSendDomains().then(response => response.data as { code: string; label: string }[]) })
  const configQuery = useQuery({ queryKey: ['raw-measurement-config', id], queryFn: () => getRawMeasurementConfig(id!).then(response => response.data as { default_directory: string; r_transform_xpt_command_file: string; r_transform_xlsx_command_file: string }) })
  useEffect(() => { if (!measurementType && domainsQuery.data?.length) setMeasurementType(domainsQuery.data[0].code) }, [measurementType, domainsQuery.data])
  const studyQuery = useQuery({ queryKey: ['study', id], queryFn: () => getStudy(id!).then(response => response.data) })
  const rowsQuery = useQuery({ queryKey: ['raw-measurements', id], queryFn: () => getRawMeasurements(id!).then(response => response.data as MeasurementRow[]) })
  const rows = rowsQuery.data ?? []
  const columns = useMemo(() => Array.from(new Set(rows.flatMap(row => Object.keys(row.data)))), [rows])
  const supplementalAllowed = !['TS', 'TA', 'TE', 'TX'].includes(measurementType) && !(measurementType === 'BG' && !['CSV', 'SEND_DATASET'].includes(studyQuery.data?.connection_type))

  const importMutation = useMutation({
    mutationFn: (file: File) => importRawMeasurements(id!, file, selectedSupplementalFile, measurementType, deleteDomainData, reasonForEdit, reasonForNew, reasonForDelete, rTransformXptCommandFile, rTransformXlsxCommandFile, relatedFiles),
    onSuccess: response => { queryClient.invalidateQueries({ queryKey: ['raw-measurements', id] }); navigate('/studies') },
    onError: error => setMessage((error as any)?.response?.data?.detail ?? 'CSV import failed.'),
  })
  const updateMutation = useMutation({
    mutationFn: ({ rowId, data }: { rowId: string; data: Record<string, string> }) => updateRawMeasurement(id!, rowId, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['raw-measurements', id] }); setEditingId(null); setMessage('Row updated.') },
  })
  const deleteMutation = useMutation({
    mutationFn: (rowId: string) => deleteRawMeasurement(id!, rowId),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['raw-measurements', id] }); setMessage('Row deleted.') },
  })

  const downloadCsv = async () => {
    const response = await exportRawMeasurements(id!, measurementType)
    const url = URL.createObjectURL(response.data)
    const link = document.createElement('a'); link.href = url; link.download = `study_${id}_measurements.csv`; link.click(); URL.revokeObjectURL(url)
  }
  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) setSelectedFile(file)
    event.target.value = ''
  }
  const onSupplementalFileChange = (event: ChangeEvent<HTMLInputElement>) => { setSelectedSupplementalFile(event.target.files?.[0] ?? null); event.target.value = '' }
  const startEdit = (row: MeasurementRow) => { if (row.permissions.can_edit) { setEditingId(row.id); setDraft({ ...row.data }) } }

  if (studyQuery.isLoading) return <div className="p-8 text-slate-400">Loading study...</div>
  if (!studyQuery.data) return <div className="p-8 text-slate-400">Study not found.</div>

  return (
    <div className="p-8 space-y-5">
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Link to="/studies" className="hover:text-slate-300">Studies</Link><span>/</span>
        <button onClick={() => navigate(`/studies/${id}`)} className="hover:text-slate-300">{studyQuery.data.pts_study_name}</button><span>/</span>
        <span className="text-slate-300">Additional Measurement Data</span>
      </div>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div><h1 className="text-2xl font-bold text-white">Additional Measurement Data</h1><p className="text-sm text-slate-500 mt-1">Raw data for {studyQuery.data.pts_study_name}</p></div>
        <button onClick={() => navigate(`/studies/${id}`)} className="btn-secondary flex items-center gap-2"><ArrowLeft size={14}/>Back to Study</button>
      </div>
      <div className="card space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div><label className="block text-xs font-medium text-slate-400 mb-1.5">Domain</label><select value={measurementType} onChange={e => setMeasurementType(e.target.value)} className={`${inputClass} w-full`}>{(domainsQuery.data ?? []).map(domain => <option key={domain.code} value={domain.code}>{domain.code} — {domain.label}</option>)}</select></div>
          <div><label className="block text-xs font-medium text-slate-400 mb-1.5">Default directory</label><input value={configQuery.data?.default_directory ?? 'Loading...'} readOnly className={`${inputClass} w-full opacity-60 cursor-not-allowed`} title="CSVInputDir is controlled by server configuration" /></div>
          <div><label className="block text-xs font-medium text-slate-400 mb-1.5">R transform XPT command file</label><input value={rTransformXptCommandFile} onChange={e => setRTransformXptCommandFile(e.target.value)} placeholder={configQuery.data?.r_transform_xpt_command_file ?? 'Optional .bat/.cmd/.sh file'} className={`${inputClass} w-full`} /></div>
          <div><label className="block text-xs font-medium text-slate-400 mb-1.5">R transform XLSX command file</label><input value={rTransformXlsxCommandFile} onChange={e => setRTransformXlsxCommandFile(e.target.value)} placeholder={configQuery.data?.r_transform_xlsx_command_file ?? 'Optional .bat/.cmd/.sh file'} className={`${inputClass} w-full`} /></div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={deleteDomainData} onChange={e => setDeleteDomainData(e.target.checked)} className="accent-brand-500" /> Delete existing data for this domain first</label>
          <div><label className="block text-xs font-medium text-slate-400 mb-1.5">Reason for Edit</label><input value={reasonForEdit} onChange={e => setReasonForEdit(e.target.value)} className={`${inputClass} w-full`} /></div>
          <div><label className="block text-xs font-medium text-slate-400 mb-1.5">Reason for New</label><input value={reasonForNew} onChange={e => setReasonForNew(e.target.value)} className={`${inputClass} w-full`} /></div>
          <div><label className="block text-xs font-medium text-slate-400 mb-1.5">Reason for Delete</label><input value={reasonForDelete} onChange={e => setReasonForDelete(e.target.value)} className={`${inputClass} w-full`} /></div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {Object.entries({ pooldef_file_name: 'POOLDEF file name', relrec_cl_file_name: 'RELREC-CL file name', relrec_ma_file_name: 'RELREC-MA file name', relrec_mi_file_name: 'RELREC-MI file name', relrec_pm_file_name: 'RELREC-PM file name', relrec_tf_file_name: 'RELREC-TF file name', supp_file_name: 'SUPPxx file name' }).map(([key, label]) => <div key={key}><label className="block text-xs font-medium text-slate-400 mb-1.5">{label}</label><input value={relatedFiles[key]} onChange={e => setRelatedFiles({ ...relatedFiles, [key]: e.target.value })} placeholder="Optional .csv file" className={`${inputClass} w-full`} /></div>)}
        </div>
        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-800">
        <button onClick={() => fileRef.current?.click()} disabled={importMutation.isPending || !measurementType} className="btn-secondary flex items-center gap-2"><Upload size={14}/>Select CSV</button>
        <button onClick={() => supplementalFileRef.current?.click()} disabled={importMutation.isPending || !measurementType || !supplementalAllowed} className="btn-secondary flex items-center gap-2"><Upload size={14}/>Select SUPP{measurementType} CSV</button>
        <button onClick={() => selectedFile && importMutation.mutate(selectedFile)} disabled={!selectedFile || importMutation.isPending || !measurementType} className="btn-primary flex items-center gap-2"><Upload size={14}/>{importMutation.isPending ? 'Importing...' : 'Import from CSV'}</button>
        <button onClick={() => navigate('/studies')} disabled={importMutation.isPending} className="btn-secondary">Cancel</button>
        {selectedFile && <span className="text-sm text-slate-400">{selectedFile.name}</span>}
        {selectedSupplementalFile && <span className="text-sm text-slate-400">{selectedSupplementalFile.name}</span>}
        <button onClick={downloadCsv} disabled={!rows.length} className="btn-secondary flex items-center gap-2"><Download size={14}/>Export CSV</button>
        <input ref={fileRef} type="file" accept=".csv,.xpt,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={onFileChange} className="hidden" />
        <input ref={supplementalFileRef} type="file" accept=".csv,text/csv" onChange={onSupplementalFileChange} className="hidden" />
        {message && <span className="text-sm text-emerald-400">{message}</span>}
        </div>
      </div>
      <div className="card p-0 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between"><div><h2 className="text-sm font-medium text-slate-300">Raw measurement rows</h2><p className="text-xs text-slate-500 mt-1">{rows.length} row(s) · Edit values before SEND transformation</p></div></div>
        {rowsQuery.isLoading ? <div className="p-8 text-center text-slate-500"><Loader2 size={18} className="animate-spin mx-auto"/></div> : !rows.length ? <div className="p-10 text-center text-slate-600 text-sm">No additional measurement data has been imported.</div> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[760px]"><thead><tr className="border-b border-slate-800">{columns.map(column => <th key={column} className="text-left text-xs font-medium text-slate-500 uppercase px-4 py-3 whitespace-nowrap">{column}</th>)}<th className="text-left text-xs font-medium text-slate-500 uppercase px-4 py-3">Type</th><th className="px-4 py-3" /></tr></thead><tbody className="divide-y divide-slate-800">
            {rows.map(row => <tr key={row.id} className="hover:bg-slate-800/30">
              {columns.map(column => <td key={column} className="px-4 py-2 text-sm text-slate-300 whitespace-nowrap">{editingId === row.id ? <input disabled={!row.permissions.editable_columns.includes(column.toUpperCase())} value={draft[column] ?? ''} onChange={e => setDraft({ ...draft, [column]: e.target.value })} className={`${inputClass} w-32 disabled:opacity-40`} /> : (row.data[column] || '—')}</td>)}
              <td className="px-4 py-2 text-xs text-brand-400">{row.measurement_type}</td><td className="px-4 py-2"><div className="flex gap-2">{editingId === row.id ? <button title="Save row" onClick={() => updateMutation.mutate({ rowId: row.id, data: draft })} className="text-emerald-400"><Save size={15}/></button> : <button title={row.permissions.can_edit ? 'Edit row' : row.permissions.reason} disabled={!row.permissions.can_edit} onClick={() => startEdit(row)} className="text-brand-400 disabled:opacity-30"><Pencil size={15}/></button>}<button title={row.permissions.can_delete ? 'Delete row' : row.permissions.reason} disabled={!row.permissions.can_delete} onClick={() => window.confirm('Delete this raw measurement row?') && deleteMutation.mutate(row.id)} className="text-red-400 disabled:opacity-30"><Trash2 size={15}/></button></div></td>
            </tr>)}
          </tbody></table></div>
        )}
      </div>
    </div>
  )
}
