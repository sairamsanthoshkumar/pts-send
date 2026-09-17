import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { exportCTCsv, getCTCodelists, getCTCodelistTerms, getCTVersions, installBundledCT, installCdiscCT, removeCTVersion } from '../api/client'

interface CTVersion {
  version: string
  published_date: string
  is_default: boolean
}

interface CTRow {
  code: string
  submissionValue: string
  nameInData: string
  decodedValue: string
  description: string
  anatomicalRegion?: string
  laterality?: string
  directionality?: string
  portionOrTotality?: string
  method?: string
  conditionality?: string
  focidForMa?: string
  focidForMi?: string
  distribution?: string
  chronicity?: string
  resultModifiers?: string
  resultLocation?: string
  resultCategory?: string
}

interface CTTerm {
  code?: string
  label?: string
  submission_value?: string
  name_in_data?: string
  description?: string
  decoded_value?: string
  [key: string]: unknown
}

const EDIT_REASONS = [
  'Correction to terminology definition',
  'New term or update required',
  'Data validation issue',
  'Business rule change',
  'Other',
]

const AVAILABLE_COLUMNS = [
  'Code',
  'Submission Value',
  'Name in Data',
  'Description',
  'Anatomical Region',
  'Laterality',
  'Directionality',
  'Portion or Totality',
  'Method',
  'Conditionality',
  'FOCID for MA',
  'FOCID for MI',
  'Decoded Value',
  'Distribution',
  'Chronicity',
  'Result Modifiers',
  'Result Location',
  'Result Category',
]

const getTypeSpecificColumns = (type: string) => {
  if (type === 'SPEC') {
    return [
      'Code',
      'Submission Value',
      'Name in Data',
      'Description',
      'Anatomical Region',
      'Laterality',
      'Directionality',
      'Portion or Totality',
      'Method',
      'Conditionality',
      'FOCID for MA',
      'FOCID for MI',
      'Decoded Value',
    ]
  }

  if (type === 'LOC') {
    return [
      'Code',
      'Submission Value',
      'Name in Data',
      'Description',
      'Anatomical Region',
      'Laterality',
      'Method',
      'Decoded Value',
    ]
  }

  if (type === 'FXFINDRS') {
    return [
      'Code',
      'Submission Value',
      'Name in Data',
      'Description',
      'Distribution',
      'Result Modifiers',
      'Result Location',
      'Result Category',
      'Decoded Value',
    ]
  }

  if (type === 'NEOPLASM' || type === 'NONNEO') {
    return [
      'Code',
      'Submission Value',
      'Name in Data',
      'Description',
      'Distribution',
      'Chronicity',
      'Result Modifiers',
      'Decoded Value',
    ]
  }

  return ['Code', 'Submission Value', 'Name in Data', 'Description']
}

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100]

const CSV_REQUIRED_COLUMNS = [
  'Codelist Code',
  'Codelist Extensible',
  'Codelist Name',
  'Code',
  'Submission Value',
  'Name in Data',
  'Value Key',
  'ACTION',
]

const CSV_SAMPLE = `Codelist Code,Codelist Extensible,Codelist Name,Code,Submission Value,Name in Data,Value Key,ACTION
C66781,N,AGEU,C25301,DAYS,DAY12,46604,A
C66781,N,AGEU,C25301,DAYS,DAY123,,E
C65047,Y,LBTESTCD,LBT001,ETPX,,,
C65047,Y,LBTESTCD,LBT002,EXY,Extended test,,A`

const CT_DATA: CTRow[] = [
  { code: 'C81328', submissionValue: 'Body Weight', nameInData: 'BW nid', decodedValue: '', description: 'The weight of a subject. (NCI)' },
  { code: 'C81328', submissionValue: 'Body Weight', nameInData: 'editAdd', decodedValue: '', description: 'The weight of a subject. (NCI)' },
  { code: 'C81328', submissionValue: 'Body Weight', nameInData: 'editAdd1', decodedValue: '', description: 'The weight of a subject. (NCI)' },
  { code: 'C00464', submissionValue: 'Terminal Body Weight', nameInData: 'bwsub5a', decodedValue: '', description: 'The weight of a subject at a specified end point. (NCI)' },
  { code: 'D5005', submissionValue: 'bwsub5b', nameInData: 'bwsub5b', decodedValue: '', description: '' },
  { code: 'D346', submissionValue: 'test5', nameInData: 'testname1', decodedValue: '', description: 'The weight of a subject. (NCI)' },
  { code: 'D778', submissionValue: 'Fasting Weight', nameInData: 'fweight', decodedValue: '', description: 'Subject weight after overnight fast.' },
  { code: 'C99012', submissionValue: 'Weight Change', nameInData: 'wtchg', decodedValue: '', description: 'The measured change in weight over a period.' },
  { code: 'C55221', submissionValue: 'Weight Gain', nameInData: 'gainwt', decodedValue: '', description: 'Positive body weight change.' },
  { code: 'C71118', submissionValue: 'Weight Loss', nameInData: 'losswt', decodedValue: '', description: 'Negative body weight change.' },
  { code: 'C81974', submissionValue: 'Weight', nameInData: 'wt', decodedValue: '', description: 'Body weight value recorded.' },
  { code: 'C98880', submissionValue: 'Weight status', nameInData: 'wtstatus', decodedValue: '', description: 'General status of body weight.' },
  { code: 'C89322', submissionValue: 'Body Weight at Baseline', nameInData: 'bwbase', decodedValue: '', description: 'Baseline body weight.' },
  { code: 'C65744', submissionValue: 'Body Weight at Visit', nameInData: 'bwvisit', decodedValue: '', description: 'Body weight observed at visit.' },
  { code: 'C55431', submissionValue: 'Body Weight Date', nameInData: 'bwdt', decodedValue: '', description: 'Date the weight was recorded.' },
  { code: 'C11905', submissionValue: 'BWL', nameInData: 'bwl', decodedValue: '', description: 'Abbreviation used in source systems.' },
  { code: 'C10110', submissionValue: 'Health Status', nameInData: 'health', decodedValue: '', description: 'Overall health state of subject.' },
  { code: 'C87308', submissionValue: 'Lean Body Weight', nameInData: 'lbw', decodedValue: '', description: 'Lean body weight measure.' },
  { code: 'D82210', submissionValue: 'Observation Weight', nameInData: 'obswt', decodedValue: '', description: 'Weight observation value.' },
  { code: 'C99788', submissionValue: 'Predicted Weight', nameInData: 'predwt', decodedValue: '', description: 'Estimated body weight value.' },
]

const SPEC_DATA: CTRow[] = [
  {
    code: 'C77808',
    submissionValue: 'ABDOMINAL WALL',
    nameInData: 'Abdomen',
    description: 'The tissue that surrounds the organs present in the abdominal cavity.',
    decodedValue: 'The tissue that surrounds the organs present in the abdominal cavity.',
    anatomicalRegion: 'Abdomen',
    laterality: 'Bilateral',
    directionality: 'Anterior',
    portionOrTotality: 'All',
    method: 'Anatomical Method',
    conditionality: 'Conditioned',
    focidForMa: 'MA-1',
    focidForMi: 'MI-1',
  },
  {
    code: 'C77806',
    submissionValue: 'ABDOMINAL WALL, LOWER',
    nameInData: 'Abdominal Wall, Lower',
    description: 'The tissue that surrounds the organs present in the abdominal cavity.',
    decodedValue: 'The tissue that surrounds the organs present in the abdominal cavity.',
    anatomicalRegion: 'Abdomen',
    laterality: 'Bilateral',
    directionality: 'Anterior',
    portionOrTotality: 'All',
    method: 'Anatomical Method',
    conditionality: 'Conditioned',
    focidForMa: 'MA-2',
    focidForMi: 'MI-2',
  },
  {
    code: 'C77809',
    submissionValue: 'ABDOMINAL WALL',
    nameInData: 'nameEditSpec',
    description: 'The tissue that surrounds the organs present in the abdominal cavity.',
    decodedValue: 'The tissue that surrounds the organs present in the abdominal cavity.',
    anatomicalRegion: 'Abdomen',
    laterality: 'Bilateral',
    directionality: 'Posterior',
    portionOrTotality: 'All',
    method: 'Anatomical Method',
    conditionality: 'Conditioned',
    focidForMa: 'MA-3',
    focidForMi: 'MI-3',
  },
]

const NEOPLASM_DATA: CTRow[] = [
  {
    code: 'C118881',
    submissionValue: 'ACINAR CELL TUMOR, BENIGN',
    nameInData: 'ACINAR_CELL_TUMOR_BENIGN',
    description: 'A benign tumor of the pancreas with morphologic characteristics of endocrine, acinar and ductal cells. (INHAND)',
    decodedValue: 'A benign tumor of the pancreas',
    distribution: 'DIFFUSE',
    chronicity: 'ACUTE',
    resultModifiers: 'MODIFIER1',
  },
  {
    code: 'C7544',
    submissionValue: 'ADAMANTINOMA, MALIGNANT',
    nameInData: 'ADAMANTINOMA_MALIGNANT',
    description: 'A low-grade malignant neoplasm composed of epithelial cells and a spindle cell osteo-fibrous proliferation.',
    decodedValue: 'A low-grade malignant neoplasm',
    distribution: 'LOCALIZED',
    chronicity: 'CHRONIC',
    resultModifiers: 'MODIFIER2',
  },
]

const FXFINDRS_DATA: CTRow[] = [
  {
    code: 'C11896',
    submissionValue: 'ABDOMINAL DISTENSION',
    nameInData: 'ABD_DISTENSION',
    description: 'An abnormal enlargement of the abdominal cavity.',
    decodedValue: 'Abdominal distension finding',
    distribution: 'LOCALIZED',
    resultModifiers: 'MODERATE',
    resultLocation: 'ABDOMEN',
    resultCategory: 'CLINICAL_OBSERVATION',
  },
  {
    code: 'C18814',
    submissionValue: 'ABDOMINAL PAIN',
    nameInData: 'ABD_PAIN',
    description: 'Discomfort localized to the abdominal region.',
    decodedValue: 'Abdominal pain finding',
    distribution: 'FOCAL',
    resultModifiers: 'SEVERE',
    resultLocation: 'ABDOMEN',
    resultCategory: 'CLINICAL_SIGN',
  },
]

const buttonStyle = {
  border: '1px solid #38bdf8',
  background: 'transparent',
  color: '#22d3ee',
  borderRadius: '4px',
  padding: '10px 22px',
  fontSize: '14px',
  cursor: 'pointer',
  minWidth: '120px',
  fontWeight: 500,
  boxShadow: 'none',
} as const

const parseCsvRows = (text: string) => {
  const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0)
  if (!lines.length) return []
  return lines.map(line => line.split(',').map(cell => cell.trim()))
}

const validateImportedCsv = (text: string) => {
  const rows = parseCsvRows(text)
  if (!rows.length) return 'CSV file is empty.'

  const header = rows[0].map(cell => cell.replace(/^"|"$/g, ''))
  const missing = CSV_REQUIRED_COLUMNS.filter(col => !header.includes(col))
  if (missing.length) {
    return `Missing required columns: ${missing.join(', ')}`
  }

  for (let index = 1; index < rows.length; index += 1) {
    const row = rows[index]
    const action = (row[header.indexOf('ACTION')] || '').toUpperCase()
    if (action === 'D') {
      return `Row ${index + 1} uses D (delete), which is not supported.`
    }
    if (action && !['A', 'E'].includes(action)) {
      return `Row ${index + 1} has unsupported ACTION value: ${action}`
    }
  }

  return ''
}

export default function CTPage() {
  const packageFileInputRef = useRef<HTMLInputElement | null>(null)
  const [selectedVersion, setSelectedVersion] = useState<string>('')
  const [selectedType, setSelectedType] = useState<string>('')
  const [showCsvPreview, setShowCsvPreview] = useState<boolean>(true)
  const [isEditMode, setIsEditMode] = useState<boolean>(false)
  const [editName, setEditName] = useState<string>('Body Weight Test Name')
  const [editDescription, setEditDescription] = useState<string>('Terminology for the test names concerned with the measurement of body mass.')
  const [selectedEditReason, setSelectedEditReason] = useState<string>('')
  const [isDefinitionView, setIsDefinitionView] = useState<boolean>(false)
  const [wildcard, setWildcard] = useState<string>('')
  const [pageSize, setPageSize] = useState<number>(10)
  const [currentPage, setCurrentPage] = useState<number>(1)
  const [selectedColumns, setSelectedColumns] = useState<string[]>(['Code', 'Submission Value', 'Name in Data', 'Description'])
  const [ctRows, setCtRows] = useState<CTRow[]>([])
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false)
  const [createMode, setCreateMode] = useState<'add' | 'edit'>('add')
  const [selectedRowForEdit, setSelectedRowForEdit] = useState<CTRow | null>(null)
  const [newCodeChoice, setNewCodeChoice] = useState<string>('')
  const [newCodeValue, setNewCodeValue] = useState<string>('')
  const [formState, setFormState] = useState<CTRow & { reason: string }>({
    code: '',
    submissionValue: '',
    nameInData: '',
    decodedValue: '',
    description: '',
    anatomicalRegion: '',
    laterality: '',
    directionality: '',
    portionOrTotality: '',
    method: '',
    conditionality: '',
    focidForMa: '',
    focidForMi: '',
    distribution: '',
    chronicity: '',
    resultModifiers: '',
    resultLocation: '',
    resultCategory: '',
    reason: '',
  })

  const { data: versions = [], isLoading } = useQuery<CTVersion[]>({
    queryKey: ['ct-versions'],
    queryFn: async () => {
      try {
        const response = await getCTVersions()
        const items = response.data as CTVersion[]
        return Array.isArray(items) ? items : []
      } catch {
        return []
      }
    },
  })

  const { data: codelists = [] } = useQuery<Array<{ codelist: string; extensible?: string }>>({
    queryKey: ['ct-codelists', selectedVersion],
    queryFn: async () => {
      const response = await getCTCodelists(selectedVersion)
      return Array.isArray(response.data) ? response.data : []
    },
    enabled: Boolean(selectedVersion),
    retry: false,
  })

  const { data: selectedTypeTerms, isError: isTypeTermsError } = useQuery<CTTerm[]>({
    queryKey: ['ct-codelist-terms', selectedVersion, selectedType],
    queryFn: async () => {
      const response = await getCTCodelistTerms(selectedType, selectedVersion)
      const terms = response.data?.terms
      return Array.isArray(terms) ? terms : []
    },
    enabled: Boolean(selectedVersion && selectedType),
    retry: false,
  })

  useEffect(() => {
    if (versions.length && !selectedVersion) {
      const defaultVersion = versions.find(v => v.is_default)?.version ?? versions[0].version
      setSelectedVersion(defaultVersion)
    }
  }, [versions, selectedVersion])

  useEffect(() => {
    if (codelists.length && !codelists.some(item => item.codelist === selectedType)) {
      setSelectedType(codelists[0].codelist)
    }
    if (!codelists.length) setSelectedType('')
  }, [codelists, selectedType])

  const selectedReasonValid = selectedEditReason.trim().length > 0
  const isExtensibleType = codelists.some(item => item.codelist === selectedType && item.extensible === 'Y')
  const isSpecOrLocType = selectedType === 'SPEC' || selectedType === 'LOC'
  const isFindingType = selectedType === 'FXFINDRS' || selectedType === 'NEOPLASM' || selectedType === 'NONNEO'
  const existingCodes = Array.from(new Set(ctRows.map(row => row.code))).sort()

  const openCreateModal = (row?: CTRow) => {
    if (row) {
      setCreateMode('edit')
      setSelectedRowForEdit(row)
      setFormState({
        code: row.code,
        submissionValue: row.submissionValue,
        nameInData: row.nameInData,
        decodedValue: row.decodedValue,
        description: row.description,
        anatomicalRegion: row.anatomicalRegion ?? '',
        laterality: row.laterality ?? '',
        directionality: row.directionality ?? '',
        portionOrTotality: row.portionOrTotality ?? '',
        method: row.method ?? '',
        conditionality: row.conditionality ?? '',
        focidForMa: row.focidForMa ?? '',
        focidForMi: row.focidForMi ?? '',
        distribution: row.distribution ?? '',
        chronicity: row.chronicity ?? '',
        resultModifiers: row.resultModifiers ?? '',
        resultLocation: row.resultLocation ?? '',
        resultCategory: row.resultCategory ?? '',
        reason: '',
      })
      setNewCodeChoice('')
      setNewCodeValue('')
    } else {
      const initialCode = existingCodes[0] ?? ''
      setCreateMode('add')
      setSelectedRowForEdit(null)
      setFormState({
        code: initialCode,
        submissionValue: '',
        nameInData: '',
        decodedValue: '',
        description: '',
        anatomicalRegion: '',
        laterality: '',
        directionality: '',
        portionOrTotality: '',
        method: '',
        conditionality: '',
        focidForMa: '',
        focidForMi: '',
        distribution: '',
        chronicity: '',
        resultModifiers: '',
        resultLocation: '',
        resultCategory: '',
        reason: '',
      })
      setNewCodeChoice(isExtensibleType ? 'new' : initialCode)
      setNewCodeValue('')
    }
    setIsCreateModalOpen(true)
  }

  const closeCreateModal = () => {
    setIsCreateModalOpen(false)
    setSelectedRowForEdit(null)
    setNewCodeChoice('')
    setNewCodeValue('')
    setFormState({
      code: '',
      submissionValue: '',
      nameInData: '',
      decodedValue: '',
      description: '',
      anatomicalRegion: '',
      laterality: '',
      directionality: '',
      portionOrTotality: '',
      method: '',
      conditionality: '',
      focidForMa: '',
      focidForMi: '',
      distribution: '',
      chronicity: '',
      resultModifiers: '',
      resultLocation: '',
      resultCategory: '',
      reason: '',
    })
  }

  const getCellValue = (row: CTRow, column: string) => {
    switch (column) {
      case 'Code':
        return row.code
      case 'Submission Value':
        return row.submissionValue
      case 'Name in Data':
        return row.nameInData
      case 'Decoded Value':
        return row.decodedValue
      case 'Description':
        return row.description
      case 'Anatomical Region':
        return row.anatomicalRegion ?? ''
      case 'Laterality':
        return row.laterality ?? ''
      case 'Directionality':
        return row.directionality ?? ''
      case 'Portion or Totality':
        return row.portionOrTotality ?? ''
      case 'Method':
        return row.method ?? ''
      case 'Conditionality':
        return row.conditionality ?? ''
      case 'FOCID for MA':
        return row.focidForMa ?? ''
      case 'FOCID for MI':
        return row.focidForMi ?? ''
      case 'Distribution':
        return row.distribution ?? ''
      case 'Chronicity':
        return row.chronicity ?? ''
      case 'Result Modifiers':
        return row.resultModifiers ?? ''
      case 'Result Location':
        return row.resultLocation ?? ''
      case 'Result Category':
        return row.resultCategory ?? ''
      default:
        return ''
    }
  }

  const filteredRows = ctRows.filter((row) => {
    if (!wildcard.trim()) return true
    const searchable = selectedColumns.map(column => getCellValue(row, column))
    return searchable.some(value => value.toLowerCase().includes(wildcard.trim().toLowerCase()))
  })

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize))
  const safeCurrentPage = Math.min(currentPage, totalPages)
  const startIndex = (safeCurrentPage - 1) * pageSize
  const pagedRows = filteredRows.slice(startIndex, startIndex + pageSize)

  useEffect(() => {
    setCurrentPage(1)
  }, [wildcard, pageSize])

  useEffect(() => {
    setSelectedColumns(getTypeSpecificColumns(selectedType))
  }, [selectedType])

  useEffect(() => {
    setCtRows([])
    setCurrentPage(1)
  }, [selectedType, selectedVersion])

  useEffect(() => {
    if (selectedTypeTerms) {
      setCtRows(selectedTypeTerms.map((term) => ({
        code: String(term.code ?? ''),
        submissionValue: String(term.submission_value ?? term.label ?? ''),
        nameInData: String(term.name_in_data ?? ''),
        decodedValue: String(term.decoded_value ?? ''),
        description: String(term.description ?? ''),
      })))
    } else if (isTypeTermsError) {
      setCtRows([])
    } else {
      return
    }
    setCurrentPage(1)
  }, [isTypeTermsError, selectedType, selectedTypeTerms])

  const handleColumnToggle = (column: string) => {
    setSelectedColumns((current) => {
      if (current.includes(column)) {
        if (current.length === 1) return current
        return current.filter(item => item !== column)
      }
      return [...current, column]
    })
  }

  const handleEdit = () => {
    if (!selectedVersion || !selectedType) return
    setIsEditMode(true)
    setEditName('Body Weight Test Name')
    setEditDescription('Terminology for the test names concerned with the measurement of body mass.')
    setSelectedEditReason('')
  }

  const handleEditSave = () => {
    if (!selectedReasonValid) {
      window.alert('Please select a reason for edit before saving.')
      return
    }

    console.log('FS24B.2.1 Saved CT type edit', {
      type: selectedType,
      version: selectedVersion,
      reason: selectedEditReason,
      name: editName,
      description: editDescription,
    })
    window.alert(`Saved changes for ${selectedType} with audit reason: ${selectedEditReason}`)
    setIsEditMode(false)
  }

  const handleEditCancel = () => {
    setEditName('Body Weight Test Name')
    setEditDescription('Terminology for the test names concerned with the measurement of body mass.')
    setSelectedEditReason('')
    setIsEditMode(false)
  }

  const handleNext = () => {
    if (!selectedVersion || !selectedType) return
    setIsDefinitionView(true)
    setCurrentPage(1)
  }

  const handleBack = () => {
    setIsDefinitionView(false)
  }

  const handleAdd = () => {
    openCreateModal()
  }

  const handleDoubleClick = (row: CTRow) => {
    openCreateModal(row)
  }

  const handleSubmitCreateForm = () => {
    const codeValue = createMode === 'add' && newCodeChoice === 'new' ? newCodeValue.trim() : formState.code.trim()
    const finalCode = createMode === 'edit' ? formState.code.trim() : codeValue

    if (!finalCode) {
      window.alert('Please enter a valid code before saving.')
      return
    }
    if (!formState.submissionValue.trim()) {
      window.alert('Please enter a submission value before saving.')
      return
    }
    if (!formState.nameInData.trim()) {
      window.alert('Please enter a name in data before saving.')
      return
    }
    if (!formState.reason.trim()) {
      window.alert('Please select a reason before saving.')
      return
    }

    const nextRow: CTRow = {
      code: finalCode,
      submissionValue: formState.submissionValue.trim(),
      nameInData: formState.nameInData.trim(),
      decodedValue: formState.decodedValue.trim(),
      description: formState.description.trim(),
      anatomicalRegion: formState.anatomicalRegion?.trim() ?? '',
      laterality: formState.laterality?.trim() ?? '',
      directionality: formState.directionality?.trim() ?? '',
      portionOrTotality: formState.portionOrTotality?.trim() ?? '',
      method: formState.method?.trim() ?? '',
      conditionality: formState.conditionality?.trim() ?? '',
      focidForMa: formState.focidForMa?.trim() ?? '',
      focidForMi: formState.focidForMi?.trim() ?? '',
      distribution: formState.distribution?.trim() ?? '',
      chronicity: formState.chronicity?.trim() ?? '',
      resultModifiers: formState.resultModifiers?.trim() ?? '',
      resultLocation: formState.resultLocation?.trim() ?? '',
      resultCategory: formState.resultCategory?.trim() ?? '',
    }

    if (createMode === 'edit' && selectedRowForEdit) {
      setCtRows(current => current.map(row => (row === selectedRowForEdit ? nextRow : row)))
      window.alert(`Saved changes for ${finalCode} with audit reason: ${formState.reason}`)
    } else {
      setCtRows(current => [...current, nextRow])
      window.alert(`Added new CT record ${finalCode} with audit reason: ${formState.reason}`)
    }

    closeCreateModal()
  }

  const handleDeleteCreateForm = () => {
    if (!selectedRowForEdit) return

    const confirmed = window.confirm(`Delete controlled terminology ${selectedRowForEdit.code}?`)
    if (!confirmed) return

    setCtRows(current => current.filter(row => row !== selectedRowForEdit))
    window.alert(`Deleted ${selectedRowForEdit.code} with audit reason: ${formState.reason || 'delete record'}`)
    closeCreateModal()
  }

  const handleExport = async () => {
    if (!selectedVersion) return
    try {
      const rows = filteredRows.map(row => [row.code, row.submissionValue, row.nameInData, row.description].join(','))
      const blob = new Blob([`Code,Submission Value,Name in Data,Description\n${rows.join('\n')}`], { type: 'text/csv;charset=utf-8;' })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `ct_${selectedType.toLowerCase()}_${selectedVersion.replace(/\s+/g, '_')}.csv`)
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (error) {
      console.error('CT export failed', error)
      window.alert('Unable to export CT CSV.')
    }
  }

  const handleInstallBundled = async () => {
    if (!window.confirm('Install the bundled controlled terminology package?')) return
    try {
      const result = await installBundledCT()
      window.alert(`${result.data?.message || 'Installation completed.'}\nInstalled versions: ${(result.data?.installed_versions || []).join(', ') || 'none'}\nMissing files: ${(result.data?.missing_files || []).join(', ') || 'none'}`)
      window.location.reload()
    } catch (error: any) {
      window.alert(error?.response?.data?.detail || 'Unable to install the bundled CT package.')
    }
  }

  const handleInstallUploaded = () => {
    packageFileInputRef.current?.click()
  }

  const handleUploadPackageFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    const version = window.prompt('Enter the new CT version, for example SEND Terminology 2025-03-28')?.trim()
    const previousVersion = window.prompt('Enter the predecessor CT version')?.trim() ?? ''
    if (!version) {
      event.target.value = ''
      return
    }
    try {
      const result = await installCdiscCT(file, version, previousVersion)
      window.alert(result.data?.message || 'Controlled terminology package installed successfully.')
      window.location.reload()
    } catch (error: any) {
      window.alert(error?.response?.data?.detail || 'Unable to install the CT package.')
    } finally {
      event.target.value = ''
    }
  }

  const handleRemove = async () => {
    if (!selectedVersion) return
    const confirmed = window.confirm(`Remove controlled terminology version "${selectedVersion}"?`)
    if (!confirmed) return

    try {
      await removeCTVersion(selectedVersion)
      const nextVersions = versions.filter(v => v.version !== selectedVersion)
      const nextDefault = nextVersions.find(v => v.is_default)?.version ?? nextVersions[0]?.version ?? ''
      setSelectedVersion(nextDefault)
      window.alert('Controlled terminology version removed.')
    } catch (error: any) {
      console.error('CT remove failed', error)
      window.alert(error?.response?.data?.detail || 'Unable to remove the selected CT version.')
    }
  }

  const renderCreateModal = () => (
    isCreateModalOpen ? (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-500/40 px-4">
        <div className="w-full max-w-[1100px] rounded-[12px] border border-slate-300 bg-[#f5f5f5] shadow-[0_10px_30px_rgba(15,23,42,0.25)]">
          <div className="border-b border-slate-300 bg-[#f3f3f3] px-6 py-4 text-[17px] font-semibold text-slate-700">
            Controlled Terminology - {createMode === 'edit' ? 'Edit' : 'Creation'}
          </div>

          <div className="p-5">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="border border-slate-300 bg-slate-200/80 p-0">
                <div className="flex h-[52px] items-center bg-slate-200 px-3 text-[15px] font-medium text-slate-700">
                  <label htmlFor="ct-form-code" className="w-full">Code</label>
                </div>
                {createMode === 'edit' ? (
                  <input
                    id="ct-form-code"
                    aria-label="Code"
                    value={formState.code}
                    onChange={(e) => setFormState(current => ({ ...current, code: e.target.value }))}
                    readOnly={isSpecOrLocType || isFindingType}
                    className="w-full border-0 bg-slate-100 px-3 py-3 text-[15px] text-slate-700 outline-none disabled:cursor-not-allowed disabled:opacity-80"
                  />
                ) : (
                  <select
                    id="ct-form-code"
                    aria-label="Code"
                    value={newCodeChoice === 'new' ? 'new' : formState.code || existingCodes[0] || ''}
                    onChange={(e) => {
                      const nextValue = e.target.value
                      if (nextValue === 'new') {
                        setNewCodeChoice('new')
                        setFormState(current => ({ ...current, code: '' }))
                        return
                      }
                      setNewCodeChoice(nextValue)
                      setFormState(current => ({ ...current, code: nextValue }))
                    }}
                    className="w-full border-0 bg-slate-100 px-3 py-3 text-[15px] text-slate-700 outline-none"
                    disabled={isSpecOrLocType || isFindingType}
                  >
                    {existingCodes.map(code => (
                      <option key={code} value={code}>{code}</option>
                    ))}
                    {isExtensibleType && <option value="new">New Code</option>}
                  </select>
                )}
              </div>

              <div className="flex min-h-[52px] items-center border border-slate-300 bg-slate-200/80 p-0">
                <div className="w-full bg-slate-100 px-3 py-3 text-[15px] text-slate-700">
                  {createMode === 'edit' ? 'Edit existing record' : 'Add new record'}
                </div>
              </div>
            </div>

            {createMode === 'add' && isExtensibleType && newCodeChoice === 'new' && (
              <div className="mt-3 rounded-[4px] border border-sky-300 bg-slate-100 p-0">
                <div className="flex h-[52px] items-center border-b border-slate-300 bg-slate-200 px-3 text-[15px] font-medium text-slate-700">
                  <label htmlFor="ct-form-new-code">New Code</label>
                </div>
                <input
                  id="ct-form-new-code"
                  aria-label="New Code"
                  value={newCodeValue}
                  onChange={(e) => {
                    const nextValue = e.target.value
                    setNewCodeValue(nextValue)
                    setFormState(current => ({ ...current, code: nextValue }))
                  }}
                  placeholder="Enter a new code"
                  className="w-full border-0 bg-slate-100 px-3 py-3 text-[15px] text-slate-700 outline-none"
                />
              </div>
            )}

            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="border border-slate-300 bg-slate-200/80">
                <div className="flex h-[52px] items-center bg-slate-200 px-3 text-[15px] font-medium text-slate-700">
                  Submission Value
                </div>
                <input
                  value={formState.submissionValue}
                  onChange={(e) => setFormState(current => ({ ...current, submissionValue: e.target.value }))}
                  readOnly={isSpecOrLocType || isFindingType}
                  className="w-full border-0 bg-slate-100 px-3 py-3 text-[15px] text-slate-700 outline-none disabled:cursor-not-allowed disabled:opacity-80"
                />
              </div>
              <div className="border border-slate-300 bg-slate-200/80">
                <div className="flex h-[52px] items-center bg-slate-200 px-3 text-[15px] font-medium text-slate-700">
                  Name in data
                </div>
                <input
                  value={formState.nameInData}
                  onChange={(e) => setFormState(current => ({ ...current, nameInData: e.target.value }))}
                  readOnly={isSpecOrLocType || isFindingType}
                  className="w-full border-0 bg-slate-100 px-3 py-3 text-[15px] text-slate-700 outline-none disabled:cursor-not-allowed disabled:opacity-80"
                />
              </div>

              {isSpecOrLocType && (
                <>
                  <div className="border border-slate-300 bg-slate-200/80">
                    <div className="flex h-[52px] items-center bg-slate-200 px-3 text-[15px] font-medium text-slate-700">
                      Anatomical Region
                    </div>
                    <input
                      aria-label="Anatomical Region"
                      value={formState.anatomicalRegion ?? ''}
                      onChange={(e) => setFormState(current => ({ ...current, anatomicalRegion: e.target.value }))}
                      className="w-full border-0 bg-slate-100 px-3 py-3 text-[15px] text-slate-700 outline-none"
                    />
                  </div>

                  <div className="border border-slate-300 bg-slate-200/80">
                    <div className="flex h-[52px] items-center bg-slate-200 px-3 text-[15px] font-medium text-slate-700">
                      Method
                    </div>
                    <input
                      aria-label="Method"
                      value={formState.method ?? ''}
                      onChange={(e) => setFormState(current => ({ ...current, method: e.target.value }))}
                      className="w-full border-0 bg-slate-100 px-3 py-3 text-[15px] text-slate-700 outline-none"
                    />
                  </div>

                  <div className="border border-slate-300 bg-slate-200/80">
                    <div className="flex h-[52px] items-center bg-slate-200 px-3 text-[15px] font-medium text-slate-700">
                      Conditionality
                    </div>
                    <input
                      aria-label="Conditionality"
                      value={formState.conditionality ?? ''}
                      onChange={(e) => setFormState(current => ({ ...current, conditionality: e.target.value }))}
                      className="w-full border-0 bg-slate-100 px-3 py-3 text-[15px] text-slate-700 outline-none"
                    />
                  </div>

                  <div className="border border-slate-300 bg-slate-200/80">
                    <div className="flex h-[52px] items-center bg-slate-200 px-3 text-[15px] font-medium text-slate-700">
                      Laterality
                    </div>
                    <select
                      aria-label="Laterality"
                      value={formState.laterality ?? ''}
                      onChange={(e) => setFormState(current => ({ ...current, laterality: e.target.value }))}
                      className="w-full border-0 bg-slate-100 px-3 py-3 text-[15px] text-slate-700 outline-none"
                    >
                      <option value="">Nothing selected</option>
                      <option value="BILATERAL">BILATERAL</option>
                      <option value="UNILATERAL">UNILATERAL</option>
                      <option value="LEFT">LEFT</option>
                      <option value="RIGHT">RIGHT</option>
                    </select>
                  </div>

                  <div className="border border-slate-300 bg-slate-200/80">
                    <div className="flex h-[52px] items-center bg-slate-200 px-3 text-[15px] font-medium text-slate-700">
                      Directionality
                    </div>
                    <select
                      aria-label="Directionality"
                      value={formState.directionality ?? ''}
                      onChange={(e) => setFormState(current => ({ ...current, directionality: e.target.value }))}
                      className="w-full border-0 bg-slate-100 px-3 py-3 text-[15px] text-slate-700 outline-none"
                    >
                      <option value="">Nothing selected</option>
                      <option value="ANTERIOR">ANTERIOR</option>
                      <option value="POSTERIOR">POSTERIOR</option>
                      <option value="MEDIAL">MEDIAL</option>
                      <option value="LATERAL">LATERAL</option>
                    </select>
                  </div>

                  <div className="border border-slate-300 bg-slate-200/80">
                    <div className="flex h-[52px] items-center bg-slate-200 px-3 text-[15px] font-medium text-slate-700">
                      Portion or Totality
                    </div>
                    <select
                      aria-label="Portion or Totality"
                      value={formState.portionOrTotality ?? ''}
                      onChange={(e) => setFormState(current => ({ ...current, portionOrTotality: e.target.value }))}
                      className="w-full border-0 bg-slate-100 px-3 py-3 text-[15px] text-slate-700 outline-none"
                    >
                      <option value="">Nothing selected</option>
                      <option value="ALL">ALL</option>
                      <option value="LEFT">LEFT</option>
                      <option value="RIGHT">RIGHT</option>
                      <option value="WHOLE">WHOLE</option>
                    </select>
                  </div>

                  <div className="border border-slate-300 bg-slate-200/80">
                    <div className="flex h-[52px] items-center bg-slate-200 px-3 text-[15px] font-medium text-slate-700">
                      FOCID for MA
                    </div>
                    <input
                      aria-label="FOCID for MA"
                      value={formState.focidForMa ?? ''}
                      onChange={(e) => setFormState(current => ({ ...current, focidForMa: e.target.value }))}
                      className="w-full border-0 bg-slate-100 px-3 py-3 text-[15px] text-slate-700 outline-none"
                    />
                  </div>

                  <div className="border border-slate-300 bg-slate-200/80">
                    <div className="flex h-[52px] items-center bg-slate-200 px-3 text-[15px] font-medium text-slate-700">
                      FOCID for MI
                    </div>
                    <input
                      aria-label="FOCID for MI"
                      value={formState.focidForMi ?? ''}
                      onChange={(e) => setFormState(current => ({ ...current, focidForMi: e.target.value }))}
                      className="w-full border-0 bg-slate-100 px-3 py-3 text-[15px] text-slate-700 outline-none"
                    />
                  </div>
                </>
              )}

              <div className="border border-slate-300 bg-slate-200/80">
                <div className="flex h-[52px] items-center bg-slate-200 px-3 text-[15px] font-medium text-slate-700">
                  Decoded Value
                </div>
                <input
                  value={formState.decodedValue}
                  onChange={(e) => setFormState(current => ({ ...current, decodedValue: e.target.value }))}
                  className="w-full border-0 bg-slate-100 px-3 py-3 text-[15px] text-slate-700 outline-none"
                />
              </div>
              <div className="border border-slate-300 bg-slate-200/80">
                <div className="flex h-[52px] items-center bg-slate-200 px-3 text-[15px] font-medium text-slate-700">
                  Description
                </div>
                <input
                  value={formState.description}
                  onChange={(e) => setFormState(current => ({ ...current, description: e.target.value }))}
                  readOnly={isSpecOrLocType}
                  className="w-full border-0 bg-slate-100 px-3 py-3 text-[15px] text-slate-700 outline-none disabled:cursor-not-allowed disabled:opacity-80"
                />
              </div>

              {isFindingType && (
                <>
                  <div className="border border-slate-300 bg-slate-200/80">
                    <div className="flex h-[52px] items-center bg-slate-200 px-3 text-[15px] font-medium text-slate-700">
                      Distribution
                    </div>
                    <select
                      aria-label="Distribution"
                      value={formState.distribution ?? ''}
                      onChange={(e) => setFormState(current => ({ ...current, distribution: e.target.value }))}
                      className="w-full border-0 bg-slate-100 px-3 py-3 text-[15px] text-slate-700 outline-none"
                    >
                      <option value="">Nothing selected</option>
                      <option value="LOCALIZED">LOCALIZED</option>
                      <option value="DIFFUSE">DIFFUSE</option>
                      <option value="FOCAL">FOCAL</option>
                    </select>
                  </div>

                  {(selectedType === 'NEOPLASM' || selectedType === 'NONNEO') && (
                    <div className="border border-slate-300 bg-slate-200/80">
                      <div className="flex h-[52px] items-center bg-slate-200 px-3 text-[15px] font-medium text-slate-700">
                        Chronicity
                      </div>
                      <select
                        aria-label="Chronicity"
                        value={formState.chronicity ?? ''}
                        onChange={(e) => setFormState(current => ({ ...current, chronicity: e.target.value }))}
                        className="w-full border-0 bg-slate-100 px-3 py-3 text-[15px] text-slate-700 outline-none"
                      >
                        <option value="">Nothing selected</option>
                        <option value="ACUTE">ACUTE</option>
                        <option value="CHRONIC">CHRONIC</option>
                        <option value="SUBACUTE">SUBACUTE</option>
                      </select>
                    </div>
                  )}\n\n                  <div className="border border-slate-300 bg-slate-200/80">
                    <div className="flex h-[52px] items-center bg-slate-200 px-3 text-[15px] font-medium text-slate-700">
                      Result Modifiers
                    </div>
                    <input
                      aria-label="Result Modifiers"
                      value={formState.resultModifiers ?? ''}
                      onChange={(e) => setFormState(current => ({ ...current, resultModifiers: e.target.value }))}
                      className="w-full border-0 bg-slate-100 px-3 py-3 text-[15px] text-slate-700 outline-none"
                    />
                  </div>

                  {selectedType === 'FXFINDRS' && (
                    <>\n                      <div className="border border-slate-300 bg-slate-200/80">
                        <div className="flex h-[52px] items-center bg-slate-200 px-3 text-[15px] font-medium text-slate-700">
                          Result Location
                        </div>
                        <input
                          aria-label="Result Location"
                          value={formState.resultLocation ?? ''}
                          onChange={(e) => setFormState(current => ({ ...current, resultLocation: e.target.value }))}
                          className="w-full border-0 bg-slate-100 px-3 py-3 text-[15px] text-slate-700 outline-none"
                        />
                      </div>

                      <div className="border border-slate-300 bg-slate-200/80">
                        <div className="flex h-[52px] items-center bg-slate-200 px-3 text-[15px] font-medium text-slate-700">
                          Result Category
                        </div>
                        <input
                          aria-label="Result Category"
                          value={formState.resultCategory ?? ''}
                          onChange={(e) => setFormState(current => ({ ...current, resultCategory: e.target.value }))}
                          className="w-full border-0 bg-slate-100 px-3 py-3 text-[15px] text-slate-700 outline-none"
                        />
                      </div>
                    </>
                  )}
                </>
              )}
            </div>

            <div className="mt-4 max-w-[540px] mx-auto">
              <select
                aria-label="Reason for new or edit record"
                value={formState.reason}
                onChange={(e) => setFormState(current => ({ ...current, reason: e.target.value }))}
                className="w-full h-[46px] rounded-[4px] border border-sky-400 bg-white px-3 text-[15px] text-slate-700 outline-none"
              >
                <option value="">Reason 1 for {createMode === 'edit' ? 'editing' : 'adding'} a record</option>
                {EDIT_REASONS.map(reason => (
                  <option key={reason} value={reason}>{reason}</option>
                ))}
              </select>
            </div>

            <div className="mt-5 flex justify-end gap-3">
              {createMode === 'edit' && (
                <button
                  type="button"
                  className="h-[40px] min-w-[90px] rounded-[4px] border border-sky-400 bg-white px-4 text-[15px] font-medium text-sky-700"
                  onClick={handleDeleteCreateForm}
                >
                  Delete
                </button>
              )}
              <button
                type="button"
                className="h-[40px] min-w-[90px] rounded-[4px] border border-sky-400 bg-white px-4 text-[15px] font-medium text-sky-700"
                onClick={handleSubmitCreateForm}
              >
                {createMode === 'edit' ? 'Done' : 'Done'}
              </button>
              <button
                type="button"
                className="h-[40px] min-w-[90px] rounded-[4px] border border-slate-300 bg-white px-4 text-[15px] text-slate-700"
                onClick={closeCreateModal}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    ) : null
  )

  if (isDefinitionView) {
    return (
      <div className="min-h-[calc(100vh-120px)] bg-[radial-gradient(circle_at_top,_#eff6ff_0%,_#e2e8f0_35%,_#f8fafc_100%)] text-slate-800">
        {renderCreateModal()}
        <div className="max-w-[1200px] mx-auto px-4 py-6">
          <div className="space-y-4">
            <div className="rounded-2xl border border-sky-100 bg-white/80 p-5 shadow-[0_20px_50px_rgba(14,116,144,0.08)] backdrop-blur-sm">
              <div className="text-center text-[18px] font-semibold text-slate-700 mb-2">
                Controlled Terminology Submission for Type - {selectedType}, Extensible - YES
              </div>
              <div className="text-center text-[18px] font-medium text-sky-700">
                {selectedVersion}
              </div>
            </div>

            <div className="rounded-2xl border border-sky-100 bg-white/80 p-4 shadow-[0_18px_40px_rgba(15,23,42,0.06)] backdrop-blur-sm">
              <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
                <div className="flex-1 flex items-center gap-3">
                  <span className="text-[14px] font-semibold text-slate-600 whitespace-nowrap">Available columns</span>
                  <div className="flex-1 flex flex-wrap gap-2 min-h-[44px] rounded-xl border border-sky-100 bg-slate-50 p-2">
                    {AVAILABLE_COLUMNS.filter(column => getTypeSpecificColumns(selectedType).includes(column) || column === 'Code' || column === 'Submission Value' || column === 'Name in Data' || column === 'Description').map((column) => {
                      const active = selectedColumns.includes(column)
                      return (
                        <button
                          key={column}
                          type="button"
                          onClick={() => handleColumnToggle(column)}
                          className={`px-3 py-2 text-[13px] rounded-lg border transition-all ${
                            active
                              ? 'bg-sky-500 text-white border-sky-500 shadow-md shadow-sky-200'
                              : 'bg-white text-slate-600 border-slate-200 hover:border-sky-300 hover:text-sky-700'
                          }`}
                        >
                          {column}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div className="flex items-center gap-2 min-w-[260px]">
                  <input
                    type="text"
                    value={wildcard}
                    onChange={(e) => setWildcard(e.target.value)}
                    placeholder="Wildcard"
                    className="w-full h-[42px] rounded-xl border border-sky-200 bg-white px-3 text-[14px] text-slate-700 shadow-sm outline-none ring-0 transition focus:border-sky-400 focus:shadow-[0_0_0_3px_rgba(14,165,233,0.15)]"
                  />
                  <button
                    type="button"
                    className="h-[42px] px-5 rounded-xl border border-sky-500 bg-gradient-to-r from-sky-500 to-cyan-500 text-white font-medium shadow-lg shadow-sky-200 transition hover:brightness-105"
                    onClick={() => setCurrentPage(1)}
                  >
                    Search
                  </button>
                </div>
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-sky-100 bg-white shadow-[0_20px_45px_rgba(15,23,42,0.06)]">
              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse text-left">
                  <thead>
                    <tr className="bg-gradient-to-r from-sky-100 via-cyan-50 to-sky-100 text-slate-700 text-[14px] font-semibold">
                        {selectedColumns.includes('Code') && <th className="border-b border-sky-100 px-3 py-3">Code</th>}
                      {selectedColumns.includes('Submission Value') && <th className="border-b border-sky-100 px-3 py-3">Submission Value</th>}
                      {selectedColumns.includes('Name in Data') && <th className="border-b border-sky-100 px-3 py-3">Name in data</th>}
                      {selectedColumns.includes('Description') && <th className="border-b border-sky-100 px-3 py-3">Description</th>}
                      {selectedColumns.includes('Anatomical Region') && <th className="border-b border-sky-100 px-3 py-3">Anatomical Region</th>}
                      {selectedColumns.includes('Laterality') && <th className="border-b border-sky-100 px-3 py-3">Laterality</th>}
                      {selectedColumns.includes('Directionality') && <th className="border-b border-sky-100 px-3 py-3">Directionality</th>}
                      {selectedColumns.includes('Portion or Totality') && <th className="border-b border-sky-100 px-3 py-3">Portion or Totality</th>}
                      {selectedColumns.includes('Method') && <th className="border-b border-sky-100 px-3 py-3">Method</th>}
                      {selectedColumns.includes('Conditionality') && <th className="border-b border-sky-100 px-3 py-3">Conditionality</th>}
                      {selectedColumns.includes('FOCID for MA') && <th className="border-b border-sky-100 px-3 py-3">FOCID for MA</th>}
                      {selectedColumns.includes('FOCID for MI') && <th className="border-b border-sky-100 px-3 py-3">FOCID for MI</th>}
                      {selectedColumns.includes('Decoded Value') && <th className="border-b border-sky-100 px-3 py-3">Decoded Value</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {pagedRows.map((row, index) => (
                      <tr
                        key={`${row.code}-${row.nameInData}-${index}`}
                        className="text-[14px] text-slate-700 transition hover:bg-sky-50/80"
                        onDoubleClick={() => handleDoubleClick(row)}
                      >
                        {selectedColumns.includes('Code') && <td className="border-b border-slate-100 px-3 py-3 font-medium text-sky-700">{row.code}</td>}
                        {selectedColumns.includes('Submission Value') && <td className="border-b border-slate-100 px-3 py-3">{row.submissionValue}</td>}
                        {selectedColumns.includes('Name in Data') && <td className="border-b border-slate-100 px-3 py-3">{row.nameInData}</td>}
                        {selectedColumns.includes('Description') && <td className="border-b border-slate-100 px-3 py-3">{row.description || '—'}</td>}
                        {selectedColumns.includes('Anatomical Region') && <td className="border-b border-slate-100 px-3 py-3">{row.anatomicalRegion || '—'}</td>}
                        {selectedColumns.includes('Laterality') && <td className="border-b border-slate-100 px-3 py-3">{row.laterality || '—'}</td>}
                        {selectedColumns.includes('Directionality') && <td className="border-b border-slate-100 px-3 py-3">{row.directionality || '—'}</td>}
                        {selectedColumns.includes('Portion or Totality') && <td className="border-b border-slate-100 px-3 py-3">{row.portionOrTotality || '—'}</td>}
                        {selectedColumns.includes('Method') && <td className="border-b border-slate-100 px-3 py-3">{row.method || '—'}</td>}
                        {selectedColumns.includes('Conditionality') && <td className="border-b border-slate-100 px-3 py-3">{row.conditionality || '—'}</td>}
                        {selectedColumns.includes('FOCID for MA') && <td className="border-b border-slate-100 px-3 py-3">{row.focidForMa || '—'}</td>}
                        {selectedColumns.includes('FOCID for MI') && <td className="border-b border-slate-100 px-3 py-3">{row.focidForMi || '—'}</td>}
                        {selectedColumns.includes('Decoded Value') && <td className="border-b border-slate-100 px-3 py-3">{row.decodedValue || '—'}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-2xl border border-sky-100 bg-white/80 p-4 shadow-[0_16px_35px_rgba(15,23,42,0.05)]">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <button type="button" className="h-10 w-10 rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-sky-300 hover:text-sky-700">{'<<'}</button>
                  <button type="button" className="h-10 w-10 rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-sky-300 hover:text-sky-700">{'<'}</button>
                  {[...Array(totalPages)].map((_, index) => {
                    const pageNumber = index + 1
                    const active = pageNumber === safeCurrentPage
                    return (
                      <button
                        key={pageNumber}
                        type="button"
                        onClick={() => setCurrentPage(pageNumber)}
                        className={`h-10 w-10 rounded-lg border transition ${
                          active
                            ? 'bg-gradient-to-r from-sky-500 to-cyan-500 text-white border-sky-500 shadow-lg shadow-sky-200'
                            : 'border-slate-200 bg-white text-slate-600 hover:border-sky-300 hover:text-sky-700'
                        }`}
                      >
                        {pageNumber}
                      </button>
                    )
                  })}
                  <button type="button" className="h-10 w-10 rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-sky-300 hover:text-sky-700">{'>'}</button>
                  <button type="button" className="h-10 w-10 rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-sky-300 hover:text-sky-700">{'>>'}</button>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-[14px] text-slate-600 font-medium">Show rows</span>
                  <select
                    value={pageSize}
                    onChange={(e) => setPageSize(Number(e.target.value))}
                    className="h-[42px] rounded-xl border border-sky-200 bg-white px-3 text-[14px] text-slate-700 shadow-sm outline-none focus:border-sky-400"
                  >
                    {PAGE_SIZE_OPTIONS.map(option => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="flex justify-center gap-4 flex-wrap pt-2">
              <button type="button" className="h-[44px] min-w-[150px] rounded-xl border border-sky-400 bg-white text-sky-600 font-medium shadow-md shadow-sky-100 transition hover:-translate-y-0.5 hover:shadow-lg" onClick={handleExport}>
                Export to CSV
              </button>
              <button type="button" aria-label="Add" className="h-[44px] min-w-[150px] rounded-xl border border-sky-400 bg-white text-sky-600 font-medium shadow-md shadow-sky-100 transition hover:-translate-y-0.5 hover:shadow-lg" onClick={handleAdd}>
                Add
              </button>
              <button type="button" className="h-[44px] min-w-[150px] rounded-xl border border-sky-400 bg-white text-sky-600 font-medium shadow-md shadow-sky-100 transition hover:-translate-y-0.5 hover:shadow-lg" onClick={handleBack}>
                Back
              </button>
            </div>
          </div>
        </div>

      </div>
    )
  }

  return (
    <div className="min-h-[calc(100vh-120px)] bg-[radial-gradient(circle_at_top,_#eff6ff_0%,_#e2e8f0_35%,_#f8fafc_100%)] text-slate-800">
      {renderCreateModal()}
      <div className="mx-auto max-w-[760px] rounded-[28px] border border-sky-100 bg-white/90 p-6 shadow-[0_25px_70px_rgba(15,23,42,0.10)] backdrop-blur-sm">
        {!isEditMode ? (
          <>
            <div className="mb-6 text-center">
              <div className="text-[18px] font-semibold text-slate-700">Controlled Terminology definition</div>
            </div>

            <div className="mb-6 rounded-2xl border border-sky-100 bg-gradient-to-r from-sky-50 via-white to-cyan-50 p-4 shadow-[0_16px_30px_rgba(14,116,144,0.06)]">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="text-[12px] font-semibold uppercase tracking-[0.18em] text-sky-700">Version selection</div>
                  <div className="mt-1 text-[15px] font-medium text-slate-700">Current version</div>
                </div>
                <div className="rounded-full bg-white px-3 py-1.5 text-[13px] font-semibold text-sky-700 shadow-sm ring-1 ring-sky-100">
                  {selectedVersion || 'SEND Terminology 2020-06-26'}
                </div>
              </div>

              <div className="mt-4 flex justify-center">
                <div className="w-full max-w-[420px]">
                  <label className="sr-only" htmlFor="ct-version-select">
                    Controlled Terminology Version
                  </label>
                  <select
                    id="ct-version-select"
                    value={selectedVersion}
                    disabled={isLoading}
                    onChange={(e) => setSelectedVersion(e.target.value)}
                    className="w-full h-[46px] rounded-xl border border-sky-200 bg-slate-50 text-[14px] text-slate-700 px-3 shadow-sm outline-none transition focus:border-sky-400 focus:shadow-[0_0_0_3px_rgba(14,165,233,0.15)] disabled:cursor-not-allowed disabled:bg-slate-100"
                    aria-label="Controlled Terminology Version"
                  >
                    {versions.map((version) => (
                      <option key={version.version} value={version.version}>
                        {version.version}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="flex justify-center mb-8">
              <div className="w-full max-w-[420px]">
                <label className="sr-only" htmlFor="ct-type-select">
                  Controlled Terminology Type
                </label>
                <select
                  id="ct-type-select"
                  value={selectedType}
                  onChange={(e) => setSelectedType(e.target.value)}
                  className="w-full h-[46px] rounded-xl border border-sky-200 bg-slate-50 text-[14px] text-slate-700 px-3 shadow-sm outline-none transition focus:border-sky-400 focus:shadow-[0_0_0_3px_rgba(14,165,233,0.15)]"
                  aria-label="Controlled Terminology Type"
                >
                  {codelists.map((item) => (
                    <option key={item.codelist} value={item.codelist}>
                      {item.codelist}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-center gap-4 flex-wrap">
              <button type="button" className="h-[44px] min-w-[140px] rounded-xl border border-sky-400 bg-gradient-to-r from-sky-500 to-cyan-500 text-white font-medium shadow-lg shadow-sky-200 transition hover:brightness-105" onClick={handleNext}>
                Next
              </button>
              <button type="button" className="h-[44px] min-w-[140px] rounded-xl border border-sky-400 bg-white text-sky-600 font-medium shadow-md shadow-sky-100 transition hover:-translate-y-0.5 hover:shadow-lg" onClick={handleEdit}>
                Edit
              </button>
              <button type="button" className="h-[44px] min-w-[190px] rounded-xl border border-amber-400 bg-amber-50 text-amber-700 font-medium shadow-md shadow-amber-100 transition hover:-translate-y-0.5 hover:shadow-lg" onClick={handleInstallBundled}>
                Install bundled package
              </button>
              <button type="button" className="h-[44px] min-w-[220px] rounded-xl border border-amber-400 bg-white text-amber-700 font-medium shadow-md shadow-amber-100 transition hover:-translate-y-0.5 hover:shadow-lg" onClick={handleInstallUploaded}>
                Install CDISC SEND text file
              </button>
            </div>

            <input ref={packageFileInputRef} type="file" accept=".txt" className="hidden" onChange={handleUploadPackageFile} />
          </>
        ) : (
          <div className="space-y-5">
            <div className="rounded-2xl border border-sky-100 bg-gradient-to-r from-sky-50 to-cyan-50 px-4 py-3 text-[15px] font-semibold text-slate-700 flex items-center justify-between shadow-inner">
              <span>Controlled Terminology Type</span>
              <span className="rounded-full bg-white px-3 py-1 text-sky-700 shadow-sm">{selectedType}</span>
            </div>

            <div>
              <label className="mb-2 block text-[13px] font-medium text-slate-600">Name</label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full rounded-xl border border-sky-200 bg-slate-50 px-3 py-2.5 text-[14px] text-slate-700 shadow-sm outline-none transition focus:border-sky-400 focus:bg-white focus:shadow-[0_0_0_3px_rgba(14,165,233,0.12)]"
              />
            </div>

            <div>
              <label className="mb-2 block text-[13px] font-medium text-slate-600">Description</label>
              <textarea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                className="w-full min-h-[120px] resize-none rounded-xl border border-sky-200 bg-slate-50 px-3 py-2.5 text-[14px] text-slate-700 shadow-sm outline-none transition focus:border-sky-400 focus:bg-white focus:shadow-[0_0_0_3px_rgba(14,165,233,0.12)]"
              />
            </div>

            <div className="max-w-[420px] mx-auto">
              <label className="sr-only" htmlFor="ct-edit-reason">
                Reason for edit
              </label>
              <select
                id="ct-edit-reason"
                value={selectedEditReason}
                onChange={(e) => setSelectedEditReason(e.target.value)}
                className="w-full h-[46px] rounded-xl border border-sky-300 bg-white text-[14px] text-slate-700 px-3 shadow-sm outline-none transition focus:border-sky-500 focus:shadow-[0_0_0_3px_rgba(14,165,233,0.12)]"
                aria-label="Reason for edit"
              >
                <option value="">Reason 1 for edit a record</option>
                {EDIT_REASONS.map((reason) => (
                  <option key={reason} value={reason}>
                    {reason}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                className="h-[44px] min-w-[120px] rounded-xl border border-sky-400 bg-gradient-to-r from-sky-500 to-cyan-500 text-white font-medium shadow-lg shadow-sky-200 transition hover:brightness-105"
                onClick={handleEditSave}
              >
                Done
              </button>
              <button
                type="button"
                className="h-[44px] min-w-[120px] rounded-xl border border-sky-400 bg-white text-sky-600 font-medium shadow-md shadow-sky-100 transition hover:-translate-y-0.5 hover:shadow-lg"
                onClick={handleEditCancel}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
