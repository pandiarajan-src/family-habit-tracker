import { createContext, useContext } from 'react'
import type { SessionRead } from '../api/types'

export type SignedOutReason = 'idle' | null

export type SessionState =
  | { status: 'loading' }
  | { status: 'signed-out'; reason: SignedOutReason }
  | { status: 'active'; session: SessionRead }

export interface SessionContextValue {
  state: SessionState
  /** POST /sessions; throws the ApiError so Passcode entry can show 401/429. */
  unlock: (passcode: string) => Promise<void>
  /** PATCH /sessions/current with a PIN; throws the ApiError so the PIN pad can react. */
  chooseMember: (memberId: string, pin: string) => Promise<void>
  /** "Done — switch person": clears the acting member (REQ-004). */
  switchPerson: () => Promise<void>
}

export const SessionContext = createContext<SessionContextValue | null>(null)

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext)
  if (value === null) throw new Error('useSession must be used inside <SessionProvider>')
  return value
}

/** The session when the device is signed in, else null. */
export function useActiveSession(): SessionRead | null {
  const { state } = useSession()
  return state.status === 'active' ? state.session : null
}
