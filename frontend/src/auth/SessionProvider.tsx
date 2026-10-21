import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { onApiEvent } from '../api/client'
import { api } from '../api/endpoints'
import type { SessionRead } from '../api/types'
import { useIdleTimer } from './useIdleTimer'
import { SessionContext, type SessionContextValue, type SessionState } from './useSession'

interface Props {
  children: ReactNode
  /** Tests shorten this; the app uses the 5-minute default (REQ-004). */
  idleTimeoutMs?: number
}

/**
 * Holds this device's family session and acting member (REQ-001, 003, 004).
 * Asks the server once on load, then follows unlock / PIN / switch-person answers.
 * A 401 `FamilyPasscode` from any request, or 5 quiet minutes, signs the device out with the
 * idle note; a 403 re-reads the session so the route guards can send the device to the board.
 */
export function SessionProvider({ children, idleTimeoutMs }: Props) {
  const [state, setState] = useState<SessionState>({ status: 'loading' })

  useEffect(() => {
    const controller = new AbortController()
    api
      .getSession({ quiet: true, signal: controller.signal })
      .then((session) => setState({ status: 'active', session }))
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: 'signed-out', reason: null })
      })
    return () => controller.abort()
  }, [])

  const signOutIdle = useCallback(() => {
    setState((prev) => (prev.status === 'active' ? { status: 'signed-out', reason: 'idle' } : prev))
  }, [])

  const activate = useCallback((session: SessionRead) => {
    setState({ status: 'active', session })
  }, [])

  useEffect(
    () =>
      onApiEvent((event) => {
        if (event.type === 'signed-out') signOutIdle()
        if (event.type === 'forbidden') {
          // Not a person's action, so it mustn't extend the session.
          api
            .getSession({ background: true })
            .then(activate)
            .catch(() => {})
        }
      }),
    [activate, signOutIdle],
  )

  useIdleTimer(state.status === 'active', signOutIdle, idleTimeoutMs)

  const value = useMemo<SessionContextValue>(
    () => ({
      state,
      unlock: async (passcode) => activate(await api.createSession(passcode)),
      chooseMember: async (memberId, pin) => activate(await api.chooseMember(memberId, pin)),
      switchPerson: async () => activate(await api.switchPerson()),
    }),
    [state, activate],
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}
