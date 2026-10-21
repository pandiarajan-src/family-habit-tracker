// A tiny `fetch` stub for /api/v1 (plan: chosen over MSW to keep the toolchain small).
// Routes are "METHOD /path" without the /api/v1 prefix or the query string.
import { vi } from 'vitest'

export interface ApiCall {
  method: string
  path: string
  query: URLSearchParams
  headers: Headers
  body: unknown
}

export type Handler = (call: ApiCall) => Response | Promise<Response>
export type Routes = Record<string, Handler>

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

export function problem(status: number, headers: Record<string, string> = {}): Response {
  return json({ detail: 'Problem' }, status, headers)
}

export const passcode401 = () => problem(401, { 'WWW-Authenticate': 'FamilyPasscode' })
export const pin401 = () => problem(401, { 'WWW-Authenticate': 'MemberPIN' })

export interface MockApi {
  calls: ApiCall[]
  /** Calls to one route, e.g. `callsTo('PATCH /sessions/current')`. */
  callsTo: (route: string) => ApiCall[]
  /** Replace or add routes mid-test. */
  use: (routes: Routes) => void
}

export function mockApi(initial: Routes = {}): MockApi {
  const routes: Routes = { ...initial }
  const calls: ApiCall[] = []
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(String(input), 'http://localhost')
    const call: ApiCall = {
      method: init.method ?? 'GET',
      path: url.pathname.replace(/^\/api\/v1/, ''),
      query: url.searchParams,
      headers: new Headers(init.headers),
      body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
    }
    calls.push(call)
    if (init.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    const handler = routes[`${call.method} ${call.path}`]
    if (!handler) throw new Error(`Unmocked request: ${call.method} ${call.path}`)
    return handler(call)
  })
  vi.stubGlobal('fetch', fetchMock)
  return {
    calls,
    callsTo: (route) => calls.filter((c) => `${c.method} ${c.path}` === route),
    use: (more) => Object.assign(routes, more),
  }
}
