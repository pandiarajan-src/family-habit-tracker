import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { MemberRead, PrizeClaimRead, PrizeRead } from '../../api/types'
import { boardRoutes, dad, kavi, members, mia, mum, TODAY } from '../../test/fixtures'
import { json, mockApi, problem, type MockApi } from '../../test/mockApi'
import { renderApp } from '../../test/renderWithProviders'

const prize = (n: number, title: string, gem_cost: number): PrizeRead => ({
  id: `40000000-0000-4000-8000-00000000000${n}`,
  title,
  gem_cost,
})
const friday = prize(1, 'Pick Friday dinner', 15)
const iceCream = prize(2, 'Ice cream trip', 20)
const movie = prize(3, 'Pick the movie night film', 30)
const spa = prize(4, 'Spa afternoon', 80)

function claim(n: number, who: MemberRead, p: PrizeRead, asked: string): PrizeClaimRead {
  return {
    id: `30000000-0000-4000-8000-00000000000${n}`,
    prize_id: p.id,
    prize_title: p.title,
    gem_cost: p.gem_cost,
    member_id: who.id,
    status: 'pending',
    requested_at: `${asked}T18:00:00+01:00`,
    decided_at: null,
    decided_by_member_id: null,
  }
}

const miaClaim = claim(1, mia, friday, '2026-10-15')
const kaviClaim = claim(2, kavi, iceCream, '2026-10-19')
const mumClaim = claim(3, mum, spa, '2026-10-18')

interface Options {
  family?: MemberRead[]
  claims?: PrizeClaimRead[]
  prizes?: PrizeRead[]
}

/** A fake server for Approvals & prizes: decisions take the claim off the pending list. */
function approvalsServer(me: MemberRead, options: Options = {}) {
  vi.useFakeTimers({ shouldAdvanceTime: true, now: TODAY })
  const state = {
    claims: options.claims ?? [miaClaim, kaviClaim, mumClaim],
    prizes: options.prizes ?? [friday, iceCream, movie, spa],
  }
  const family = options.family ?? members
  const api: MockApi = mockApi({
    ...boardRoutes(me),
    'GET /members': () => json(family),
    'GET /prizes': () => json(state.prizes),
    'GET /prize-claims': (call) =>
      json(state.claims.filter((c) => c.status === (call.query.get('status') ?? c.status))),
    'POST /prizes': (call) => {
      const made = { id: '40000000-0000-4000-8000-000000000009', ...(call.body as object) }
      state.prizes = [...state.prizes, made as PrizeRead]
      return json(made, 201)
    },
  })
  for (const c of state.claims) {
    api.use({
      [`PATCH /prize-claims/${c.id}`]: (call) => {
        const status = (call.body as { status: PrizeClaimRead['status'] }).status
        const done = { ...c, status, decided_at: '2026-10-20T10:00:00+01:00' }
        state.claims = state.claims.map((x) => (x.id === c.id ? done : x))
        return json(done)
      },
    })
  }
  for (const p of state.prizes) {
    api.use({
      [`PATCH /prizes/${p.id}`]: (call) => {
        const saved = { ...p, ...(call.body as object) }
        state.prizes = state.prizes.map((x) => (x.id === p.id ? saved : x))
        return json(saved)
      },
      [`DELETE /prizes/${p.id}`]: () => {
        state.prizes = state.prizes.filter((x) => x.id !== p.id)
        return new Response(null, { status: 204 })
      },
    })
  }
  return { api, state }
}

const waiting = () => screen.findByRole('region', { name: /Waiting for a decision/ })
const prizesRegion = () => screen.getByRole('region', { name: 'Prizes' })

describe('REQ-026 parents approve or decline claims', () => {
  it('lists pending claims; the other parent decides my own in a two-parent family', async () => {
    approvalsServer(mum)
    renderApp({ route: '/parent/approvals' })

    const region = await waiting()
    expect(
      within(region).getByRole('heading', { name: 'Waiting for a decision (3)' }),
    ).toBeVisible()
    expect(within(region).getByText('15 gems held · asked Thu 15 Oct')).toBeInTheDocument()
    expect(
      within(region).getByRole('button', { name: 'Approve Mia’s Pick Friday dinner' }),
    ).toBeEnabled()
    expect(
      within(region).getByRole('button', { name: 'Not this time for Kavi’s Ice cream trip' }),
    ).toBeEnabled()
    expect(within(region).getByRole('heading', { name: 'You · Spa afternoon' })).toBeInTheDocument()
    expect(within(region).getByText('Waiting for the other parent')).toBeInTheDocument()
    expect(within(region).queryByRole('button', { name: /Spa afternoon/ })).not.toBeInTheDocument()
    expect(
      screen.getByText('Your own claims are decided by Dad, and Dad’s by you.'),
    ).toBeInTheDocument()
  })

  it('in a one-parent family the parent can decide their own claim (C5)', async () => {
    const { api } = approvalsServer(mum, { family: [mum, mia, kavi] })
    const { user } = renderApp({ route: '/parent/approvals', fakeTimers: true })

    const region = await waiting()
    expect(
      screen.getByText(
        'You’re the only parent in this family, so you can decide your own claims too.',
      ),
    ).toBeInTheDocument()
    await user.click(within(region).getByRole('button', { name: 'Approve your Spa afternoon' }))

    expect(await screen.findByText('Your Spa afternoon is approved. Enjoy!')).toBeInTheDocument()
    expect(api.callsTo(`PATCH /prize-claims/${mumClaim.id}`)[0].body).toEqual({
      status: 'approved',
    })
  })

  it('approve and "Not this time" send the decision and take the claim off the list', async () => {
    const { api } = approvalsServer(dad)
    const { user } = renderApp({ route: '/parent/approvals', fakeTimers: true })

    const region = await waiting()
    await user.click(
      within(region).getByRole('button', { name: 'Approve Mia’s Pick Friday dinner' }),
    )
    expect(await screen.findByText('Mia’s Pick Friday dinner is approved. Enjoy!')).toBeVisible()
    expect(api.callsTo(`PATCH /prize-claims/${miaClaim.id}`)[0].body).toEqual({
      status: 'approved',
    })
    expect(screen.getByRole('heading', { name: 'Waiting for a decision (2)' })).toHaveFocus()

    await user.click(
      screen.getByRole('button', { name: 'Not this time for Kavi’s Ice cream trip' }),
    )
    expect(
      await screen.findByText(
        'Not this time for Kavi’s Ice cream trip. The gems are back with Kavi.',
      ),
    ).toBeVisible()
    expect(api.callsTo(`PATCH /prize-claims/${kaviClaim.id}`)[0].body).toEqual({
      status: 'declined',
    })
    // Dad can decide Mum's claim.
    expect(screen.getByRole('button', { name: 'Approve Mum’s Spa afternoon' })).toBeEnabled()
  })

  it('a claim someone already decided (409) refreshes the list kindly', async () => {
    const { api, state } = approvalsServer(dad)
    api.use({
      [`PATCH /prize-claims/${miaClaim.id}`]: () => {
        state.claims = state.claims.filter((c) => c.id !== miaClaim.id)
        return problem(409)
      },
    })
    const { user } = renderApp({ route: '/parent/approvals', fakeTimers: true })

    await user.click(
      within(await waiting()).getByRole('button', { name: 'Approve Mia’s Pick Friday dinner' }),
    )
    expect(
      await screen.findByText('That claim was already decided, so the list is up to date now.'),
    ).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Waiting for a decision (2)' })).toBeVisible()
  })

  it('shows when nothing is waiting, and refreshes in the background', async () => {
    const { api } = approvalsServer(dad, { claims: [] })
    renderApp({ route: '/parent/approvals' })

    expect(await screen.findByText('Nothing is waiting right now.')).toBeInTheDocument()
    const before = api.callsTo('GET /prize-claims').length
    await vi.advanceTimersByTimeAsync(30_000)
    const polls = api.callsTo('GET /prize-claims').slice(before)
    expect(polls.length).toBeGreaterThan(0)
    expect(polls[0].headers.get('X-Background-Refresh')).toBe('1')
  })
})

describe('REQ-024 parents manage prizes', () => {
  it('Delete is off while a claim waits; other prizes can be deleted after a second tap', async () => {
    const { api } = approvalsServer(mum)
    const { user } = renderApp({ route: '/parent/approvals', fakeTimers: true })
    await waiting()
    const region = prizesRegion()

    expect(within(region).getByRole('button', { name: 'Delete Pick Friday dinner' })).toBeDisabled()
    expect(
      within(region).getAllByText('Has a claim waiting — decide it before deleting.'),
    ).toHaveLength(3)

    const del = within(region).getByRole('button', { name: 'Delete Pick the movie night film' })
    await user.click(del)
    const dialog = screen.getByRole('alertdialog', { name: 'Delete Pick the movie night film?' })
    expect(
      within(dialog).getByRole('button', { name: 'Keep Pick the movie night film' }),
    ).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(del).toHaveFocus()
    expect(api.callsTo(`DELETE /prizes/${movie.id}`)).toHaveLength(0)

    await user.click(del)
    await user.click(screen.getByRole('button', { name: 'Yes, delete Pick the movie night film' }))
    expect(
      await screen.findByText(
        'Pick the movie night film is deleted. Past claims keep its name and cost.',
      ),
    ).toBeVisible()
    expect(api.callsTo(`DELETE /prizes/${movie.id}`)).toHaveLength(1)
    expect(within(prizesRegion()).queryByText('Pick the movie night film')).not.toBeInTheDocument()
  })

  it('a delete that meets a new claim (409) explains why', async () => {
    const { api } = approvalsServer(mum, { claims: [] })
    api.use({ [`DELETE /prizes/${movie.id}`]: () => problem(409) })
    const { user } = renderApp({ route: '/parent/approvals', fakeTimers: true })
    await waiting()

    await user.click(screen.getByRole('button', { name: 'Delete Pick the movie night film' }))
    await user.click(screen.getByRole('button', { name: 'Yes, delete Pick the movie night film' }))
    expect(
      await screen.findByText(
        'A claim for Pick the movie night film is waiting now — decide it first, then delete.',
      ),
    ).toBeVisible()
  })

  it('adds a prize after checking the name and cost in the browser', async () => {
    const { api } = approvalsServer(mum)
    const { user } = renderApp({ route: '/parent/approvals', fakeTimers: true })
    await waiting()
    const add = screen.getByRole('form', { name: 'Add a prize' })
    expect(screen.getAllByRole('heading', { name: 'Add a prize' })).toHaveLength(1)

    await user.click(within(add).getByRole('button', { name: 'Add prize' }))
    expect(within(add).getByLabelText('Prize name')).toHaveFocus()
    expect(within(add).getByText('Give the prize a name')).toBeVisible()

    await user.type(within(add).getByLabelText('Prize name'), 'A new book')
    await user.type(within(add).getByLabelText('Gem cost'), '0')
    await user.click(within(add).getByRole('button', { name: 'Add prize' }))
    expect(within(add).getByLabelText('Gem cost')).toHaveFocus()
    expect(within(add).getByLabelText('Gem cost')).toHaveAccessibleDescription(
      expect.stringContaining('A whole number from 1 to 10,000'),
    )
    expect(api.callsTo('POST /prizes')).toHaveLength(0)

    await user.clear(within(add).getByLabelText('Gem cost'))
    await user.type(within(add).getByLabelText('Gem cost'), '40')
    await user.click(within(add).getByRole('button', { name: 'Add prize' }))

    expect(await screen.findByText('A new book is on everyone’s prize list.')).toBeVisible()
    expect(api.callsTo('POST /prizes')[0].body).toEqual({ title: 'A new book', gem_cost: 40 })
    expect(within(add).getByLabelText('Prize name')).toHaveValue('')
    expect(within(prizesRegion()).getByRole('heading', { name: 'A new book' })).toBeVisible()
  })

  it('edits a prize in place; Cancel puts focus back on Edit', async () => {
    const { api } = approvalsServer(mum)
    const { user } = renderApp({ route: '/parent/approvals', fakeTimers: true })
    await waiting()

    const edit = screen.getByRole('button', { name: 'Edit Ice cream trip' })
    await user.click(edit)
    const form = screen.getByRole('form', { name: 'Edit Ice cream trip' })
    expect(within(form).getByLabelText('Prize name')).toHaveFocus()
    await user.click(within(form).getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('button', { name: 'Edit Ice cream trip' })).toHaveFocus()

    await user.click(screen.getByRole('button', { name: 'Edit Ice cream trip' }))
    const again = screen.getByRole('form', { name: 'Edit Ice cream trip' })
    await user.clear(within(again).getByLabelText('Gem cost'))
    await user.type(within(again).getByLabelText('Gem cost'), '25')
    await user.click(within(again).getByRole('button', { name: 'Save prize' }))

    expect(
      await screen.findByText('Ice cream trip is saved. Claims already waiting keep their cost.'),
    ).toBeVisible()
    expect(api.callsTo(`PATCH /prizes/${iceCream.id}`)[0].body).toEqual({
      title: 'Ice cream trip',
      gem_cost: 25,
    })
    expect(within(prizesRegion()).getByText('25 gems')).toBeVisible()
  })

  it('a failed save keeps the form open with kind copy', async () => {
    const { api } = approvalsServer(mum)
    api.use({ [`PATCH /prizes/${spa.id}`]: () => problem(500) })
    const { user } = renderApp({ route: '/parent/approvals', fakeTimers: true })
    await waiting()

    await user.click(screen.getByRole('button', { name: 'Edit Spa afternoon' }))
    await user.click(screen.getByRole('button', { name: 'Save prize' }))
    expect(await screen.findByText("We couldn't do that just now. Please try again.")).toBeVisible()
    expect(screen.getByRole('form', { name: 'Edit Spa afternoon' })).toBeInTheDocument()
  })

  it('shows an empty prize list kindly', async () => {
    approvalsServer(mum, { claims: [], prizes: [] })
    renderApp({ route: '/parent/approvals' })
    expect(await screen.findByText('No prizes yet. Add the first one below!')).toBeVisible()
  })
})

describe('REQ-028 approvals are for parents only', () => {
  it('a child who opens Approvals lands on My day', async () => {
    approvalsServer(mia)
    renderApp({ route: '/parent/approvals' })
    await waitFor(() => expect(screen.getByLabelText('Current path')).toHaveTextContent('/my-day'))
    expect(screen.queryByRole('button', { name: /Approve/ })).not.toBeInTheDocument()
  })

  it('a load failure offers Try again', async () => {
    const { api } = approvalsServer(mum)
    api.use({ 'GET /prizes': () => problem(500) })
    const { user } = renderApp({ route: '/parent/approvals', fakeTimers: true })

    expect(await screen.findByText("We couldn't load this just now.")).toBeVisible()
    api.use({ 'GET /prizes': () => json([]) })
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await waiting()).toBeInTheDocument()
  })
})
