import { Navigate, Outlet } from 'react-router'
import { Loading } from '../components/Loading'
import { useSession } from './useSession'

/** Every page except Passcode entry needs a family session (REQ-001, [child-data-privacy #3]). */
export function RequireFamily() {
  const { state } = useSession()
  if (state.status === 'loading') return <Loading />
  if (state.status === 'signed-out') return <Navigate to="/unlock" replace />
  return <Outlet />
}
