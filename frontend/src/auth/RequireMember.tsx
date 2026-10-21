import { Navigate, Outlet } from 'react-router'
import { useActiveSession } from './useSession'

/** Member screens need someone checking in; otherwise the device shows the board (REQ-003). */
export function RequireMember() {
  const session = useActiveSession()
  if (!session?.acting_member) return <Navigate to="/" replace />
  return <Outlet />
}
