import { Navigate, Outlet, useLocation, useParams } from 'react-router-dom'
import { useAuth } from './AuthContext'
import { ROLES } from './roles'
import { useAppData } from '../hooks/useAppData'

/** Requires a signed-in user; optionally a specific permission. */
export function ProtectedRoute({ permission }) {
  const { user, can } = useAuth()
  const location = useLocation()

  if (!user) return <Navigate to="/login" state={{ from: location }} replace />
  if (permission && !can(permission)) return <Navigate to="/unauthorized" replace />
  return <Outlet />
}

/**
 * Per-area access for the /areas/:aoiId/* workspace. Admins see every
 * area; a Ranger may only enter an area they're assigned via
 * /api/rangers — see RangerAssignment in backend/database.py. This is
 * UI-side scoping only; the backend does not yet enforce it server-side
 * (no auth layer exists), so it should not be treated as a security
 * boundary until real auth ships.
 */
export function AreaAccessGuard() {
  const { user } = useAuth()
  const { aoiId } = useParams()
  const { rangers, rangersLoaded } = useAppData()

  if (user.role === ROLES.ADMIN) return <Outlet />
  if (!rangersLoaded) return null

  const assigned = rangers.find(r => r.name === user.name)?.aoi_ids || []
  if (!assigned.includes(aoiId)) return <Navigate to="/unauthorized" replace />
  return <Outlet />
}
