import { act, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { boardRoutes, mia, session, TODAY } from '../test/fixtures'
import { json, mockApi, passcode401, pin401, problem } from '../test/mockApi'
import { renderApp } from '../test/renderWithProviders'

const PIN_ROUTE = `/pin/${mia.id}`

function dots() {
  return screen.getByRole('img', { name: /digits entered/ })
}

async function tap(user: ReturnType<typeof renderApp>['user'], digits: string) {
  for (const digit of digits) await user.click(screen.getByRole('button', { name: digit }))
}

describe('REQ-003 PIN pad', () => {
  it('a correct PIN typed on the keypad opens My day as that member', async () => {
    const api = mockApi({
      ...boardRoutes(),
      'PATCH /sessions/current': () => json(session(mia)),
    })
    const { user } = renderApp({ route: PIN_ROUTE })

    expect(await screen.findByRole('heading', { name: 'Enter Mia’s PIN' })).toBeInTheDocument()
    for (const digit of '0123456789') {
      expect(screen.getByRole('button', { name: digit })).toBeInTheDocument()
    }
    expect(screen.getByText(/A parent can reset it in Family settings/)).toBeInTheDocument()

    await tap(user, '123')
    expect(dots()).toHaveAccessibleName('3 of 4 digits entered')
    await tap(user, '4')

    expect(
      await screen.findByRole('heading', { level: 1, name: /Here’s your day/ }),
    ).toBeInTheDocument()
    expect(api.callsTo('PATCH /sessions/current')[0].body).toEqual({
      acting_member_id: mia.id,
      pin: '1234',
    })
    expect(screen.getByLabelText('Current path')).toHaveTextContent('/my-day')
  })

  it('works from the keyboard: number keys, Backspace and Escape', async () => {
    const api = mockApi({
      ...boardRoutes(),
      'PATCH /sessions/current': () => json(session(mia)),
    })
    const { user } = renderApp({ route: PIN_ROUTE })
    await screen.findByRole('heading', { name: 'Enter Mia’s PIN' })

    await user.keyboard('19{Backspace}')
    expect(dots()).toHaveAccessibleName('1 of 4 digits entered')
    await user.keyboard('{Control>}2{/Control}a')
    expect(dots()).toHaveAccessibleName('1 of 4 digits entered')
    await user.keyboard('234')

    expect(
      await screen.findByRole('heading', { level: 1, name: /Here’s your day/ }),
    ).toBeInTheDocument()
    expect(api.callsTo('PATCH /sessions/current')[0].body).toMatchObject({ pin: '1234' })
  })

  it('Delete removes the last digit and is off when the pad is empty', async () => {
    mockApi(boardRoutes())
    const { user } = renderApp({ route: PIN_ROUTE })
    await screen.findByRole('heading', { name: 'Enter Mia’s PIN' })
    const del = screen.getByRole('button', { name: 'Delete' })

    expect(del).toBeDisabled()
    await tap(user, '12')
    await user.click(del)

    expect(dots()).toHaveAccessibleName('1 of 4 digits entered')
  })

  it('a 401 MemberPIN clears the pad and says "Not quite — have another go"', async () => {
    const api = mockApi({ ...boardRoutes(), 'PATCH /sessions/current': pin401 })
    const { user } = renderApp({ route: PIN_ROUTE })
    await screen.findByRole('heading', { name: 'Enter Mia’s PIN' })

    await tap(user, '9999')

    expect(await screen.findByText('Not quite — have another go')).toBeInTheDocument()
    expect(dots()).toHaveAccessibleName('0 of 4 digits entered')
    expect(screen.getByLabelText('Current path')).toHaveTextContent(PIN_ROUTE)

    await tap(user, '1')
    expect(screen.queryByText('Not quite — have another go')).not.toBeInTheDocument()
    expect(api.callsTo('PATCH /sessions/current')).toHaveLength(1)
  })

  it('a 401 FamilyPasscode goes to Passcode entry with the idle note', async () => {
    const api = mockApi({ ...boardRoutes(), 'PATCH /sessions/current': passcode401 })
    const { user } = renderApp({ route: PIN_ROUTE })
    await screen.findByRole('heading', { name: 'Enter Mia’s PIN' })

    api.use({ 'GET /sessions/current': passcode401 })
    await tap(user, '1234')

    expect(await screen.findByRole('heading', { name: 'Welcome back!' })).toBeInTheDocument()
    expect(screen.getByText('You were signed out to keep things safe.')).toBeInTheDocument()
  })

  it('a 429 asks for a parent or a short wait and disables the keypad until it ends', async () => {
    // Kept under 5 minutes: waiting out a full 5-minute lockout without touching anything
    // also ends the session (REQ-004 idle timeout), which the next test covers.
    vi.useFakeTimers({ shouldAdvanceTime: true, now: TODAY })
    mockApi({
      ...boardRoutes(),
      'PATCH /sessions/current': () => problem(429, { 'Retry-After': '180' }),
    })
    const { user } = renderApp({ route: PIN_ROUTE, fakeTimers: true })
    await screen.findByRole('heading', { name: 'Enter Mia’s PIN' })

    await tap(user, '1234')

    expect(
      await screen.findByText('Let’s take a break — ask a parent, or try again in 3 minutes.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '1' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '0' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Back' })).toBeEnabled()
    await user.keyboard('12{Backspace}')
    expect(dots()).toHaveAccessibleName('0 of 4 digits entered')

    await act(() => vi.advanceTimersByTimeAsync(61_000))
    expect(screen.getByText(/try again in 2 minutes/)).toBeInTheDocument()

    await act(() => vi.advanceTimersByTimeAsync(120_000))
    expect(screen.getByRole('button', { name: '1' })).toBeEnabled()
    expect(screen.queryByText(/take a break/)).not.toBeInTheDocument()
  })

  it('REQ-004 waiting out a full lockout untouched also signs the device out', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, now: TODAY })
    mockApi({
      ...boardRoutes(),
      'PATCH /sessions/current': () => problem(429, { 'Retry-After': '300' }),
    })
    const { user } = renderApp({ route: PIN_ROUTE, fakeTimers: true })
    await screen.findByRole('heading', { name: 'Enter Mia’s PIN' })

    await tap(user, '1234')
    await screen.findByText(/try again in 5 minutes/)
    await act(() => vi.advanceTimersByTimeAsync(300_000))

    expect(await screen.findByRole('heading', { name: 'Welcome back!' })).toBeInTheDocument()
  })

  it('a 429 without Retry-After uses the 5-minute lockout', async () => {
    mockApi({ ...boardRoutes(), 'PATCH /sessions/current': () => problem(429) })
    const { user } = renderApp({ route: PIN_ROUTE })
    await screen.findByRole('heading', { name: 'Enter Mia’s PIN' })

    await tap(user, '1234')

    expect(await screen.findByText(/try again in 5 minutes/)).toBeInTheDocument()
  })

  it('shows "Checking…" and ignores more digits while the PIN is checked', async () => {
    let answer: (response: Response) => void = () => {}
    const api = mockApi({
      ...boardRoutes(),
      'PATCH /sessions/current': () => new Promise((resolve) => (answer = resolve)),
    })
    const { user } = renderApp({ route: PIN_ROUTE })
    await screen.findByRole('heading', { name: 'Enter Mia’s PIN' })

    await tap(user, '1234')
    expect(screen.getByText('Checking…')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '5' })).toBeDisabled()
    await user.keyboard('5')

    await act(async () => answer(pin401()))
    expect(api.callsTo('PATCH /sessions/current')).toHaveLength(1)
    expect(screen.getByText('Not quite — have another go')).toBeInTheDocument()
  })

  it('says so kindly when the PIN cannot be checked', async () => {
    mockApi({ ...boardRoutes(), 'PATCH /sessions/current': () => problem(500) })
    const { user } = renderApp({ route: PIN_ROUTE })
    await screen.findByRole('heading', { name: 'Enter Mia’s PIN' })

    await tap(user, '1234')

    expect(await screen.findByText(/couldn't check that PIN just now/)).toBeInTheDocument()
  })

  it('Back and Escape return to the board', async () => {
    mockApi(boardRoutes())
    const { user } = renderApp({ route: PIN_ROUTE })

    await user.click(await screen.findByRole('button', { name: 'Back' }))
    expect(await screen.findByRole('heading', { name: "Who's checking in?" })).toBeInTheDocument()

    await user.click(await screen.findByRole('button', { name: /Mia.*Tap to check in/ }))
    await screen.findByRole('heading', { name: 'Enter Mia’s PIN' })
    await user.keyboard('{Escape}')
    expect(await screen.findByRole('heading', { name: "Who's checking in?" })).toBeInTheDocument()
  })

  it('an unknown member, or one removed meanwhile (404), goes back to the board', async () => {
    mockApi({ ...boardRoutes(), 'PATCH /sessions/current': () => problem(404) })
    const { user } = renderApp({ route: '/pin/not-a-member' })

    expect(await screen.findByRole('heading', { name: "Who's checking in?" })).toBeInTheDocument()

    await user.click(await screen.findByRole('button', { name: /Mia.*Tap to check in/ }))
    await screen.findByRole('heading', { name: 'Enter Mia’s PIN' })
    await tap(user, '1234')
    expect(await screen.findByRole('heading', { name: "Who's checking in?" })).toBeInTheDocument()
  })
})
