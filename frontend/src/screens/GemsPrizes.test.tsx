import { act, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type {
  AdjustmentRead,
  GemTransactionRead,
  MemberRead,
  PrizeClaimRead,
  PrizeRead,
} from '../api/types'
import { boardRoutes, dad, habit, members, mia, mum, TODAY } from '../test/fixtures'
import { json, mockApi, problem, type MockApi, type Routes } from '../test/mockApi'
import { renderApp } from '../test/renderWithProviders'

const reading = habit(mia, { title: 'Reading' })
const exercise = habit(mia, { title: 'Exercise' })
const familyTime = habit(mia, { title: 'Family time', frequency: 'weekly' })

const prizes: PrizeRead[] = [
  { id: '40000000-0000-4000-8000-000000000001', title: 'Ice cream trip', gem_cost: 20 },
  { id: '40000000-0000-4000-8000-000000000002', title: 'Pick the movie night film', gem_cost: 30 },
]
const [iceCream] = prizes

function claim(overrides: Partial<PrizeClaimRead>): PrizeClaimRead {
  return {
    id: '30000000-0000-4000-8000-000000000001',
    prize_id: null,
    prize_title: 'Pick Friday dinner',
    gem_cost: 15,
    member_id: mia.id,
    status: 'pending',
    requested_at: '2026-10-15T18:00:00+01:00',
    decided_at: null,
    decided_by_member_id: null,
    ...overrides,
  }
}

const friday = claim({})
const approved = claim({
  id: '30000000-0000-4000-8000-000000000002',
  prize_title: 'Ice cream trip',
  gem_cost: 20,
  status: 'approved',
  requested_at: '2026-09-26T10:00:00+01:00',
  decided_at: '2026-09-28T10:00:00+01:00',
})
const declined = claim({
  id: '30000000-0000-4000-8000-000000000003',
  prize_title: 'Sleepover',
  gem_cost: 60,
  status: 'declined',
  requested_at: '2026-09-01T10:00:00+01:00',
  decided_at: '2026-09-02T10:00:00+01:00',
})

const ev = (e: Partial<GemTransactionRead>): GemTransactionRead => ({
  kind: 'daily_checkin',
  amount: 1,
  date: '2026-10-20',
  ...e,
})

/** As on the design: check-ins, a weekly goal, both streak bonuses and a hold. */
const history: GemTransactionRead[] = [
  ev({ habit_id: exercise.id }),
  ev({ kind: 'weekly_goal', habit_id: familyTime.id }),
  ev({ kind: 'daily_bonus_7', amount: 7, date: '2026-10-19', habit_id: exercise.id }),
  ev({ date: '2026-10-19', habit_id: reading.id }),
  ev({ kind: 'daily_bonus_5', amount: 5, date: '2026-10-17', habit_id: exercise.id }),
  ev({ kind: 'prize_hold', amount: -15, date: '2026-10-15', prize_claim_id: friday.id }),
]

function adjustment(n: number, more: Partial<AdjustmentRead>): AdjustmentRead {
  return {
    id: `50000000-0000-4000-8000-00000000000${n}`,
    kind: 'check_in_added',
    actor_member_id: mum.id,
    target_member_id: mia.id,
    habit_id: reading.id,
    date: null,
    acknowledged_at: null,
    created_at: '2026-10-19T12:00:00+01:00',
    ...more,
  }
}

interface State {
  balance: number
  held: number
  claims: PrizeClaimRead[]
  events: GemTransactionRead[]
  adjustments: AdjustmentRead[]
}

/** A fake server: claiming holds gems and cancelling gives them back, as the API does. */
function gemsServer(me: MemberRead, start: Partial<State> = {}, extra: Routes = {}) {
  vi.useFakeTimers({ shouldAdvanceTime: true, now: TODAY })
  const state: State = {
    balance: 24,
    held: 15,
    claims: [friday, approved, declined],
    events: history,
    adjustments: [],
    ...start,
  }
  const api: MockApi = mockApi({
    ...boardRoutes(me),
    'GET /members': () =>
      json(
        members.map((m) =>
          m.id === me.id ? { ...m, gem_balance: state.balance, gems_held: state.held } : m,
        ),
      ),
    'GET /habits': () => json([reading, exercise, familyTime]),
    'GET /prizes': () => json(prizes),
    'GET /prize-claims': () => json(state.claims),
    [`GET /members/${me.id}/gem-transactions`]: () => json(state.events),
    'GET /adjustments': () => json(state.adjustments),
    'POST /prize-claims': (call) => {
      const prize = prizes.find((p) => p.id === (call.body as { prize_id: string }).prize_id)!
      if (state.balance < prize.gem_cost) return problem(409)
      const made = claim({
        id: `30000000-0000-4000-8000-00000000009${state.claims.length}`,
        prize_id: prize.id,
        prize_title: prize.title,
        gem_cost: prize.gem_cost,
        member_id: me.id,
        requested_at: '2026-10-20T10:00:00+01:00',
      })
      state.balance -= prize.gem_cost
      state.held += prize.gem_cost
      state.claims = [made, ...state.claims]
      api.use(cancelRoute(made))
      return json(made, 201)
    },
  })

  function cancelRoute(c: PrizeClaimRead): Routes {
    return {
      [`PATCH /prize-claims/${c.id}`]: () => {
        const done = { ...c, status: 'cancelled' as const, decided_at: '2026-10-20T10:05:00+01:00' }
        state.claims = state.claims.map((x) => (x.id === c.id ? done : x))
        state.balance += c.gem_cost
        state.held -= c.gem_cost
        return json(done)
      },
    }
  }

  for (const c of state.claims) if (c.status === 'pending') api.use(cancelRoute(c))
  api.use(extra)
  return { api, state }
}

async function open(me: MemberRead = mia, start: Partial<State> = {}, extra: Routes = {}) {
  const server = gemsServer(me, start, extra)
  const view = renderApp({ route: '/gems' })
  await screen.findByRole('heading', { level: 1, name: 'Gems & prizes' })
  return { ...server, ...view }
}

const region = (name: string) => screen.getByRole('region', { name })
const items = (name: string) => within(region(name)).queryAllByRole('listitem')
const prizeCard = (title: string) =>
  items('Prizes').find((li) => within(li).queryByRole('heading', { name: title }))!

describe('REQ-021 balance and gem history', () => {
  it('shows the available balance with held gems apart', async () => {
    await open()

    const balance = region('My balance')
    expect(within(balance).getByText('24 gems')).toBeInTheDocument()
    expect(within(balance).getByText('15 gems waiting for approval')).toBeInTheDocument()
  })

  it('leaves out the held line when nothing is held', async () => {
    await open(mia, { held: 0, claims: [] })

    expect(screen.queryByText(/waiting for approval/)).not.toBeInTheDocument()
  })

  it('reads the acting member’s own history', async () => {
    const { api } = await open()

    expect(api.callsTo(`GET /members/${mia.id}/gem-transactions`)).toHaveLength(1)
    expect(api.callsTo('GET /prize-claims')[0].query.get('member_id')).toBe(mia.id)
  })

  it('lists earnings, 5- and 7-day bonuses and spends, newest first', async () => {
    await open()

    expect(items('Gems earned and spent').map((li) => li.textContent)).toEqual([
      '+1plus 1 gemExercise check-inToday',
      '+1plus 1 gemFamily time — week completeToday',
      '+7plus 7 gemsExercise · 7-day streak bonusMon 19 Oct',
      '+1plus 1 gemReading check-inMon 19 Oct',
      '+5plus 5 gemsExercise · 5-day streak bonusSat 17 Oct',
      '−15minus 15 gemsHeld for Pick Friday dinnerThu 15 Oct',
    ])
    expect(screen.queryByRole('button', { name: 'Show older' })).not.toBeInTheDocument()
  })

  it('shows ten lines at first and ten more with each "Show older"', async () => {
    const many = Array.from({ length: 23 }, (_, i) =>
      ev({ date: `2026-09-${String(i + 1).padStart(2, '0')}`, habit_id: reading.id }),
    ).reverse()
    const { user } = await open(mia, { events: many })

    expect(items('Gems earned and spent')).toHaveLength(10)
    await user.click(screen.getByRole('button', { name: 'Show older' }))
    expect(items('Gems earned and spent')).toHaveLength(20)
    await user.click(screen.getByRole('button', { name: 'Show older' }))
    expect(items('Gems earned and spent')).toHaveLength(23)
    expect(screen.queryByRole('button', { name: 'Show older' })).not.toBeInTheDocument()
  })

  it('says so kindly when there are no gems yet', async () => {
    await open(mia, { balance: 0, held: 0, claims: [], events: [] })

    expect(
      screen.getByText('No gems yet. Check off a habit to earn your first one!'),
    ).toBeInTheDocument()
    expect(screen.getByText('No claims yet. Pick a prize when you’re ready!')).toBeInTheDocument()
  })
})

describe('REQ-025 claim a prize', () => {
  it('offers "Claim <prize>" when there are enough gems, and gems to go when not', async () => {
    await open()

    expect(
      within(prizeCard('Ice cream trip')).getByRole('button', { name: 'Claim Ice cream trip' }),
    ).toBeEnabled()
    const short = prizeCard('Pick the movie night film')
    expect(within(short).getByText('6 more gems to go!')).toBeInTheDocument()
    expect(within(short).queryByRole('button')).not.toBeInTheDocument()
  })

  it('a claim is pending, holds the cost, and moves focus to My claims', async () => {
    const { api, user } = await open()

    await user.click(screen.getByRole('button', { name: 'Claim Ice cream trip' }))

    expect(
      await screen.findByText('Ice cream trip is claimed! A parent will take a look soon.'),
    ).toBeInTheDocument()
    expect(api.callsTo('POST /prize-claims')[0].body).toEqual({ prize_id: iceCream.id })
    const first = items('My claims')[0]
    expect(within(first).getByText('Ice cream trip · 20 gems')).toBeInTheDocument()
    expect(within(first).getByText('Waiting for a parent · 20 gems held')).toBeInTheDocument()
    expect(within(region('My balance')).getByText('4 gems')).toBeInTheDocument()
    expect(within(region('My balance')).getByText('35 gems waiting for approval')).toBeVisible()
    // The balance is now below the cost, so the button became "16 more gems to go!".
    expect(within(prizeCard('Ice cream trip')).getByText('16 more gems to go!')).toBeVisible()
    expect(screen.getByRole('heading', { name: 'My claims' })).toHaveFocus()
  })

  it('works from the keyboard', async () => {
    const { api, user } = await open()

    screen.getByRole('button', { name: 'Claim Ice cream trip' }).focus()
    await user.keyboard('{Enter}')

    await waitFor(() => expect(api.callsTo('POST /prize-claims')).toHaveLength(1))
  })

  it('a 409 (the balance changed elsewhere) shows the gems to go instead of the button', async () => {
    const { state, user } = await open()
    state.balance = 10 // spent on another device

    await user.click(screen.getByRole('button', { name: 'Claim Ice cream trip' }))

    expect(
      await within(prizeCard('Ice cream trip')).findByText('10 more gems to go!'),
    ).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Claim Ice cream trip' })).not.toBeInTheDocument()
    expect(screen.queryByText(/is claimed/)).not.toBeInTheDocument()
    expect(screen.queryByText("We couldn't do that just now. Please try again.")).toBeNull()
  })

  it('other errors get kind copy and change nothing', async () => {
    const { user } = await open(mia, {}, { 'POST /prize-claims': () => problem(500) })

    await user.click(screen.getByRole('button', { name: 'Claim Ice cream trip' }))

    expect(
      await screen.findByText("We couldn't do that just now. Please try again."),
    ).toBeInTheDocument()
    expect(within(region('My balance')).getByText('24 gems')).toBeInTheDocument()
  })

  it('cancelling a pending claim gives the gems back', async () => {
    const { api, user } = await open()

    await user.click(screen.getByRole('button', { name: 'Cancel claim for Pick Friday dinner' }))

    expect(
      await screen.findByText(
        'Your claim for Pick Friday dinner is cancelled. Your gems are back.',
      ),
    ).toBeInTheDocument()
    expect(api.callsTo(`PATCH /prize-claims/${friday.id}`)[0].body).toEqual({
      status: 'cancelled',
    })
    expect(
      within(items('My claims')[0]).getByText(
        'You cancelled this claim — your gems are back. · Tue 20 Oct',
      ),
    ).toBeInTheDocument()
    expect(within(region('My balance')).getByText('39 gems')).toBeInTheDocument()
    expect(screen.queryByText(/waiting for approval/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Cancel claim/ })).not.toBeInTheDocument()
  })

  it('a prize list with nothing in it asks a parent to add one', async () => {
    gemsServer(mia, {}, { 'GET /prizes': () => json([]) })
    renderApp({ route: '/gems' })

    expect(await screen.findByText('No prizes yet. Ask a parent to add one!')).toBeVisible()
  })
})

describe('REQ-026 decisions show on my claims', () => {
  it('shows approved and "Not this time" claims with their day, and no Cancel', async () => {
    await open()

    const [, yes, no] = items('My claims')
    expect(within(yes).getByText('Your prize is approved! · Mon 28 Sept')).toBeInTheDocument()
    expect(
      within(no).getByText('Not this time — your gems are back. · Wed 2 Sept'),
    ).toBeInTheDocument()
    expect(within(yes).queryByRole('button')).toBeNull()
    expect(within(no).queryByRole('button')).toBeNull()
  })

  it('a parent’s decision shows up on the next background refresh', async () => {
    const { api, state } = await open()
    state.claims = state.claims.map((c) =>
      c.id === friday.id
        ? { ...c, status: 'approved', decided_at: '2026-10-20T11:00:00+01:00' }
        : c,
    )
    state.held = 0

    act(() => {
      window.dispatchEvent(new Event('focus'))
    })

    expect(
      await within(region('My claims')).findByText('Your prize is approved! · Tue 20 Oct'),
    ).toBeVisible()
    expect(api.callsTo('GET /prize-claims')[1].headers.get('X-Background-Refresh')).toBe('1')
    // Approving keeps the hold: it now reads as spent.
    expect(screen.getByText('Spent on Pick Friday dinner')).toBeInTheDocument()
  })

  it('a parent’s own claim waits for the other parent', async () => {
    await open(dad, { claims: [claim({ member_id: dad.id })] })

    expect(screen.getByText('Waiting for the other parent · 15 gems held')).toBeInTheDocument()
  })

  it('a parent with no other parent decides it themselves', async () => {
    const { api } = await open(dad, { claims: [claim({ member_id: dad.id })] })
    api.use({ 'GET /members': () => json([dad, mia]) })
    act(() => {
      window.dispatchEvent(new Event('focus'))
    })

    expect(
      await screen.findByText('Waiting for you to decide in Approvals & prizes · 15 gems held'),
    ).toBeInTheDocument()
  })
})

describe('REQ-015 changes to my habits', () => {
  it('lists what a parent changed, newest first, including ones already dismissed', async () => {
    await open(mia, {
      adjustments: [
        adjustment(1, { date: '2026-10-14', acknowledged_at: '2026-10-19T13:00:00+01:00' }),
        adjustment(2, {
          kind: 'pin_reset',
          habit_id: null,
          created_at: '2026-09-12T12:00:00+01:00',
        }),
        adjustment(3, {
          kind: 'habit_updated',
          actor_member_id: dad.id,
          created_at: '2026-10-05T12:00:00+01:00',
        }),
      ],
    })

    expect(items('Changes to my habits').map((li) => li.textContent)).toEqual([
      '🌻Mum updated Reading for Wed 14 OctA check-in was added for that day. · Mon 19 Oct',
      '🦉Dad updated Reading on Mon 5 OctIts details changed. · Mon 5 Oct',
      '🌻Mum reset your PIN on Sat 12 SeptUse your new PIN next time you check in. · Sat 12 Sept',
    ])
  })

  it('says when nothing has changed', async () => {
    await open()

    expect(
      within(region('Changes to my habits')).getByText('Nothing has been changed for you.'),
    ).toBeInTheDocument()
  })
})

describe('loading', () => {
  it('offers a retry when the screen cannot load', async () => {
    const { api } = gemsServer(mia, {}, { 'GET /prizes': () => problem(500) })
    const { user } = renderApp({ route: '/gems' })

    await screen.findByText("We couldn't load your gems just now.")
    api.use({ 'GET /prizes': () => json(prizes) })
    await user.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByRole('heading', { name: 'Ice cream trip' })).toBeInTheDocument()
  })
})
