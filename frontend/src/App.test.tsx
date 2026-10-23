import { act, render, renderHook, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import App from './App'
import { apiRequest } from './api/client'
import { IDLE_TIMEOUT_MS } from './auth/useIdleTimer'
import { useSession } from './auth/useSession'
import { boardRoutes, dad, mia, session, TODAY } from './test/fixtures'
import { json, mockApi, passcode401, problem } from './test/mockApi'
import { renderApp } from './test/renderWithProviders'

function mainNav() {
  return screen.getByRole('navigation', { name: 'Main' })
}

describe('App', () => {
  it('renders in the browser router, starting at Passcode entry without a session', async () => {
    mockApi({ 'GET /sessions/current': passcode401 })
    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Welcome back!' })).toBeInTheDocument()
  })

  it('shows a loading message until the session is known', async () => {
    let answer: (response: Response) => void = () => {}
    mockApi({ 'GET /sessions/current': () => new Promise((resolve) => (answer = resolve)) })
    renderApp({ route: '/' })

    expect(screen.getByText('Loading…')).toBeInTheDocument()
    await act(async () => answer(passcode401()))
    expect(screen.getByRole('heading', { name: 'Welcome back!' })).toBeInTheDocument()
  })

  it('treats an unreachable server on load as signed out', async () => {
    mockApi({ 'GET /sessions/current': () => Promise.reject(new TypeError('offline')) })
    renderApp({ route: '/' })

    expect(await screen.findByRole('heading', { name: 'Welcome back!' })).toBeInTheDocument()
  })

  it('sends unknown paths to the board', async () => {
    mockApi(boardRoutes())
    renderApp({ route: '/nowhere' })

    expect(await screen.findByRole('heading', { name: "Who's checking in?" })).toBeInTheDocument()
  })

  it('useSession needs the provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => renderHook(() => useSession())).toThrow(/inside <SessionProvider>/)
  })
})

describe('REQ-003 member screens need someone checking in', () => {
  it('a device with nobody checking in goes to the board', async () => {
    mockApi(boardRoutes(null))
    renderApp({ route: '/my-day' })

    expect(await screen.findByRole('heading', { name: "Who's checking in?" })).toBeInTheDocument()
    expect(screen.getByLabelText('Current path')).toHaveTextContent(/^\/$/)
  })

  it.each([
    ['/history', 'History'],
    ['/gems', 'Gems & prizes'],
    ['/habits', 'My habits'],
    ['/habits/new', 'Edit habit'],
    ['/habits/some-id', 'Edit habit'],
    ['/my-pin', 'My PIN'],
  ])('%s is registered for later phases', async (route, title) => {
    mockApi(boardRoutes(mia))
    renderApp({ route })

    expect(await screen.findByRole('heading', { level: 1, name: title })).toBeInTheDocument()
    expect(screen.getByText('This screen is on its way')).toBeInTheDocument()
  })
})

describe('REQ-028 app header and tabs', () => {
  it('a child sees their chip and four tabs, and no Parent tab', async () => {
    mockApi(boardRoutes(mia))
    renderApp({ route: '/my-day' })

    await screen.findByRole('heading', { level: 1, name: /Here’s your day/ })
    expect(screen.getByText('Mia')).toBeInTheDocument()
    const links = within(mainNav()).getAllByRole('link')
    expect(links.map((link) => link.textContent)).toEqual([
      'My day',
      'History',
      'Gems & prizes',
      'My habits',
    ])
    expect(within(mainNav()).queryByRole('link', { name: 'Parent' })).not.toBeInTheDocument()
    expect(within(mainNav()).getByRole('link', { name: 'My day' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  it('tabs move between screens', async () => {
    mockApi(boardRoutes(mia))
    const { user } = renderApp({ route: '/my-day' })

    await user.click(await screen.findByRole('link', { name: 'Gems & prizes' }))

    expect(await screen.findByRole('heading', { name: 'Gems & prizes' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Gems & prizes' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  it('a child who opens a parent page lands on My day', async () => {
    mockApi(boardRoutes(mia))
    renderApp({ route: '/parent/settings' })

    expect(
      await screen.findByRole('heading', { level: 1, name: /Here’s your day/ }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Current path')).toHaveTextContent('/my-day')
  })

  it('a parent gets the Parent tab with Approvals & prizes and Family settings', async () => {
    mockApi(boardRoutes(dad))
    const { user } = renderApp({ route: '/my-day' })

    expect(await screen.findByText('Dad (parent)')).toBeInTheDocument()
    await user.click(within(mainNav()).getByRole('link', { name: 'Parent' }))

    expect(await screen.findByRole('heading', { name: 'Approvals & prizes' })).toBeInTheDocument()
    expect(screen.getByLabelText('Current path')).toHaveTextContent('/parent/approvals')
    const sections = screen.getByRole('navigation', { name: 'Parent' })
    await user.click(within(sections).getByRole('link', { name: 'Family settings' }))
    expect(await screen.findByRole('heading', { name: 'Family settings' })).toBeInTheDocument()
    expect(within(mainNav()).getByRole('link', { name: 'Parent' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })
})

describe('REQ-004 hand over and idle timeout', () => {
  it('"Done — switch person" clears the acting member and shows the board', async () => {
    const api = mockApi({
      ...boardRoutes(mia),
      'PATCH /sessions/current': () => json(session(null)),
    })
    const { user } = renderApp({ route: '/my-day' })

    await user.click(await screen.findByRole('button', { name: 'Done — switch person' }))

    expect(await screen.findByRole('heading', { name: "Who's checking in?" })).toBeInTheDocument()
    expect(api.callsTo('PATCH /sessions/current')[0].body).toEqual({ acting_member_id: null })
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument()
  })

  it('stays put if switching person does not go through', async () => {
    mockApi({ ...boardRoutes(mia), 'PATCH /sessions/current': () => problem(500) })
    const { user } = renderApp({ route: '/my-day' })
    const button = await screen.findByRole('button', { name: 'Done — switch person' })

    await user.click(button)

    expect(await screen.findByRole('button', { name: 'Done — switch person' })).toBeEnabled()
    expect(screen.getByLabelText('Current path')).toHaveTextContent('/my-day')
  })

  it('after 5 quiet minutes shows Passcode entry with the kind note', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, now: TODAY })
    mockApi(boardRoutes(mia))
    renderApp({ route: '/my-day', fakeTimers: true })
    await screen.findByRole('heading', { level: 1, name: /Here’s your day/ })

    await act(() => vi.advanceTimersByTimeAsync(IDLE_TIMEOUT_MS - 1000))
    expect(screen.getByRole('heading', { level: 1, name: /Here’s your day/ })).toBeInTheDocument()
    await act(() => vi.advanceTimersByTimeAsync(1000))

    expect(screen.getByRole('heading', { name: 'Welcome back!' })).toBeInTheDocument()
    expect(screen.getByText('You were signed out to keep things safe.')).toBeInTheDocument()
    expect(screen.getByText('Unlock to carry on!')).toBeInTheDocument()
  })

  it('a request a person makes restarts the 5 minutes; background refreshes do not', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, now: TODAY })
    mockApi(boardRoutes(mia))
    renderApp({ route: '/my-day', fakeTimers: true })
    await screen.findByRole('heading', { level: 1, name: /Here’s your day/ })

    await act(() => vi.advanceTimersByTimeAsync(4 * 60_000))
    await act(() => apiRequest('/members'))
    await act(() => vi.advanceTimersByTimeAsync(4 * 60_000))
    await act(() => apiRequest('/members', { background: true }))
    expect(screen.getByRole('heading', { level: 1, name: /Here’s your day/ })).toBeInTheDocument()

    await act(() => vi.advanceTimersByTimeAsync(60_000))
    expect(screen.getByRole('heading', { name: 'Welcome back!' })).toBeInTheDocument()
  })

  it('a session ended on the server (401) shows Passcode entry with the note', async () => {
    const api = mockApi(boardRoutes(mia))
    renderApp({ route: '/my-day' })
    await screen.findByRole('heading', { level: 1, name: /Here’s your day/ })

    api.use({ 'GET /members': passcode401 })
    await act(() => apiRequest('/members').catch(() => {}))

    expect(screen.getByRole('heading', { name: 'Welcome back!' })).toBeInTheDocument()
    expect(screen.getByText('You were signed out to keep things safe.')).toBeInTheDocument()
  })

  it('a 403 re-reads the session in the background and follows it to the board', async () => {
    const api = mockApi({ ...boardRoutes(mia), 'PUT /x': () => problem(403) })
    renderApp({ route: '/my-day' })
    await screen.findByRole('heading', { level: 1, name: /Here’s your day/ })

    api.use({ 'GET /sessions/current': () => json(session(null)) })
    await act(() => apiRequest('/x', { method: 'PUT' }).catch(() => {}))

    expect(await screen.findByRole('heading', { name: "Who's checking in?" })).toBeInTheDocument()
    const reread = api.callsTo('GET /sessions/current').at(-1)
    expect(reread?.headers.get('X-Background-Refresh')).toBe('1')
  })

  it('a 403 whose session re-read fails leaves the screen as it is', async () => {
    const api = mockApi({ ...boardRoutes(mia), 'PUT /x': () => problem(403) })
    renderApp({ route: '/my-day' })
    await screen.findByRole('heading', { level: 1, name: /Here’s your day/ })

    api.use({ 'GET /sessions/current': () => problem(500) })
    await act(() => apiRequest('/x', { method: 'PUT' }).catch(() => {}))

    expect(screen.getByRole('heading', { level: 1, name: /Here’s your day/ })).toBeInTheDocument()
  })
})
