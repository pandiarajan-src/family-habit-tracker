import { screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { AdjustmentRead, CheckInRead, HabitRead, StreakSaverRead } from '../api/types'
import { copy } from '../copy'
import { boardRoutes, habit, kavi, members, mia, mum, TODAY, weekly } from '../test/fixtures'
import { json, mockApi, problem, type Routes } from '../test/mockApi'
import { renderApp } from '../test/renderWithProviders'

const DAY = '2026-10-20'
const YESTERDAY = '2026-10-19'

/** Mia's day, as on the design: 3 of 5 done today, Water can be saved for 2 gems. */
function miaDay() {
  return {
    reading: habit(mia, {
      title: 'Reading',
      goal_note: '20 minutes',
      current_streak: 3,
      best_streak: 9,
      streak_pending: true,
    }),
    exercise: habit(mia, {
      title: 'Exercise',
      goal_note: '40 minutes',
      current_streak: 12,
      best_streak: 15,
      today_done: true,
    }),
    water: habit(mia, {
      title: 'Water',
      goal_note: '3 litres',
      current_streak: 1,
      best_streak: 4,
      streak_pending: true,
      next_saver_cost: 2,
      saveable_periods: [{ period_start: '2026-10-18', cost: 2 }],
    }),
    piano: weekly(mia, 2, 3, {
      title: 'Piano',
      goal_note: '15 minutes',
      current_streak: 1,
      best_streak: 2,
      today_done: true,
    }),
    family: weekly(mia, 1, 1, {
      title: 'Family time',
      goal_note: 'Board game night',
      current_streak: 1,
      best_streak: 7,
      today_done: true,
    }),
  }
}

function checkInRead(h: HabitRead, date: string): CheckInRead {
  return {
    id: `30000000-0000-4000-8000-${h.id.slice(-12)}`,
    habit_id: h.id,
    member_id: h.member_id,
    date,
    created_by_member_id: h.member_id,
    created_at: `${date}T09:00:00+01:00`,
  }
}

function adjustment(more: Partial<AdjustmentRead> = {}): AdjustmentRead {
  return {
    id: '40000000-0000-4000-8000-000000000001',
    kind: 'check_in_added',
    actor_member_id: mum.id,
    target_member_id: mia.id,
    habit_id: null,
    date: '2026-10-13',
    acknowledged_at: null,
    created_at: '2026-10-14T19:00:00+01:00',
    ...more,
  }
}

interface Setup {
  habits?: HabitRead[]
  balance?: number
  adjustments?: AdjustmentRead[]
  yesterdayCheckIns?: CheckInRead[]
  yesterdaySavers?: StreakSaverRead[]
  /** Extra or replacement routes, in place before the first load. */
  routes?: Routes
}

/** A fake server for Mia's My day: reads come from `state`, so a write can change them. */
function setup(options: Setup = {}) {
  vi.useFakeTimers({ shouldAdvanceTime: true, now: TODAY })
  const day = miaDay()
  const state = {
    habits: options.habits ?? Object.values(day),
    balance: options.balance ?? 24,
  }
  const api = mockApi({
    ...boardRoutes(mia),
    'GET /members': () =>
      json(members.map((m) => (m.id === mia.id ? { ...m, gem_balance: state.balance } : m))),
    'GET /habits': (call) =>
      json(state.habits.filter((h) => h.member_id === call.query.get('member_id'))),
    'GET /adjustments': () => json(options.adjustments ?? []),
    'GET /check-ins': () => json(options.yesterdayCheckIns ?? []),
    'GET /streak-savers': () => json(options.yesterdaySavers ?? []),
    ...options.routes,
  })
  /** The server changes a habit (and maybe the balance) as a write would. */
  const change = (h: HabitRead, changes: Partial<HabitRead>, balance = state.balance) => {
    state.habits = state.habits.map((x) => (x.id === h.id ? { ...x, ...changes } : x))
    state.balance = balance
  }
  const { user } = renderApp({ route: '/my-day' })
  return { api, user, day, change, state }
}

const card = (name: string) => screen.findByRole('article', { name })
const progress = () => screen.getByRole('complementary', { name: 'My progress' })

describe('REQ-011 / 016 / 017 / 018 My day', () => {
  it('lists today’s habits with streaks, weekly progress and the daily summary', async () => {
    const { api } = setup()

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Hi Mia! Here’s your day' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Tuesday 20 October')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Today' })).toHaveAttribute('aria-pressed', 'true')

    const daily = screen.getByRole('region', { name: 'Every day' })
    expect(
      within(daily)
        .getAllByRole('article')
        .map((a) => a.getAttribute('aria-label')),
    ).toEqual(['Reading', 'Exercise', 'Water'])
    const reading = await card('Reading')
    expect(within(reading).getByText('20 minutes')).toBeInTheDocument()
    expect(within(reading).getByText('3 days')).toBeInTheDocument()
    expect(within(reading).getByText('Best 9 days')).toBeInTheDocument()
    expect(within(reading).getByText('Check in today to make it 4!')).toBeInTheDocument()
    expect(within(reading).getByRole('button', { name: 'Check off Reading' })).toBeInTheDocument()

    const exercise = await card('Exercise')
    expect(within(exercise).getByRole('button', { name: 'Done — Undo Exercise' })).toBeVisible()
    expect(within(exercise).queryByText(/Check in today/)).not.toBeInTheDocument()

    const weeklyRegion = screen.getByRole('region', { name: 'This week' })
    const piano = within(weeklyRegion).getByRole('article', { name: 'Piano' })
    expect(within(piano).getByText('2 of 3 this week')).toBeInTheDocument()
    expect(within(piano).getByText('1 week')).toBeInTheDocument()
    expect(within(piano).getByText('Best 2 weeks')).toBeInTheDocument()
    expect(
      within(piano).getByText('1 more this week to keep your streak going'),
    ).toBeInTheDocument()
    const family = within(weeklyRegion).getByRole('article', { name: 'Family time' })
    expect(within(family).getByText('Week complete — nice one!')).toBeInTheDocument()

    expect(within(progress()).getByText('3 of 5 done today')).toBeInTheDocument()
    expect(within(progress()).getByText('Great going — keep it up!')).toBeInTheDocument()
    expect(progress()).toHaveTextContent('Balance 24 gems')
    expect(progress()).toHaveTextContent('Longest 12 days')

    // Only Mia's habits, archived ones included so change notices can name them.
    const habitsCall = api.callsTo('GET /habits')[0]
    expect(habitsCall.query.get('member_id')).toBe(mia.id)
    expect(habitsCall.query.get('include_archived')).toBe('true')
  })

  it('checks a habit off in one tap, then shows the new streak and gems', async () => {
    const { api, user, day, change } = setup()
    const readingCard = await card('Reading')
    api.use({
      [`PUT /habits/${day.reading.id}/check-ins/${DAY}`]: () => {
        change(day.reading, { today_done: true, current_streak: 4, streak_pending: false }, 25)
        return json(checkInRead(day.reading, DAY), 201)
      },
    })

    await user.click(within(readingCard).getByRole('button', { name: 'Check off Reading' }))

    expect(
      await within(readingCard).findByRole('button', { name: 'Done — Undo Reading' }),
    ).toBeInTheDocument()
    expect(await within(readingCard).findByText('4 days')).toBeInTheDocument()
    expect(within(readingCard).queryByText(/make it/)).not.toBeInTheDocument()
    expect(progress()).toHaveTextContent('Balance 25 gems')
    expect(within(progress()).getByText('4 of 5 done today')).toBeInTheDocument()
    expect(api.callsTo(`PUT /habits/${day.reading.id}/check-ins/${DAY}`)).toHaveLength(1)
  })

  it('undoes a check-off and the gems and streak go back', async () => {
    const { api, user, day, change } = setup()
    const exerciseCard = await card('Exercise')
    api.use({
      [`DELETE /habits/${day.exercise.id}/check-ins/${DAY}`]: () => {
        change(day.exercise, { today_done: false, current_streak: 11, streak_pending: true }, 23)
        return new Response(null, { status: 204 })
      },
    })

    await user.click(within(exerciseCard).getByRole('button', { name: 'Done — Undo Exercise' }))

    expect(
      await within(exerciseCard).findByRole('button', { name: 'Check off Exercise' }),
    ).toBeInTheDocument()
    expect(within(exerciseCard).getByText('Check in today to make it 12!')).toBeInTheDocument()
    expect(progress()).toHaveTextContent('Balance 23 gems')
  })

  it('works from the keyboard and keeps focus on the button (Enter, then Space)', async () => {
    const { api, user, day, change } = setup()
    const readingCard = await card('Reading')
    api.use({
      [`PUT /habits/${day.reading.id}/check-ins/${DAY}`]: () => {
        change(day.reading, { today_done: true, current_streak: 4 })
        return json(checkInRead(day.reading, DAY), 201)
      },
      [`DELETE /habits/${day.reading.id}/check-ins/${DAY}`]: () => {
        change(day.reading, { today_done: false, current_streak: 3 })
        return new Response(null, { status: 204 })
      },
    })

    within(readingCard).getByRole('button', { name: 'Check off Reading' }).focus()
    await user.keyboard('{Enter}')
    const done = await within(readingCard).findByRole('button', { name: 'Done — Undo Reading' })
    expect(done).toHaveFocus()

    await user.keyboard(' ')
    const again = await within(readingCard).findByRole('button', { name: 'Check off Reading' })
    expect(again).toHaveFocus()
    expect(api.callsTo(`DELETE /habits/${day.reading.id}/check-ins/${DAY}`)).toHaveLength(1)
  })

  it('shows "Done" straight away and ignores taps until the server answers', async () => {
    const { api, user, day, change } = setup()
    const readingCard = await card('Reading')
    let answer: (response: Response) => void = () => {}
    api.use({
      [`PUT /habits/${day.reading.id}/check-ins/${DAY}`]: () =>
        new Promise<Response>((resolve) => {
          answer = resolve
        }),
    })

    await user.click(within(readingCard).getByRole('button', { name: 'Check off Reading' }))
    const pending = within(readingCard).getByRole('button', { name: 'Done — Undo Reading' })
    expect(pending).toHaveAttribute('aria-disabled', 'true')
    await user.click(pending)
    expect(api.callsTo(`PUT /habits/${day.reading.id}/check-ins/${DAY}`)).toHaveLength(1)

    change(day.reading, { today_done: true, current_streak: 4 }, 25)
    answer(json(checkInRead(day.reading, DAY), 201))
    expect(await within(readingCard).findByText('4 days')).toBeInTheDocument()
    expect(
      within(readingCard).getByRole('button', { name: 'Done — Undo Reading' }),
    ).not.toHaveAttribute('aria-disabled')
  })

  it('puts the habit back and says so kindly when a check-in cannot be saved', async () => {
    const { api, user, day } = setup()
    const readingCard = await card('Reading')
    api.use({ [`PUT /habits/${day.reading.id}/check-ins/${DAY}`]: () => problem(500) })

    await user.click(within(readingCard).getByRole('button', { name: 'Check off Reading' }))

    expect(await screen.findByText(copy.myDay.saveTrouble)).toBeInTheDocument()
    expect(
      await within(readingCard).findByRole('button', { name: 'Check off Reading' }),
    ).not.toHaveAttribute('aria-disabled')
  })
})

describe('REQ-012 repeated check-ins', () => {
  it('a repeat PUT answered 200 shows the same single check-in', async () => {
    const { api, user, day, change } = setup()
    const readingCard = await card('Reading')
    // Another device checked Reading in a moment ago: the server answers 200, same check-in.
    api.use({
      [`PUT /habits/${day.reading.id}/check-ins/${DAY}`]: () => {
        change(day.reading, { today_done: true, current_streak: 4 }, 25)
        return json(checkInRead(day.reading, DAY), 200)
      },
    })

    await user.click(within(readingCard).getByRole('button', { name: 'Check off Reading' }))

    expect(await within(readingCard).findByText('4 days')).toBeInTheDocument()
    expect(within(readingCard).getByRole('button', { name: 'Done — Undo Reading' })).toBeVisible()
    expect(progress()).toHaveTextContent('Balance 25 gems')
    expect(within(progress()).getByText('4 of 5 done today')).toBeInTheDocument()
  })
})

describe('REQ-013 Yesterday', () => {
  it('switches to yesterday and checks off for yesterday’s date', async () => {
    const { api, user, day, state } = setup({
      yesterdayCheckIns: [checkInRead(miaDay().reading, YESTERDAY)],
    })
    const reading = state.habits[0]
    const newToday = habit(mia, { title: 'Stretching', created_on: DAY })
    state.habits = [...state.habits, newToday]
    api.use({
      'GET /check-ins': () => json([checkInRead(reading, YESTERDAY)]),
      [`PUT /habits/${day.water.id}/check-ins/${YESTERDAY}`]: () =>
        json(checkInRead(day.water, YESTERDAY), 201),
    })
    await card('Reading')
    const range = api.callsTo('GET /check-ins')[0].query
    expect([range.get('from'), range.get('to'), range.get('member_id')]).toEqual([
      YESTERDAY,
      YESTERDAY,
      mia.id,
    ])

    await user.click(screen.getByRole('button', { name: 'Yesterday' }))

    expect(screen.getByRole('button', { name: 'Yesterday' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('heading', { level: 1, name: 'Yesterday' })).toBeInTheDocument()
    expect(screen.getByText('Monday 19 October')).toBeInTheDocument()
    expect(screen.getByText('Forgot to check in yesterday?')).toBeInTheDocument()
    expect(
      screen.getByText(
        'Check off anything you did on Mon 19 Oct. Older days can be fixed by a parent.',
      ),
    ).toBeInTheDocument()
    // Reading was done yesterday; Exercise wasn't (today's state doesn't leak in).
    expect(
      within(await card('Reading')).getByRole('button', { name: 'Done — Undo Reading' }),
    ).toBeVisible()
    const exercise = await card('Exercise')
    expect(within(exercise).getByRole('button', { name: 'Check off Exercise' })).toBeVisible()
    expect(within(exercise).getByText('Counts for Mon 19 Oct')).toBeInTheDocument()
    // A habit created today has no yesterday; savers are offered on Today only.
    expect(screen.queryByRole('article', { name: 'Stretching' })).not.toBeInTheDocument()
    expect(screen.queryByText(/Save your streak/)).not.toBeInTheDocument()
    expect(within(progress()).getByText('1 of 5 done yesterday')).toBeInTheDocument()

    await user.click(within(await card('Water')).getByRole('button', { name: 'Check off Water' }))

    expect(api.callsTo(`PUT /habits/${day.water.id}/check-ins/${YESTERDAY}`)).toHaveLength(1)
    expect(api.callsTo(`PUT /habits/${day.water.id}/check-ins/${DAY}`)).toHaveLength(0)
  })

  it('shows a saved day as "Saved", which cannot be checked off', async () => {
    const water = miaDay().water
    const { user } = setup({
      habits: [water],
      yesterdaySavers: [
        {
          id: '50000000-0000-4000-8000-000000000001',
          habit_id: water.id,
          member_id: mia.id,
          period_start: YESTERDAY,
          cost: 1,
          created_at: `${DAY}T08:00:00+01:00`,
        },
      ],
    })
    await card('Water')

    await user.click(screen.getByRole('button', { name: 'Yesterday' }))

    const saved = within(await card('Water')).getByRole('button', { name: 'Saved Water' })
    expect(saved).toBeDisabled()
    expect(screen.getByText('Mon 19 Oct was saved with a streak saver')).toBeInTheDocument()
  })

  it('a 409 for a saved day says it is already looked after', async () => {
    const { api, user, day } = setup()
    api.use({ [`PUT /habits/${day.reading.id}/check-ins/${DAY}`]: () => problem(409) })

    await user.click(
      within(await card('Reading')).getByRole('button', { name: 'Check off Reading' }),
    )

    expect(await screen.findByText(copy.myDay.alreadySaved)).toBeInTheDocument()
  })

  it('says so kindly when no habit had started yesterday', async () => {
    const { user } = setup({ habits: [habit(mia, { title: 'Stretching', created_on: DAY })] })
    await card('Stretching')

    await user.click(screen.getByRole('button', { name: 'Yesterday' }))

    expect(screen.getByText(copy.myDay.nothingYesterday)).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Every day' })).not.toBeInTheDocument()
  })
})

describe('REQ-015 parent change notices', () => {
  it('shows "Mum updated Reading for Tue 13 Oct" and Got it dismisses it', async () => {
    const day = miaDay()
    const notice = adjustment({ habit_id: day.reading.id })
    const { api, user } = setup({
      habits: Object.values(day),
      adjustments: [notice, adjustment({ id: 'seen', acknowledged_at: '2026-10-15T08:00:00Z' })],
    })
    api.use({
      [`PATCH /adjustments/${notice.id}`]: () =>
        json({ ...notice, acknowledged_at: '2026-10-20T10:00:00+01:00' }),
    })

    const title = await screen.findByText('Mum updated Reading for Tue 13 Oct')
    expect(screen.getByText('A check-in was added for that day.')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /^Got it/ })).toHaveLength(1)

    await user.click(
      screen.getByRole('button', { name: 'Got it — Mum updated Reading for Tue 13 Oct' }),
    )

    expect(api.callsTo(`PATCH /adjustments/${notice.id}`)[0].body).toEqual({ acknowledged: true })
    expect(title).not.toBeInTheDocument()
  })

  it('keeps the notice when Got it cannot be saved', async () => {
    const notice = adjustment({ kind: 'pin_reset', date: null })
    const { api, user } = setup({ adjustments: [notice] })
    api.use({ [`PATCH /adjustments/${notice.id}`]: () => problem(500) })

    await user.click(
      await screen.findByRole('button', { name: 'Got it — Mum reset your PIN on Wed 14 Oct' }),
    )

    expect(await screen.findByText(copy.myDay.saveTrouble)).toBeInTheDocument()
    expect(screen.getByText('Mum reset your PIN on Wed 14 Oct')).toBeInTheDocument()
  })

  it('shows change notices on Today only', async () => {
    const { user } = setup({ adjustments: [adjustment()] })
    expect(await screen.findByText('Mum updated a habit for Tue 13 Oct')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Yesterday' }))

    expect(screen.queryByText('Mum updated a habit for Tue 13 Oct')).not.toBeInTheDocument()
  })
})

describe('REQ-020 streak saver on My day', () => {
  it('offers the saver with its cost, and spends it', async () => {
    const { api, user, day, change } = setup()
    const waterCard = await card('Water')
    api.use({
      [`POST /habits/${day.water.id}/streak-savers`]: () => {
        change(day.water, { current_streak: 9, saveable_periods: [], next_saver_cost: null }, 22)
        return json(
          {
            id: '50000000-0000-4000-8000-000000000002',
            habit_id: day.water.id,
            member_id: mia.id,
            period_start: '2026-10-18',
            cost: 2,
            created_at: `${DAY}T09:00:00+01:00`,
          },
          201,
        )
      },
    })

    expect(within(waterCard).getByText('Save your streak for 2 gems?')).toBeInTheDocument()
    expect(
      within(waterCard).getByText(
        'Water had a rest on Sun 18 Oct. A streak saver keeps your streak going.',
      ),
    ).toBeInTheDocument()
    expect(within(waterCard).queryByText(/You need/)).not.toBeInTheDocument()

    await user.click(
      within(waterCard).getByRole('button', { name: 'Use a streak saver for Water on Sun 18 Oct' }),
    )

    expect(api.callsTo(`POST /habits/${day.water.id}/streak-savers`)[0].body).toEqual({
      period_start: '2026-10-18',
    })
    expect(
      await within(waterCard).findByText(
        'Streak saved! Sun 18 Oct now shows “Saved”. 2 gems spent.',
      ),
    ).toBeInTheDocument()
    expect(await within(waterCard).findByText('9 days')).toBeInTheDocument()
    expect(within(waterCard).queryByText('Save your streak for 2 gems?')).not.toBeInTheDocument()
    expect(progress()).toHaveTextContent('Balance 22 gems')
  })

  it('says how many gems are needed, kindly, when there are too few (409)', async () => {
    const { api, user, day } = setup()
    const waterCard = await card('Water')
    api.use({ [`POST /habits/${day.water.id}/streak-savers`]: () => problem(409) })

    await user.click(
      within(waterCard).getByRole('button', { name: 'Use a streak saver for Water on Sun 18 Oct' }),
    )

    const message = await within(waterCard).findByText(
      "You need 2 gems for this saver — keep going and you'll get there! You have 24 gems.",
    )
    expect(message).toHaveAttribute('role', 'status')
    expect(message.textContent).not.toMatch(/missed|failed/i)
  })

  it('tells a member with too few gems before they tap', async () => {
    setup({ balance: 1 })
    const waterCard = await card('Water')
    expect(
      within(waterCard).getByText(
        "You need 2 gems for this saver — keep going and you'll get there! You have 1 gem.",
      ),
    ).toBeInTheDocument()
  })

  it('"Not now" puts the prompt away', async () => {
    const { user } = setup()
    const waterCard = await card('Water')

    await user.click(
      within(waterCard).getByRole('button', { name: 'Not now — Water on Sun 18 Oct' }),
    )

    expect(within(waterCard).queryByText(/Save your streak/)).not.toBeInTheDocument()
  })

  it('offers a weekly saver for last week, and says so when it is no longer saveable', async () => {
    const piano = weekly(mia, 0, 3, {
      title: 'Piano',
      current_streak: 2,
      saveable_periods: [{ period_start: '2026-10-12', cost: 1 }],
    })
    const { api, user } = setup({ habits: [piano] })
    api.use({ [`POST /habits/${piano.id}/streak-savers`]: () => problem(422) })
    const pianoCard = await card('Piano')
    expect(
      within(pianoCard).getByText(
        'Piano had a quieter week from Mon 12 Oct. A streak saver keeps your streak going.',
      ),
    ).toBeInTheDocument()

    await user.click(
      within(pianoCard).getByRole('button', {
        name: 'Use a streak saver for Piano on the week of Mon 12 Oct',
      }),
    )

    expect(await screen.findByText(copy.saver.gone)).toBeInTheDocument()
  })

  it('a saver that cannot be saved for another reason asks to try again', async () => {
    const { api, user, day } = setup()
    api.use({ [`POST /habits/${day.water.id}/streak-savers`]: () => problem(500) })

    await user.click(
      within(await card('Water')).getByRole('button', { name: /^Use a streak saver/ }),
    )

    expect(await screen.findByText(copy.myDay.saveTrouble)).toBeInTheDocument()
    expect(within(await card('Water')).getByText('Save your streak for 2 gems?')).toBeVisible()
  })
})

describe('My day empty and error states', () => {
  it('invites a member with no habits to add one', async () => {
    setup({ habits: [] })
    expect(await screen.findByText(copy.myDay.noHabits)).toBeInTheDocument()
    expect(within(progress()).getByText('0 of 0 done today')).toBeInTheDocument()
    expect(within(progress()).getByText('Let’s get started!')).toBeInTheDocument()
  })

  it('lists only my own habits', async () => {
    setup({ habits: [...Object.values(miaDay()), habit(kavi, { title: 'Tidy room' })] })
    await card('Reading')
    expect(screen.queryByRole('article', { name: 'Tidy room' })).not.toBeInTheDocument()
  })

  it('offers to try again when the day cannot load', async () => {
    const { api, user } = setup({ routes: { 'GET /adjustments': () => problem(500) } })

    expect(await screen.findByText(copy.myDay.loadTrouble)).toBeInTheDocument()
    api.use({ 'GET /adjustments': () => json([]) })
    await user.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await card('Reading')).toBeInTheDocument()
  })
})
