import axios from 'axios'

const BASE = import.meta.env.VITE_API_URL || ''
export const api = axios.create({ baseURL: `${BASE}/api/v1`, headers: { 'Content-Type': 'application/json' } })

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})
api.interceptors.response.use((res) => res, (err) => {
  if (err.response?.status === 401) { localStorage.removeItem('access_token'); window.location.href = '/login' }
  return Promise.reject(err)
})

export const login = (email: string, password: string) => api.post('/auth/login', { email, password })
export const getStudies = () => api.get('/studies/')
export const getStudy = (id: string) => api.get(`/studies/${id}`)
export const createStudy = (data: Record<string, unknown>) => api.post('/studies/', data)
export const updateStudy = (id: string, data: Record<string, unknown>) => api.patch(`/studies/${id}`, data)
export const deleteStudy = (id: string) => api.delete(`/studies/${id}`)
export const uploadFile = (studyId: string, file: File, domainHint = 'AUTO') => {
  const form = new FormData(); form.append('file', file); form.append('domain_hint', domainHint)
  return api.post(`/ingestion/${studyId}/upload`, form, { headers: { 'Content-Type': 'multipart/form-data' } })
}
export const getTaskStatus = (taskId: string) => api.get(`/ingestion/task/${taskId}`)
export const runTransformation = (studyId: string, domainCodes: string[]) => api.post(`/transformation/${studyId}/run`, { domain_codes: domainCodes })
export const getDomains = (studyId: string) => api.get(`/transformation/${studyId}/domains`)
export const runValidation = (studyId: string, domainCodes: string[]) => api.post(`/validation/${studyId}/run`, { domain_codes: domainCodes })
export const getValidationResults = (studyId: string) => api.get(`/validation/${studyId}/results`)
export const generatePackage = (studyId: string) => api.post(`/reports/${studyId}/package`, { include_define_xml: true, include_sdrg: true, include_xpt: true })
export const getAuditTrail = (studyId: string) => api.get(`/reports/${studyId}/audit-trail`)
