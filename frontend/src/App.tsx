import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store/authStore'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import StudiesPage from './pages/StudiesPage'
import StudyDetailPage from './pages/StudyDetailPage'
import CTPage from './pages/CTPage'
import ConnectionPage from './pages/ConnectionPage'
import StudyLoadPage from './pages/StudyLoadPage'
import InputMappingPage from './pages/InputMappingPage'
import MeasurementSelectionPage from './pages/MeasurementSelectionPage'
import Layout from './components/common/Layout'

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated)
  return isAuthenticated() ? <>{children}</> : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
          <Route index                        element={<DashboardPage />} />
          <Route path="studies"               element={<StudiesPage />} />
          <Route path="studies/:id"           element={<StudyDetailPage />} />
          <Route path="ct"                    element={<CTPage />} />
          <Route path="setup/connection"      element={<ConnectionPage />} />
          <Route path="setup/load"            element={<StudyLoadPage />} />
          <Route path="setup/mapping"         element={<InputMappingPage />} />
          <Route path="setup/measurements"    element={<MeasurementSelectionPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
