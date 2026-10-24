import { describe, expect, it } from 'vitest'
import type { CheckInRead, StreakSaverRead } from '../api/types'
import { habit, mia, weekly } from '../test/fixtures'
import cases from './dayStates.cases.json'
import {
  dayState,
  habitDayState,
  habitHistory,
  habitWeekState,
  targetForWeek,
  weekState,
  type HabitHistory,
} from './dayStates'

const TODAY = cases.today

function history(c: (typeof cases.cases)[number]): HabitHistory {
  return {
    frequency: c.frequency as HabitHistory['frequency'],
    done: new Set(c.done),
    saved: new Set(c.saved),
    targets: c.targets,
  }
}

// The same fixture drives backend/tests/unit/test_day_states_shared.py, so both sides agree.
describe('REQ-023 day states (shared with app/domain/day_states.py)', () => {
  it.each(cases.cases.map((c) => [c.name, c] as const))('%s', (_name, c) => {
    const h = history(c)
    for (const [day, expected] of Object.entries(c.days)) {
      expect(dayState(h, day, TODAY, c.created_on), day).toBe(expected)
    }
  })
})

describe('REQ-017 week states (shared with app/domain/day_states.py)', () => {
  const weeklyCases = cases.cases.filter((c) => c.frequency === 'weekly')
  it.each(weeklyCases.map((c) => [c.name, c] as const))('%s', (_name, c) => {
    const h = history(c)
    for (const [monday, expected] of Object.entries(c.weeks)) {
      expect(weekState(h, monday, TODAY, c.created_on), monday).toEqual(expected)
    }
  })

  it('a week mid-way through still finds its target; a habit with no targets counts 1', () => {
    const targets = [
      { effective_from_week: '2026-10-19', target: 2 },
      { effective_from_week: '2026-09-07', target: 4 },
    ]
    expect(targetForWeek(targets, '2026-10-22')).toBe(2)
    expect(targetForWeek(targets, '2026-08-01')).toBe(4)
    expect(targetForWeek([], '2026-10-22')).toBe(1)
  })
})

const checkIn = (habitId: string, date: string): CheckInRead => ({
  id: `c-${habitId}-${date}`,
  habit_id: habitId,
  member_id: mia.id,
  date,
  created_by_member_id: mia.id,
  created_at: `${date}T18:00:00+01:00`,
})

const saver = (habitId: string, date: string): StreakSaverRead => ({
  id: `s-${habitId}-${date}`,
  habit_id: habitId,
  member_id: mia.id,
  period_start: date,
  cost: 1,
  created_at: `${TODAY}T08:00:00+01:00`,
})

describe('REQ-009 / REQ-023 a habit’s history in History', () => {
  it('keeps only that habit’s check-ins and savers', () => {
    const reading = habit(mia)
    const other = habit(mia)
    const h = habitHistory(
      reading,
      [checkIn(reading.id, '2026-10-19'), checkIn(other.id, '2026-10-18')],
      [saver(reading.id, '2026-10-17'), saver(other.id, '2026-10-16')],
    )
    expect([...h.done]).toEqual(['2026-10-19'])
    expect([...h.saved]).toEqual(['2026-10-17'])
  })

  it('an archived habit shows no state after the day it was archived', () => {
    const reading = habit(mia, { archived: true, archived_on: '2026-10-14' })
    const h = habitHistory(reading, [checkIn(reading.id, '2026-10-13')], [])

    expect(habitDayState(reading, h, '2026-10-13', TODAY)).toBe('done')
    expect(habitDayState(reading, h, '2026-10-14', TODAY)).toBe('not_yet')
    expect(habitDayState(reading, h, '2026-10-15', TODAY)).toBeNull()
  })

  it('an archived weekly habit has no week state after its last week', () => {
    const piano = weekly(mia, 0, 3, { archived: true, archived_on: '2026-10-07' })
    const h = habitHistory(piano, [], [])

    expect(habitWeekState(piano, h, '2026-10-05', TODAY)?.kind).toBe('in_progress')
    expect(habitWeekState(piano, h, '2026-10-12', TODAY)).toBeNull()
    // Not archived: this week is in progress, next week is coming up.
    const active = weekly(mia, 0, 3)
    expect(habitWeekState(active, h, '2026-10-26', TODAY)?.kind).toBe('coming_up')
  })
})
