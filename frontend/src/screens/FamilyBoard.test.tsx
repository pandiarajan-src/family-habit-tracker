import { act, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { POLL_INTERVAL_MS } from '../api/hooks'
import { boardRoutes, kavi, mia, TODAY } from '../test/fixtures'
import { json, mockApi, passcode401, problem } from '../test/mockApi'
import { renderApp } from '../test/renderWithProviders'

async function findCard(name: string) {
  return screen.findByRole('article', { name })
}

describe('REQ-022 Family board', () => {
  it('shows every member with done today, longest streak and gems', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, now: TODAY })
    mockApi(boardRoutes())
    renderApp()

    expect(await screen.findByRole('heading', { name: "Who's checking in?" })).toBeInTheDocument()
    expect(
      await screen.findByText('Tap your card, then enter your PIN. Tuesday 20 October.'),
    ).toBeInTheDocument()

    const miaCard = await findCard('Mia')
    expect(within(miaCard).getByText('3 of 5 done today')).toBeInTheDocument()
    expect(miaCard).toHaveTextContent('Longest 12 days')
    expect(within(miaCard).getByText('24 gems')).toBeInTheDocument()
    expect(
      within(miaCard).getByRole('button', { name: /Mia.*Tap to check in/ }),
    ).toBeInTheDocument()

    const kaviCard = await findCard('Kavi')
    expect(within(kaviCard).getByText('1 of 2 done today')).toBeInTheDocument()
    expect(kaviCard).toHaveTextContent('Longest 3 weeks')
    expect(within(kaviCard).getByText('1 gem')).toBeInTheDocument()

    const mumCard = await findCard('Mum')
    expect(within(mumCard).getByText('No habits yet')).toBeInTheDocument()
    expect(within(mumCard).queryByText(/Longest/)).not.toBeInTheDocument()

    expect(await findCard('Dad')).toHaveTextContent('Longest 0 days')
  })

  it("opens a member's habits view only: status, streaks and weekly progress", async () => {
    mockApi(boardRoutes(kavi))
    const { user } = renderApp()

    await user.click(await screen.findByRole('button', { name: 'See Mia’s habits' }))

    const panel = screen.getByRole('region', { name: 'Mia’s habits today' })
    expect(screen.getByRole('heading', { name: 'Mia’s habits today' })).toHaveFocus()
    expect(screen.getByRole('button', { name: 'See Mia’s habits' })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
    expect(within(panel).getByText('View only')).toBeInTheDocument()
    // A child looking at a sibling's habits gets no controls at all.
    expect(within(panel).queryAllByRole('button')).toEqual([])
    expect(within(panel).queryAllByRole('link')).toEqual([])

    const reading = within(panel).getByRole('article', { name: 'Reading' })
    expect(within(reading).getByText('20 minutes')).toBeInTheDocument()
    expect(within(reading).getByText('3 days')).toBeInTheDocument()
    expect(within(reading).getByText('Best 9 days')).toBeInTheDocument()
    expect(within(reading).getByText('Not yet')).toBeInTheDocument()

    const piano = within(panel).getByRole('article', { name: 'Piano' })
    expect(within(piano).getByText('2 of 3 this week')).toBeInTheDocument()
    expect(within(piano).getByText('1 week')).toBeInTheDocument()
    expect(within(piano).getByText('Done')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'See Mia’s habits' }))
    expect(screen.queryByRole('region', { name: 'Mia’s habits today' })).not.toBeInTheDocument()
  })

  it('says kindly when a member has no habits yet', async () => {
    mockApi(boardRoutes())
    const { user } = renderApp()

    await user.click(await screen.findByRole('button', { name: 'See Mum’s habits' }))

    expect(screen.getByText("Mum hasn't added any habits yet.")).toBeInTheDocument()
  })

  it('REQ-003 tapping a card opens that member’s PIN pad', async () => {
    mockApi(boardRoutes())
    const { user } = renderApp()

    await user.click(await screen.findByRole('button', { name: /Mia.*Tap to check in/ }))

    expect(await screen.findByRole('heading', { name: 'Enter Mia’s PIN' })).toBeInTheDocument()
    expect(screen.getByLabelText('Current path')).toHaveTextContent(`/pin/${mia.id}`)
  })

  it('offers to try again when the board cannot load', async () => {
    const api = mockApi({ ...boardRoutes(), 'GET /members': () => problem(500) })
    const { user } = renderApp()

    expect(await screen.findByText(/couldn't load the board just now/)).toBeInTheDocument()
    api.use(boardRoutes())
    await user.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await findCard('Mia')).toBeInTheDocument()
  })
})

describe('REQ-012 / REQ-004 board refresh', () => {
  it('refreshes every 30 s and on focus as background requests, and says when', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, now: TODAY })
    const api = mockApi(boardRoutes())
    renderApp()
    expect(await screen.findByText('Updated just now')).toBeInTheDocument()

    const firstLoad = api.callsTo('GET /members')
    expect(firstLoad).toHaveLength(1)
    expect(firstLoad[0].headers.get('X-Background-Refresh')).toBeNull()

    await act(() => vi.advanceTimersByTimeAsync(20_000))
    expect(screen.getByText('Updated 20 seconds ago')).toBeInTheDocument()

    // Another device checks Kavi in: the board shows it within 30 seconds.
    api.use({
      'GET /habits': () => json([]),
    })
    await act(() => vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS - 20_000))
    const polls = api.callsTo('GET /members')
    expect(polls).toHaveLength(2)
    for (const route of ['GET /members', 'GET /habits', 'GET /families/current']) {
      expect(api.callsTo(route)[1].headers.get('X-Background-Refresh')).toBe('1')
    }
    expect(await screen.findAllByText('No habits yet')).toHaveLength(4)
    expect(screen.getByText('Updated just now')).toBeInTheDocument()

    act(() => {
      window.dispatchEvent(new Event('focus'))
    })
    expect(api.callsTo('GET /members')).toHaveLength(3)
    expect(api.callsTo('GET /members')[2].headers.get('X-Background-Refresh')).toBe('1')
  })

  it('a refresh after the session ended shows Passcode entry with the idle note', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, now: TODAY })
    const api = mockApi(boardRoutes())
    renderApp()
    await findCard('Mia')

    api.use({ 'GET /members': passcode401, 'GET /sessions/current': passcode401 })
    await act(() => vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS))

    expect(await screen.findByRole('heading', { name: 'Welcome back!' })).toBeInTheDocument()
    expect(
      screen.getByText('You were signed out to keep things safe.').closest('[role="status"]'),
    ).toHaveTextContent('You were signed out to keep things safe.Unlock to carry on!')
  })
})
