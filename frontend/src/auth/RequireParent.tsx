import { Navigate, Outlet } from 'react-router'
import { useActiveSession } from './useSession'

/** The Parent tab's screens are for parents only; the API enforces the same rule (REQ-028). */
export function RequireParent() {
  const session = useActiveSession()
  if (session?.acting_member?.role !== 'parent') return <Navigate to="/my-day" replace />
  return <Outlet />
}
