import { describe, expect, it } from 'vitest'
import type { CheckInRead } from '../api/types'
import { habit, mia, kavi, weekly } from '../test/fixtures'
import { habitHistory } from './dayStates'
import {
  addMonths,
  calendarWeeks,
  canGoBack,
  canGoForward,
  cellLabel,
  checkInCount,
  dayCell,
  daysOf,
  earliestMonth,
  fetchRange,
  habitsInPeriod,
  monthOptions,
  periodLabel,
  periodOf,
  selectedMonth,
  shiftPeriod,
  tally,
} from './history'

const TODAY = '2026-10-20'

const checkIn = (habitId: string, date: string, memberId = mia.id): CheckInRead => ({
  id: `c-${habitId}-${date}`,
  habit_id: habitId,
  member_id: memberId,
  date,
  created_by_member_id: memberId,
  created_at: `${date}T18:00:00+01:00`,
})

const daysBetween = (from: string, to: string) =>
  (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 + 1

describe('REQ-023 periods back over 12 months', () => {
  it('a week runs Monday to Sunday; a month from the 1st to its last day', () => {
    expect(periodOf('week', TODAY)).toEqual({
      view: 'week',
      start: '2026-10-19',
      end: '2026-10-25',
    })
    expect(periodOf('month', TODAY)).toEqual({
      view: 'month',
      start: '2026-10-01',
      end: '2026-10-31',
    })
    expect(periodOf('month', '2028-02-10').end).toBe('2028-02-29')
  })

  it('steps a week or a month at a time, across year ends', () => {
    expect(shiftPeriod(periodOf('week', TODAY), -1).start).toBe('2026-10-12')
    expect(shiftPeriod(periodOf('week', TODAY), 1).start).toBe('2026-10-26')
    expect(shiftPeriod(periodOf('month', '2026-01-15'), -1).start).toBe('2025-12-01')
    expect(addMonths('2026-12-31', 1)).toBe('2027-01-01')
  })

  it('reaches back to this month and the 11 before it, and no further forward than today', () => {
    expect(earliestMonth(TODAY)).toBe('2025-11-01')
    const options = monthOptions(TODAY)
    expect(options).toHaveLength(12)
    expect(options[0]).toEqual({ value: '2026-10-01', label: 'October 2026' })
    expect(options[11]).toEqual({ value: '2025-11-01', label: 'November 2025' })

    expect(canGoBack(periodOf('month', '2025-12-01'), TODAY)).toBe(true)
    expect(canGoBack(periodOf('month', '2025-11-01'), TODAY)).toBe(false)
    // The week of Mon 27 Oct 2025 still holds days of November, so it can be shown...
    expect(canGoBack(periodOf('week', '2025-11-03'), TODAY)).toBe(true)
    // ...but nothing before it.
    expect(canGoBack(periodOf('week', '2025-11-01'), TODAY)).toBe(false)
    expect(canGoForward(periodOf('week', TODAY), TODAY)).toBe(false)
    expect(canGoForward(periodOf('week', '2026-10-12'), TODAY)).toBe(true)
    expect(canGoForward(periodOf('month', TODAY), TODAY)).toBe(false)
  })

  it('every request covers whole weeks and stays within 62 days', () => {
    for (const option of monthOptions(TODAY)) {
      for (const period of [periodOf('month', option.value), periodOf('week', option.value)]) {
        const range = fetchRange(period)
        expect(range.from <= period.start && range.to >= period.end).toBe(true)
        expect(daysBetween(range.from, range.to)).toBeLessThanOrEqual(62)
      }
    }
    expect(fetchRange(periodOf('month', TODAY))).toEqual({ from: '2026-09-28', to: '2026-11-01' })
  })

  it('"Jump to month" shows the month a period starts in, kept inside the 12 months', () => {
    expect(selectedMonth(periodOf('week', '2026-10-01'), TODAY)).toBe('2026-09-01')
    expect(selectedMonth(periodOf('week', '2025-11-01'), TODAY)).toBe('2025-11-01')
  })

  it('labels weeks and months', () => {
    expect(periodLabel(periodOf('week', TODAY), TODAY)).toBe('This week · 19–25 Oct')
    expect(periodLabel(periodOf('week', '2026-10-12'), TODAY)).toBe('Last week · 12–18 Oct')
    expect(periodLabel(periodOf('week', '2026-10-01'), TODAY)).toBe('28 Sept – 4 Oct')
    expect(periodLabel(periodOf('month', TODAY), TODAY)).toBe('October 2026')
  })

  it('lays a month out Monday first, with days of other months left empty', () => {
    const weeks = calendarWeeks(periodOf('month', TODAY))
    expect(weeks).toHaveLength(5)
    expect(weeks[0]).toEqual([
      null,
      null,
      null,
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
      '2026-10-04',
    ])
    expect(weeks[4]).toEqual([
      '2026-10-26',
      '2026-10-27',
      '2026-10-28',
      '2026-10-29',
      '2026-10-30',
      '2026-10-31',
      null,
    ])
  })
})

describe('REQ-009 / REQ-023 habits and totals for a period', () => {
  const week = periodOf('week', '2026-10-12')

  it('lists habits that existed in the period, archived ones too, daily first', () => {
    const piano = weekly(mia, 0, 3)
    const reading = habit(mia)
    const newer = habit(mia, { created_on: '2026-10-19' })
    const keptThatWeek = habit(mia, { archived: true, archived_on: '2026-10-14' })
    const putAwayEarlier = habit(mia, { archived: true, archived_on: '2026-10-11' })

    const shown = habitsInPeriod([piano, reading, newer, keptThatWeek, putAwayEarlier], week)

    expect(shown).toEqual([reading, keptThatWeek, piano])
  })

  it('counts done days out of days with a state ("15 of 28 done")', () => {
    const reading = habit(mia, { created_on: '2026-10-14' })
    const history = habitHistory(
      reading,
      [checkIn(reading.id, '2026-10-14'), checkIn(reading.id, '2026-10-16')],
      [],
    )
    // 14–18 Oct have a state (5 days); 12–13 Oct were before the habit.
    expect(tally([{ habit: reading, history }], daysOf(week), TODAY)).toEqual({ done: 2, total: 5 })
    // This week: Mon and Tue (today) so far.
    expect(tally([{ habit: reading, history }], daysOf(periodOf('week', TODAY)), TODAY)).toEqual({
      done: 0,
      total: 2,
    })
  })

  it('counts a member’s check-ins inside the period only', () => {
    const month = periodOf('month', TODAY)
    const checkIns = [
      checkIn('h1', '2026-09-30'),
      checkIn('h1', '2026-10-01'),
      checkIn('h1', '2026-10-02'),
      checkIn('h2', '2026-10-02', kavi.id),
    ]
    expect(checkInCount(checkIns, mia.id, month)).toBe(2)
  })

  it('names blank days: coming up, not started, put away', () => {
    const reading = habit(mia, {
      created_on: '2026-10-14',
      archived: true,
      archived_on: '2026-10-16',
    })
    const history = habitHistory(reading, [], [])
    const label = (day: string) => cellLabel(dayCell(reading, history, day, TODAY))

    expect(label('2026-10-13')).toBe('Not started')
    expect(label('2026-10-15')).toBe('Not yet')
    expect(label('2026-10-17')).toBe('Put away')
    expect(label('2026-10-21')).toBe('Coming up')
  })
})
