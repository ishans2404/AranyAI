import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import { AppDataProvider } from './hooks/useAppData'
import { ProtectedRoute, AreaAccessGuard } from './auth/ProtectedRoute'
import { PERMISSIONS } from './auth/roles'

import Login from './pages/Login'
import { Unauthorized, NotFound } from './pages/Fallback'
import AppLayout from './layouts/AppLayout'
import AreaWorkspaceLayout from './layouts/AreaWorkspaceLayout'
import Dashboard from './pages/Dashboard'
import Alerts from './pages/Alerts'
import Areas from './pages/Areas'
import Monitor from './pages/Monitor'
import AreaAlerts from './pages/AreaAlerts'
import Rangers from './pages/Rangers'
import Reports from './pages/Reports'
import Settings from './pages/Settings'

/** Everything behind login shares one AOI/ranger fetch — mounted once,
 *  not refetched per route. */
function AuthedShell() {
  return (
    <AppDataProvider>
      <Outlet />
    </AppDataProvider>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/unauthorized" element={<Unauthorized />} />

          <Route element={<ProtectedRoute />}>
            <Route element={<AuthedShell />}>
              <Route element={<AppLayout />}>
                <Route index element={<Navigate to="/dashboard" replace />} />
                <Route path="dashboard" element={<Dashboard />} />
                <Route path="alerts" element={<Alerts />} />
                <Route path="areas" element={<Areas />} />

                <Route element={<AreaAccessGuard />}>
                  <Route path="areas/:aoiId" element={<AreaWorkspaceLayout />}>
                    <Route index element={<Navigate to="monitor" replace />} />
                    <Route path="monitor" element={<Monitor />} />
                    <Route path="alerts" element={<AreaAlerts />} />
                  </Route>
                </Route>

                <Route element={<ProtectedRoute permission={PERMISSIONS.MANAGE_RANGERS} />}>
                  <Route path="rangers" element={<Rangers />} />
                </Route>
                <Route element={<ProtectedRoute permission={PERMISSIONS.VIEW_REPORTS} />}>
                  <Route path="reports" element={<Reports />} />
                </Route>

                <Route path="settings" element={<Settings />} />
              </Route>
            </Route>
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
