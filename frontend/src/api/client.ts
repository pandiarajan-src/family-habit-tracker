// Fetch wrapper for /api/v1 (plan: cross-cutting "FE data").
// - Echoes the `csrf_token` cookie in `X-CSRF-Token` on every non-GET request.
// - Marks background refreshes with `X-Background-Refresh: 1` so they don't count as activity (REQ-004).
// - Maps errors: a 401 `FamilyPasscode` means the family session is gone, a 403 means the
//   session changed under us; both are announced to the SessionProvider through `onApiEvent`.
//   A 401 `MemberPIN` is left to the screen where the PIN was typed (spec §4 "Which 401", C18).

export const API_BASE = '/api/v1'
export const CSRF_COOKIE = 'csrf_token'
export const CSRF_HEADER = 'X-CSRF-Token'
export const BACKGROUND_HEADER = 'X-Background-Refresh'

export type Challenge = 'FamilyPasscode' | 'MemberPIN'

export class ApiError extends Error {
  readonly status: number
  readonly challenge: Challenge | null
  /** Seconds from the `Retry-After` header (429s), or null. */
  readonly retryAfter: number | null

  constructor(status: number, challenge: Challenge | null, retryAfter: number | null) {
    super(`API request failed with status ${status}`)
    this.name = 'ApiError'
    this.status = status
    this.challenge = challenge
    this.retryAfter = retryAfter
  }
}

export type ApiEvent =
  /** A person-initiated request started: the server counts it as activity (REQ-004). */
  | { type: 'activity' }
  /** The server says the family session is missing or ended. */
  | { type: 'signed-out' }
  /** The server refused a request: the acting member may have changed. */
  | { type: 'forbidden' }

type Listener = (event: ApiEvent) => void
const listeners = new Set<Listener>()

export function onApiEvent(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function emit(event: ApiEvent) {
  for (const listener of [...listeners]) listener(event)
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  body?: unknown
  /** Polling only (set by `usePolling`): the server won't extend the session. */
  background?: boolean
  /** Don't announce a 401/403 (used where the screen handles it, e.g. passcode entry). */
  quiet?: boolean
  signal?: AbortSignal
}

export function readCookie(name: string): string | null {
  for (const part of document.cookie.split(';')) {
    const [key, ...rest] = part.trim().split('=')
    if (key === name) return decodeURIComponent(rest.join('='))
  }
  return null
}

function parseChallenge(header: string | null): Challenge | null {
  if (header === 'FamilyPasscode' || header === 'MemberPIN') return header
  return null
}

function parseRetryAfter(header: string | null): number | null {
  if (header === null) return null
  const seconds = Number(header)
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : null
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? 'GET'
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (options.body !== undefined) headers['Content-Type'] = 'application/json'
  if (method !== 'GET') {
    const token = readCookie(CSRF_COOKIE)
    if (token) headers[CSRF_HEADER] = token
  }
  if (options.background) headers[BACKGROUND_HEADER] = '1'
  else emit({ type: 'activity' })

  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    credentials: 'same-origin',
    signal: options.signal,
  })

  if (!response.ok) {
    const challenge = parseChallenge(response.headers.get('WWW-Authenticate'))
    const error = new ApiError(
      response.status,
      challenge,
      parseRetryAfter(response.headers.get('Retry-After')),
    )
    if (!options.quiet) {
      if (response.status === 401 && challenge !== 'MemberPIN') emit({ type: 'signed-out' })
      if (response.status === 403) emit({ type: 'forbidden' })
    }
    throw error
  }
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

export function isApiError(error: unknown, status?: number): error is ApiError {
  return error instanceof ApiError && (status === undefined || error.status === status)
}
