import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import App from './App'

function mockFetch(response: Promise<Response>) {
  const fetchMock = vi.fn<typeof fetch>(() => response)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('App', () => {
  it('shows "API: ok" when the health check answers ok', async () => {
    const fetchMock = mockFetch(Promise.resolve(Response.json({ status: 'ok' })))

    render(<App />)

    expect(screen.getByRole('heading', { name: 'Family Habit Tracker' })).toBeInTheDocument()
    expect(await screen.findByText('API: ok')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/health', expect.anything())
  })

  it('shows a kind message when the API cannot be reached', async () => {
    mockFetch(Promise.reject(new TypeError('network down')))

    render(<App />)

    expect(await screen.findByRole('status')).toHaveTextContent(/not reachable yet/)
  })

  it('shows a kind message when the API answers with an error', async () => {
    mockFetch(Promise.resolve(new Response(null, { status: 503 })))

    render(<App />)

    expect(await screen.findByText(/not reachable yet/)).toBeInTheDocument()
  })

  it('shows a kind message when the API answers with a status other than ok', async () => {
    mockFetch(Promise.resolve(Response.json({ status: 'degraded' })))

    render(<App />)

    expect(await screen.findByText(/not reachable yet/)).toBeInTheDocument()
  })

  it('aborts the health check and ignores its result after unmounting', async () => {
    let resolve: (response: Response) => void = () => {}
    const fetchMock = mockFetch(new Promise<Response>((r) => (resolve = r)))

    const { unmount } = render(<App />)
    unmount()
    resolve(Response.json({ status: 'ok' }))

    const { signal } = fetchMock.mock.calls[0][1] as RequestInit
    expect(signal?.aborted).toBe(true)
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
  })
})
