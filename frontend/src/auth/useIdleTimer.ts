import { useEffect, useRef } from 'react'
import { onApiEvent } from '../api/client'

/** The server ends the family session and acting member after 5 idle minutes (REQ-004). */
export const IDLE_TIMEOUT_MS = 5 * 60 * 1000

/**
 * Calls `onIdle` after `timeoutMs` without a person-initiated request, while `enabled`.
 *
 * The timer restarts on the activity the server counts (a request a person triggered), not
 * on every tap, so the device never looks signed in after the server has ended the session.
 * The server stays the authority: its 401 signs the device out even if this timer hasn't fired.
 */
export function useIdleTimer(
  enabled: boolean,
  onIdle: () => void,
  timeoutMs: number = IDLE_TIMEOUT_MS,
): void {
  const onIdleRef = useRef(onIdle)

  useEffect(() => {
    onIdleRef.current = onIdle
  })

  useEffect(() => {
    if (!enabled) return
    let timer = window.setTimeout(() => onIdleRef.current(), timeoutMs)
    const unsubscribe = onApiEvent((event) => {
      if (event.type !== 'activity') return
      window.clearTimeout(timer)
      timer = window.setTimeout(() => onIdleRef.current(), timeoutMs)
    })
    return () => {
      window.clearTimeout(timer)
      unsubscribe()
    }
  }, [enabled, timeoutMs])
}
