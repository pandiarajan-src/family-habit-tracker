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
})
