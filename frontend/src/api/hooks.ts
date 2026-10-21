import { useCallback, useEffect, useRef, useState } from 'react'

export const POLL_INTERVAL_MS = 30_000

export interface LoadOptions {
  background: boolean
  signal: AbortSignal
}

export type Loader<T> = (options: LoadOptions) => Promise<T>

export interface ReloadOptions {
  background?: boolean
}

export interface Resource<T> {
  /** The last data loaded; kept while a refresh is in flight or after a failed one. */
  data: T | undefined
  /** The last error, cleared by the next successful load. */
  error: unknown
  /** True only until the first load for this key finishes. */
  loading: boolean
  reload: (options?: ReloadOptions) => Promise<void>
}

interface State<T> {
  key: string
  data: T | undefined
  error: unknown
  settled: boolean
}

/**
 * Loads data for `key` on mount and whenever `key` changes; `reload()` fetches again.
 * A newer load aborts the one in flight, so a slow answer never overwrites a fresher one.
 */
export function useResource<T>(key: string, load: Loader<T>): Resource<T> {
  const [state, setState] = useState<State<T>>({
    key,
    data: undefined,
    error: null,
    settled: false,
  })
  const loadRef = useRef(load)
  const controllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    loadRef.current = load
  })

  const reload = useCallback(
    async (options: ReloadOptions = {}) => {
      controllerRef.current?.abort()
      const controller = new AbortController()
      controllerRef.current = controller
      try {
        const data = await loadRef.current({
          background: options.background ?? false,
          signal: controller.signal,
        })
        if (!controller.signal.aborted) setState({ key, data, error: null, settled: true })
      } catch (error) {
        if (!controller.signal.aborted) {
          setState((prev) => ({
            key,
            data: prev.key === key ? prev.data : undefined,
            error,
            settled: true,
          }))
        }
      }
    },
    [key],
  )

  useEffect(() => {
    void reload()
    return () => controllerRef.current?.abort()
  }, [reload])

  const current = state.key === key ? state : null
  return {
    data: current?.data,
    error: current?.error ?? null,
    loading: !current?.settled,
    reload,
  }
}

/**
 * Refreshes every 30 s and when the screen regains focus (REQ-012). This is the only place
 * that marks a request as a background refresh, so polling never extends the session (REQ-004).
 */
export function usePolling(
  refresh: (options: ReloadOptions) => unknown,
  intervalMs: number = POLL_INTERVAL_MS,
): void {
  const refreshRef = useRef(refresh)

  useEffect(() => {
    refreshRef.current = refresh
  })

  useEffect(() => {
    const tick = () => refreshRef.current({ background: true })
    const onVisibility = () => {
      if (document.visibilityState === 'visible') tick()
    }
    const timer = window.setInterval(tick, intervalMs)
    window.addEventListener('focus', tick)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', tick)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [intervalMs])
}
