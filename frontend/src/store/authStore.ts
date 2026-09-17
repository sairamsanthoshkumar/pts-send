import { create } from 'zustand'
import type { User } from '../types'

interface AuthState {
  user: User | null
  token: string | null
  dateFormat: string
  language: string
  setAuth: (user: User, token: string, dateFormat?: string, language?: string) => void
  logout: () => void
  isAuthenticated: () => boolean
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: JSON.parse(localStorage.getItem('pts_user') || 'null'),
  token: localStorage.getItem('access_token'),
  dateFormat: localStorage.getItem('pts_date_format') || 'MM/DD/YYYY',
  language: localStorage.getItem('pts_language') || 'en',
  setAuth: (user, token, dateFormat = 'MM/DD/YYYY', language = 'en') => {
    localStorage.setItem('access_token', token)
    localStorage.setItem('pts_user', JSON.stringify(user))
    set({ user, token, dateFormat, language })
  },
  logout: () => {
    localStorage.removeItem('access_token')
      localStorage.removeItem('pts_user')
    set({ user: null, token: null })
  },
  isAuthenticated: () => !!get().token,
}))
