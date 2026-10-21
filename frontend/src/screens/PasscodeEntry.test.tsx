import { act, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { boardRoutes, session, TODAY } from '../test/fixtures'
import { json, mockApi, passcode401, problem } from '../test/mockApi'
import { renderApp } from '../test/renderWithProviders'
import { formatClockTime } from '../lib/format'

const signedOut = { 'GET /sessions/current': passcode401 }

function unlockButton() {
  return screen.getByRole('button', { name: /unlock/i })
}

describe('REQ-001 Passcode entry', () => {
  it('sends a device with no session to Passcode entry', async () => {
    mockApi(signedOut)
    renderApp({ route: '/my-day' })

    expect(await screen.findByRole('heading', { name: 'Welcome back!' })).toBeInTheDocument()
    expect(screen.getByLabelText('Current path')).toHaveTextContent('/unlock')
    expect(screen.getByLabelText('Family passcode')).toHaveAttribute('type', 'password')
    expect(screen.getByText(/signs out after 5 quiet minutes/)).toBeInTheDocument()
    // No idle note on a fresh device.
    expect(screen.queryByText(/signed out to keep things safe/)).not.toBeInTheDocument()
  })

  it('Unlock posts the passcode and shows the Family board', async () => {
    const api = mockApi({ ...signedOut, 'POST /sessions': () => json(session(), 201) })
    const { user } = renderApp({ route: '/unlock' })

    await user.type(await screen.findByLabelText('Family passcode'), 'sunflower')
    api.use(boardRoutes())
    await user.click(unlockButton())

    expect(await screen.findByRole('heading', { name: "Who's checking in?" })).toBeInTheDocument()
    expect(api.callsTo('POST /sessions')[0].body).toEqual({ passcode: 'sunflower' })
    expect(screen.getByLabelText('Current path')).toHaveTextContent(/^\/$/)
  })

  it('Enter in the field submits too', async () => {
    const api = mockApi({ ...signedOut, 'POST /sessions': passcode401 })
    const { user } = renderApp({ route: '/unlock' })

    await user.type(await screen.findByLabelText('Family passcode'), 'abc{Enter}')

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(api.callsTo('POST /sessions')).toHaveLength(1)
  })

  it('a 401 says "That passcode didn\'t work — try again" and stays here', async () => {
    mockApi({ ...signedOut, 'POST /sessions': passcode401 })
    const { user } = renderApp({ route: '/unlock' })
    const field = await screen.findByLabelText('Family passcode')

    await user.type(field, 'wrong')
    await user.click(unlockButton())

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "That passcode didn't work — try again",
    )
    expect(field).toHaveAttribute('aria-invalid', 'true')
    expect(field).toHaveFocus()
    expect(field).toHaveAccessibleDescription(/Ask a parent.*That passcode didn't work/)
    expect(unlockButton()).toBeEnabled()
    expect(screen.getByLabelText('Current path')).toHaveTextContent('/unlock')
  })

  it('an empty passcode asks for one and sends nothing', async () => {
    const api = mockApi(signedOut)
    const { user } = renderApp({ route: '/unlock' })

    await user.click(await screen.findByRole('button', { name: 'Unlock' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Type the family passcode first')
    expect(screen.getByLabelText('Family passcode')).toHaveFocus()
    expect(api.callsTo('POST /sessions')).toHaveLength(0)
  })

  it('a 429 disables Unlock and shows the wait copy until the wait ends', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, now: TODAY })
    const api = mockApi({
      ...signedOut,
      'POST /sessions': () => problem(429, { 'Retry-After': '900' }),
    })
    const { user } = renderApp({ route: '/unlock', fakeTimers: true })

    await user.type(await screen.findByLabelText('Family passcode'), 'sunflower')
    await user.click(unlockButton())

    expect(await screen.findByText("Let's take a short break")).toBeInTheDocument()
    expect(screen.getByText(/Please wait 15 minutes, then try again/)).toBeInTheDocument()
    const until = TODAY.getTime() + 900_000
    expect(screen.getByText(`You can try again at ${formatClockTime(until)}.`)).toBeInTheDocument()
    expect(unlockButton()).toBeDisabled()

    await user.type(screen.getByLabelText('Family passcode'), '{Enter}')
    expect(api.callsTo('POST /sessions')).toHaveLength(1)

    await act(() => vi.advanceTimersByTimeAsync(900_000))
    expect(unlockButton()).toBeEnabled()
    expect(screen.queryByText("Let's take a short break")).not.toBeInTheDocument()
  })

  it('a 429 without Retry-After waits the 15 minutes the server uses', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, now: TODAY })
    mockApi({ ...signedOut, 'POST /sessions': () => problem(429) })
    const { user } = renderApp({ route: '/unlock', fakeTimers: true })

    await user.type(await screen.findByLabelText('Family passcode'), 'x{Enter}')

    const until = TODAY.getTime() + 15 * 60_000
    expect(
      await screen.findByText(`You can try again at ${formatClockTime(until)}.`),
    ).toBeInTheDocument()
  })

  it('shows "Unlocking…" while the passcode is checked', async () => {
    let answer: (response: Response) => void = () => {}
    mockApi({ ...signedOut, 'POST /sessions': () => new Promise((resolve) => (answer = resolve)) })
    const { user } = renderApp({ route: '/unlock' })

    await user.type(await screen.findByLabelText('Family passcode'), 'x{Enter}')

    expect(screen.getByRole('button', { name: 'Unlocking…' })).toBeDisabled()
    await act(async () => answer(passcode401()))
    expect(screen.getByRole('button', { name: 'Unlock' })).toBeEnabled()
  })

  it('says so kindly when the app cannot be reached', async () => {
    mockApi({ ...signedOut, 'POST /sessions': () => Promise.reject(new TypeError('offline')) })
    const { user } = renderApp({ route: '/unlock' })

    await user.type(await screen.findByLabelText('Family passcode'), 'x{Enter}')

    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn't reach the app/)
  })

  it('a signed-in device skips Passcode entry', async () => {
    mockApi(boardRoutes())
    renderApp({ route: '/unlock' })

    expect(await screen.findByRole('heading', { name: "Who's checking in?" })).toBeInTheDocument()
  })
})
