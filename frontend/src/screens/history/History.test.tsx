import { screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { CheckInRead, HabitRead, StreakSaverRead } from '../../api/types'
import { boardRoutes, habit, kavi, mia, TODAY, weekly } from '../../test/fixtures'
import { json, mockApi, problem, type ApiCall, type Routes } from '../../test/mockApi'
import { renderApp } from '../../test/renderWithProviders'

// Last week (12–18 Oct), following REQ-020: Sun 18 Oct is saved straight after a done day.
const reading = habit(mia, { title: 'Reading' })
const piano = weekly(mia, 0, 3, { title: 'Piano' })
const familyTime = weekly(mia, 0, 1, { title: 'Family time' })
const drawing = habit(mia, { title: 'Drawing', archived: true, archived_on: '2026-10-10' })
const tidy = habit(kavi, { title: 'Tidy room' })
const HABITS = [reading, piano, familyTime, drawing, tidy]

const checkIn = (h: HabitRead, date: string): CheckInRead => ({
  id: `c-${h.id}-${date}`,
  habit_id: h.id,
  member_id: h.member_id,
  date,
  created_by_member_id: h.member_id,
  created_at: `${date}T18:00:00+01:00`,
})

const saver = (h: HabitRead, periodStart: string): StreakSaverRead => ({
  id: `s-${h.id}-${periodStart}`,
  habit_id: h.id,
  member_id: h.member_id,
  period_start: periodStart,
  cost: 1,
  created_at: '2026-10-19T08:00:00+01:00',
})

const CHECK_INS = [
  ...['2026-10-12', '2026-10-13', '2026-10-15', '2026-10-16', '2026-10-17'].map((d) =>
    checkIn(reading, d),
  ),
  ...['2026-10-12', '2026-10-13', '2026-10-14'].map((d) => checkIn(piano, d)),
  checkIn(familyTime, '2026-10-05'),
  checkIn(drawing, '2026-10-02'),
  checkIn(tidy, '2026-10-19'),
]
const SAVERS = [saver(reading, '2026-10-18'), saver(familyTime, '2026-10-12')]

const inRange = (call: ApiCall, date: string) =>
  date >= call.query.get('from')! && date <= call.query.get('to')!

function setup(routes: Routes = {}) {
  vi.useFakeTimers({ shouldAdvanceTime: true, now: TODAY })
  const api = mockApi({
    ...boardRoutes(mia),
    'GET /habits': () => json(HABITS),
    'GET /check-ins': (call) => json(CHECK_INS.filter((c) => inRange(call, c.date))),
    'GET /streak-savers': (call) => json(SAVERS.filter((s) => inRange(call, s.period_start))),
    ...routes,
  })
  const { user } = renderApp({ route: '/history' })
  return { api, user }
}

const ranges = (calls: ApiCall[]) => calls.map((c) => [c.query.get('from'), c.query.get('to')])
const memberCard = (name: string) => screen.getByRole('region', { name })
const chips = (card: HTMLElement, list: string) =>
  within(within(card).getByRole('list', { name: list }))
    .getAllByRole('listitem')
    .map((li) => li.textContent?.slice(1)) // drop the day letter, which is aria-hidden

describe('REQ-023 History — week', () => {
  it('opens on this week for the whole family, today never "Saved"', async () => {
    const { api } = setup()

    const kaviCard = await screen.findByRole('region', { name: 'Kavi' })
    expect(
      screen.getByRole('heading', { level: 2, name: 'This week · 19–25 Oct' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'History' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Week' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Everyone' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Next week' })).toBeDisabled()
    expect(ranges(api.callsTo('GET /check-ins'))).toEqual([['2026-10-19', '2026-10-25']])
    expect(api.callsTo('GET /check-ins')[0].query.get('member_id')).toBeNull()

    expect(within(kaviCard).getByText('1 of 2 done')).toBeInTheDocument()
    expect(chips(kaviCard, 'Tidy room, This week · 19–25 Oct')).toEqual([
      'Mon 19 Oct: Done',
      'Tue 20 Oct: Not yet',
      'Wed 21 Oct: Coming up',
      'Thu 22 Oct: Coming up',
      'Fri 23 Oct: Coming up',
      'Sat 24 Oct: Coming up',
      'Sun 25 Oct: Coming up',
    ])
    expect(within(memberCard('Mia')).getByText('In progress — 0 of 3')).toBeInTheDocument()
    // Parents with no habits yet still get a card, kindly worded.
    expect(
      within(memberCard('Mum')).getByText('Mum had no habits yet in this period.'),
    ).toBeVisible()
  })

  it('shows last week with text-labelled days and one state per weekly habit (C13)', async () => {
    const { api, user } = setup()
    await screen.findByRole('heading', { level: 2, name: 'This week · 19–25 Oct' })

    await user.click(screen.getByRole('button', { name: 'Previous week' }))

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Last week · 12–18 Oct' }),
    ).toBeInTheDocument()
    expect(ranges(api.callsTo('GET /check-ins')).at(-1)).toEqual(['2026-10-12', '2026-10-18'])
    const miaCard = memberCard('Mia')
    // Reading 5 + Piano 3 + Family time 0 out of 3 × 7 days; Drawing was archived before.
    expect(within(miaCard).getByText('8 of 21 done')).toBeInTheDocument()
    expect(within(miaCard).queryByText('Drawing')).not.toBeInTheDocument()
    expect(chips(miaCard, 'Reading, Last week · 12–18 Oct')).toEqual([
      'Mon 12 Oct: Done',
      'Tue 13 Oct: Done',
      'Wed 14 Oct: Not yet',
      'Thu 15 Oct: Done',
      'Fri 16 Oct: Done',
      'Sat 17 Oct: Done',
      'Sun 18 Oct: Saved',
    ])
    expect(within(miaCard).getByText('Week complete — 3 of 3')).toBeInTheDocument()
    expect(within(miaCard).getByText('Week saved')).toBeInTheDocument()
    // A weekly habit's days are only Done or Not yet, even in a saved week.
    expect(chips(miaCard, 'Family time, Last week · 12–18 Oct')).not.toContainEqual(
      expect.stringContaining('Saved'),
    )
    expect(screen.getByRole('button', { name: 'Next week' })).toBeEnabled()
  })

  it('REQ-009 keeps an archived habit in the weeks it was kept, labelled as archived', async () => {
    const { user } = setup()
    await screen.findByRole('region', { name: 'Kavi' })

    await user.click(screen.getByRole('button', { name: 'Previous week' }))
    await user.click(screen.getByRole('button', { name: 'Previous week' }))

    const miaCard = await screen.findByRole('region', { name: 'Mia' })
    expect(within(miaCard).getByText('Drawing')).toHaveTextContent('Drawing · Archived')
    expect(chips(miaCard, 'Drawing, 5–11 Oct').slice(4)).toEqual([
      'Fri 9 Oct: Not yet',
      'Sat 10 Oct: Not yet',
      'Sun 11 Oct: Put away',
    ])
  })

  it('shows one member at a time with the filter', async () => {
    const { user } = setup()
    await screen.findByRole('region', { name: 'Kavi' })

    await user.click(screen.getByRole('button', { name: 'Kavi' }))

    expect(screen.getByRole('button', { name: 'Kavi' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Everyone' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    expect(screen.getByRole('region', { name: 'Kavi' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Mia' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Everyone' }))
    expect(screen.getByRole('region', { name: 'Mia' })).toBeInTheDocument()
  })

  it('shows a key with a text label for every state', async () => {
    setup()
    await screen.findByRole('region', { name: 'Kavi' })
    const key = screen.getByText('Key:').closest('dl')!
    for (const label of ['Done', 'Saved', 'Not yet', 'Week complete', 'Week saved']) {
      expect(within(key).getByText(label)).toBeVisible()
    }
  })
})

describe('REQ-023 / REQ-009 History — month', () => {
  it('shows check-ins per person and a calendar per habit, archived ones too', async () => {
    const { api, user } = setup()
    await screen.findByRole('region', { name: 'Kavi' })

    await user.click(screen.getByRole('button', { name: 'Month' }))

    expect(
      await screen.findByRole('heading', { level: 2, name: 'October 2026' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next month' })).toBeDisabled()
    // Whole weeks, so the first and last rows' weekly states can be worked out.
    expect(ranges(api.callsTo('GET /check-ins')).at(-1)).toEqual(['2026-09-28', '2026-11-01'])

    const totals = screen.getByRole('region', { name: 'October so far — check-ins per person' })
    const miaRow = within(totals).getByText('Mia').closest('li')!
    expect(miaRow).toHaveTextContent('10 check-ins')
    expect(within(totals).getByText('Kavi').closest('li')).toHaveTextContent('1 check-in')

    const calendar = screen.getByRole('region', { name: 'Mia · Reading' })
    expect(within(calendar).getByText('5 of 20 days')).toBeInTheDocument()
    expect(within(calendar).getByText('Sun 18 Oct: Saved')).toBeInTheDocument()
    expect(within(calendar).getByText('Tue 20 Oct: Not yet')).toBeInTheDocument()
    expect(within(calendar).getByText('Wed 21 Oct: Coming up')).toBeInTheDocument()

    const pianoCalendar = screen.getByRole('region', { name: 'Mia · Piano' })
    expect(within(pianoCalendar).getByRole('columnheader', { name: 'Week' })).toBeInTheDocument()
    expect(within(pianoCalendar).getByText('Week complete — 3 of 3')).toBeInTheDocument()
    expect(within(pianoCalendar).getByText('In progress — 0 of 3')).toBeInTheDocument()
    expect(within(pianoCalendar).getByText('Coming up')).toBeInTheDocument()
    // A past week below target is worded kindly (C19).
    expect(within(pianoCalendar).getAllByText('A quieter week — 0 of 3')).not.toHaveLength(0)

    // REQ-009: an archived habit is kept in History, labelled as archived.
    const archived = screen.getByRole('region', { name: 'Mia · Drawing · Archived' })
    expect(within(archived).getByText('Fri 2 Oct: Done')).toBeInTheDocument()
    expect(within(archived).getByText('Sun 11 Oct: Put away')).toBeInTheDocument()
  })

  it('goes back 12 months and no further, never asking for more than 62 days', async () => {
    const { api, user } = setup()
    await screen.findByRole('region', { name: 'Kavi' })
    await user.click(screen.getByRole('button', { name: 'Month' }))
    await screen.findByRole('heading', { level: 2, name: 'October 2026' })

    for (let i = 0; i < 11; i += 1) {
      await user.click(screen.getByRole('button', { name: 'Previous month' }))
    }

    expect(
      await screen.findByRole('heading', { level: 2, name: 'November 2025' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Previous month' })).toBeDisabled()
    expect(screen.getByRole('combobox', { name: 'Jump to month' })).toHaveValue('2025-11-01')
    const all = ranges(api.callsTo('GET /check-ins'))
    expect(all.at(-1)).toEqual(['2025-10-27', '2025-11-30'])
    for (const [from, to] of all) {
      const days = (Date.parse(to!) - Date.parse(from!)) / 86_400_000 + 1
      expect(days).toBeLessThanOrEqual(62)
    }
    expect(ranges(api.callsTo('GET /streak-savers')).at(-1)).toEqual(['2025-10-27', '2025-11-30'])
  })

  it('jumps to a month, and to its first week in the week view', async () => {
    const { api, user } = setup()
    await screen.findByRole('region', { name: 'Kavi' })
    const jump = screen.getByRole('combobox', { name: 'Jump to month' })
    expect(within(jump).getAllByRole('option')).toHaveLength(12)

    await user.selectOptions(jump, 'March 2026')

    expect(
      await screen.findByRole('heading', { level: 2, name: '23 Feb – 1 Mar' }),
    ).toBeInTheDocument()
    expect(ranges(api.callsTo('GET /check-ins')).at(-1)).toEqual(['2026-02-23', '2026-03-01'])

    // From a past week, Month opens that week's month; back to Week opens its first week.
    await user.click(screen.getByRole('button', { name: 'Month' }))
    expect(
      await screen.findByRole('heading', { level: 2, name: 'February 2026' }),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Week' }))
    expect(
      await screen.findByRole('heading', { level: 2, name: '26 Jan – 1 Feb' }),
    ).toBeInTheDocument()
  })

  it('from this month, Week opens this week', async () => {
    const { user } = setup()
    await screen.findByRole('region', { name: 'Kavi' })
    await user.click(screen.getByRole('button', { name: 'Month' }))
    await screen.findByRole('heading', { level: 2, name: 'October 2026' })
    // Choosing the view already shown changes nothing.
    await user.click(screen.getByRole('button', { name: 'Month' }))

    await user.click(screen.getByRole('button', { name: 'Week' }))

    expect(
      await screen.findByRole('heading', { level: 2, name: 'This week · 19–25 Oct' }),
    ).toBeInTheDocument()
  })
})

describe('History when the server can’t be reached', () => {
  it('offers to try again when a period doesn’t load', async () => {
    let fail = true
    const { user } = setup({
      'GET /check-ins': () => (fail ? problem(500) : json([])),
    })

    expect(await screen.findByText("We couldn't load the history just now.")).toBeVisible()
    fail = false
    await user.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByRole('region', { name: 'Kavi' })).toBeInTheDocument()
  })

  it('offers to try again when the family doesn’t load', async () => {
    let fail = true
    const { user } = setup({
      'GET /habits': () => (fail ? problem(500) : json(HABITS)),
    })

    expect(await screen.findByText("We couldn't load the history just now.")).toBeVisible()
    fail = false
    await user.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByRole('region', { name: 'Kavi' })).toBeInTheDocument()
  })
})
