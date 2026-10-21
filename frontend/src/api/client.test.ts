import { afterEach, describe, expect, it, vi } from 'vitest'
import { json, mockApi, passcode401, pin401, problem } from '../test/mockApi'
import { ApiError, apiRequest, isApiError, onApiEvent, readCookie, type ApiEvent } from './client'

function listen() {
  const events: ApiEvent['type'][] = []
  const stop = onApiEvent((event) => events.push(event.type))
  return { events, stop }
}

let stopListening: () => void = () => {}
afterEach(() => stopListening())

describe('apiRequest', () => {
  it('calls /api/v1 with the same-origin cookie and parses JSON', async () => {
    const api = mockApi({ 'GET /members': () => json([{ id: 'm1' }]) })

    await expect(apiRequest('/members')).resolves.toEqual([{ id: 'm1' }])

    const fetchMock = vi.mocked(fetch)
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/members')
    expect(fetchMock.mock.calls[0][1]?.credentials).toBe('same-origin')
    expect(api.calls[0].headers.get('Content-Type')).toBeNull()
  })

  it('echoes the csrf_token cookie in X-CSRF-Token on writes but not on reads', async () => {
    document.cookie = 'other=1'
    document.cookie = 'csrf_token=abc%3D123'
    const api = mockApi({
      'GET /members': () => json([]),
      'PATCH /sessions/current': () => json({}),
    })

    await apiRequest('/members')
    await apiRequest('/sessions/current', { method: 'PATCH', body: { acting_member_id: null } })

    expect(api.calls[0].headers.get('X-CSRF-Token')).toBeNull()
    expect(api.calls[1].headers.get('X-CSRF-Token')).toBe('abc=123')
    expect(api.calls[1].headers.get('Content-Type')).toBe('application/json')
    expect(api.calls[1].body).toEqual({ acting_member_id: null })
  })

  it('sends no CSRF header when the cookie is missing (the server answers 403)', async () => {
    const api = mockApi({ 'POST /sessions': () => json({}, 201) })

    await apiRequest('/sessions', { method: 'POST', body: { passcode: 'x' } })

    expect(api.calls[0].headers.get('X-CSRF-Token')).toBeNull()
  })

  it('returns undefined for a 204', async () => {
    mockApi({ 'DELETE /sessions/current': () => new Response(null, { status: 204 }) })

    await expect(apiRequest('/sessions/current', { method: 'DELETE' })).resolves.toBeUndefined()
  })
})

describe('REQ-004 background refresh marker', () => {
  it('marks background requests and does not report them as activity', async () => {
    const { events, stop } = listen()
    stopListening = stop
    const api = mockApi({ 'GET /members': () => json([]) })

    await apiRequest('/members', { background: true })

    expect(api.calls[0].headers.get('X-Background-Refresh')).toBe('1')
    expect(events).toEqual([])
  })

  it('reports a person-initiated request as activity, without the marker', async () => {
    const { events, stop } = listen()
    stopListening = stop
    const api = mockApi({ 'GET /members': () => json([]) })

    await apiRequest('/members')

    expect(api.calls[0].headers.get('X-Background-Refresh')).toBeNull()
    expect(events).toEqual(['activity'])
  })
})

describe('REQ-001/003 error mapping by WWW-Authenticate (C18)', () => {
  it('a 401 FamilyPasscode throws and announces signed-out', async () => {
    const { events, stop } = listen()
    stopListening = stop
    mockApi({ 'GET /members': passcode401 })

    const error = await apiRequest('/members').catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 401, challenge: 'FamilyPasscode', retryAfter: null })
    expect(events).toEqual(['activity', 'signed-out'])
  })

  it('a 401 without a known challenge is treated as signed out', async () => {
    const { events, stop } = listen()
    stopListening = stop
    mockApi({ 'GET /members': () => problem(401, { 'WWW-Authenticate': 'Basic' }) })

    const error = await apiRequest('/members').catch((e: unknown) => e)

    expect(error).toMatchObject({ challenge: null })
    expect(events).toContain('signed-out')
  })

  it('a 401 MemberPIN is left to the screen', async () => {
    const { events, stop } = listen()
    stopListening = stop
    mockApi({ 'PATCH /sessions/current': pin401 })

    const error = await apiRequest('/sessions/current', { method: 'PATCH', body: {} }).catch(
      (e: unknown) => e,
    )

    expect(error).toMatchObject({ status: 401, challenge: 'MemberPIN' })
    expect(events).toEqual(['activity'])
  })

  it('a 403 announces forbidden', async () => {
    const { events, stop } = listen()
    stopListening = stop
    mockApi({ 'PATCH /sessions/current': () => problem(403) })

    await expect(apiRequest('/sessions/current', { method: 'PATCH' })).rejects.toThrow(ApiError)

    expect(events).toEqual(['activity', 'forbidden'])
  })

  it('quiet requests announce nothing', async () => {
    const { events, stop } = listen()
    stopListening = stop
    mockApi({ 'POST /sessions': passcode401, 'GET /x': () => problem(403) })

    await apiRequest('/sessions', { method: 'POST', quiet: true }).catch(() => {})
    await apiRequest('/x', { quiet: true }).catch(() => {})

    expect(events).toEqual(['activity', 'activity'])
  })

  it('reads Retry-After seconds on a 429, ignoring a value that is not a number', async () => {
    mockApi({
      'POST /sessions': () => problem(429, { 'Retry-After': '900' }),
      'PATCH /sessions/current': () => problem(429, { 'Retry-After': 'soon' }),
    })

    await expect(apiRequest('/sessions', { method: 'POST' })).rejects.toMatchObject({
      status: 429,
      retryAfter: 900,
    })
    await expect(apiRequest('/sessions/current', { method: 'PATCH' })).rejects.toMatchObject({
      retryAfter: null,
    })
  })

  it('stops calling a listener after it unsubscribes', async () => {
    const { events, stop } = listen()
    stop()
    mockApi({ 'GET /members': () => json([]) })

    await apiRequest('/members')

    expect(events).toEqual([])
  })
})

describe('helpers', () => {
  it('isApiError checks the type and, optionally, the status', () => {
    const error = new ApiError(429, null, 5)
    expect(isApiError(error)).toBe(true)
    expect(isApiError(error, 429)).toBe(true)
    expect(isApiError(error, 401)).toBe(false)
    expect(isApiError(new Error('x'))).toBe(false)
    expect(error.message).toContain('429')
  })

  it('readCookie returns null for a missing cookie', () => {
    expect(readCookie('nope')).toBeNull()
  })
})
