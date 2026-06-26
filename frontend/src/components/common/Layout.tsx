/**
 * Root layout — PtsSEND top nav + main content area
 * Replaces the old sidebar layout with the horizontal nav from the spec
 */
import { Outlet } from 'react-router-dom'
import TopNav from './TopNav'

export default function Layout() {
  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <TopNav />
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
      {/* Footer — matches "Copyright © 2020 Xybion Medical Systems Corporation..." */}
      <footer className="text-center py-2 text-xs" style={{ color: '#6b7280', borderTop: '1px solid #e5e7eb', background: 'white' }}>
        Copyright © 2025 PtsSEND — PtsSEND - SEND Submission Platform. All Rights Reserved.
      </footer>
    </div>
  )
}
