import { describe, expect, it } from 'vitest'
import type { AdjustmentKind, AdjustmentRead, CheckInRead, StreakSaverRead } from '../api/types'
import { copy } from '../copy'
import { habit, mia, mum, TIMEZONE, weekly } from '../test/fixtures'
import {
  changeNotices,
  describeChanges,
  habitDays,
  periodLabel,
  saverOffer,
  summarizeDay,
} from './myDay'

const TODAY = '2026-10-20'
const YESTERDAY = '2026-10-19'

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

const inputs = { today: TODAY, yesterday: YESTERDAY, yesterdayCheckIns: [], yesterdaySavers: [] }

describe('REQ-016 / REQ-017 today on My day', () => {
  it('shows today’s state, the "make it 4" hint and weekly progress', () => {
    const reading = habit(mia, { current_streak: 3, streak_pending: true })
    const fresh = habit(mia, { current_streak: 0 })
    const done = habit(mia, { current_streak: 4, today_done: true })
    const piano = weekly(mia, 2, 3)
    const family = weekly(mia, 1, 1)
    const archived = habit(mia, { archived: true })

    const days = habitDays({
      ...inputs,
      view: 'today',
      habits: [reading, fresh, done, piano, family, archived],
    })

    expect(days.map((d) => [d.habit.id, d.day, d.done, d.hint, d.showWeek])).toEqual([
      [reading.id, TODAY, false, 'Check in today to make it 4!', false],
      [fresh.id, TODAY, false, null, false],
      [done.id, TODAY, true, null, false],
      [piano.id, TODAY, false, '1 more this week to keep your streak going', true],
      [family.id, TODAY, false, 'Week complete — nice one!', true],
    ])
  })

  it('has no weekly hint without week progress', () => {
    const odd = weekly(mia, 0, 1, { week_progress: null })
    expect(habitDays({ ...inputs, view: 'today', habits: [odd] })[0].hint).toBeNull()
  })
})

describe('REQ-013 yesterday on My day', () => {
  it('uses yesterday’s check-ins and savers, and skips habits created today', () => {
    const done = habit(mia)
    const open = habit(mia)
    const saved = habit(mia)
    const piano = weekly(mia, 2, 3)
    const savedWeek = weekly(mia, 0, 3)
    const newToday = habit(mia, { created_on: TODAY })

    const days = habitDays({
      ...inputs,
      view: 'yesterday',
      habits: [done, open, saved, piano, savedWeek, newToday],
      yesterdayCheckIns: [checkIn(done.id, YESTERDAY), checkIn(piano.id, YESTERDAY)],
      // A weekly saver covers a week, so it never makes a single day "Saved" (C13).
      yesterdaySavers: [saver(saved.id, YESTERDAY), saver(savedWeek.id, '2026-10-12')],
    })

    expect(days.map((d) => [d.habit.id, d.day, d.done, d.saved, d.hint, d.showWeek])).toEqual([
      [done.id, YESTERDAY, true, false, null, false],
      [open.id, YESTERDAY, false, false, 'Counts for Mon 19 Oct', false],
      [saved.id, YESTERDAY, false, true, 'Mon 19 Oct was saved with a streak saver', false],
      [piano.id, YESTERDAY, true, false, '1 more this week to keep your streak going', true],
      [savedWeek.id, YESTERDAY, false, false, 'Counts for Mon 19 Oct', true],
    ])
  })

  it('hides this week’s progress when yesterday was last week (a Monday)', () => {
    const piano = weekly(mia, 1, 3)
    const days = habitDays({
      ...inputs,
      today: '2026-10-26',
      yesterday: '2026-10-25',
      view: 'yesterday',
      habits: [piano],
      yesterdayCheckIns: [checkIn(piano.id, '2026-10-25')],
    })
    expect(days[0]).toMatchObject({ done: true, hint: null, showWeek: false })
  })
})

describe('daily summary', () => {
  it('counts done and saved, and cheers kindly', () => {
    const base = { habit: habit(mia), day: TODAY, hint: null, showWeek: false }
    const open = { ...base, done: false, saved: false }
    const done = { ...base, done: true, saved: false }
    const saved = { ...base, done: false, saved: true }
    expect(summarizeDay([open, open])).toEqual({ done: 0, total: 2, cheer: 'Let’s get started!' })
    expect(summarizeDay([done, open])).toMatchObject({ done: 1, cheer: copy.myDay.cheerSome })
    expect(summarizeDay([done, saved])).toMatchObject({ done: 2, cheer: copy.myDay.cheerAll })
  })
})

describe('REQ-020 which saver to offer', () => {
  it('offers the cheapest period, the latest on a tie, or nothing', () => {
    const periods = [
      { period_start: '2026-10-14', cost: 2 },
      { period_start: '2026-10-16', cost: 1 },
      { period_start: '2026-10-15', cost: 1 },
    ]
    expect(saverOffer(habit(mia, { saveable_periods: periods }))).toEqual(periods[1])
    expect(saverOffer(habit(mia))).toBeNull()
  })

  it('names a day, or a week for weekly habits', () => {
    expect(periodLabel(habit(mia), '2026-10-18')).toBe('Sun 18 Oct')
    expect(periodLabel(weekly(mia, 0, 3), '2026-10-12')).toBe('the week of Mon 12 Oct')
  })
})

describe('REQ-015 change notices', () => {
  const reading = habit(mia, { title: 'Reading' })
  let n = 0
  const adjustment = (kind: AdjustmentKind, more: Partial<AdjustmentRead> = {}): AdjustmentRead => {
    n += 1
    return {
      id: `a-${n}`,
      kind,
      actor_member_id: mum.id,
      target_member_id: mia.id,
      habit_id: reading.id,
      date: null,
      acknowledged_at: null,
      created_at: `2026-10-${String(10 + n).padStart(2, '0')}T12:00:00+01:00`,
      ...more,
    }
  }
  const titles = (list: AdjustmentRead[]) =>
    changeNotices(list, [mum, mia], [reading], TIMEZONE).map((x) => x.title)

  it('names who, what and when, newest first, and skips dismissed ones', () => {
    const list = [
      adjustment('check_in_added', { date: '2026-10-14' }),
      adjustment('habit_updated'),
      adjustment('pin_reset', { habit_id: null }),
      adjustment('habit_created', { acknowledged_at: '2026-10-15T09:00:00+01:00' }),
    ]
    const notices = changeNotices(list, [mum, mia], [reading], TIMEZONE)
    expect(notices.map((x) => [x.id, x.title, x.text])).toEqual([
      [list[2].id, 'Mum reset your PIN on Tue 13 Oct', 'Use your new PIN next time you check in.'],
      [list[1].id, 'Mum updated Reading on Mon 12 Oct', 'Its details changed.'],
      [list[0].id, 'Mum updated Reading for Wed 14 Oct', 'A check-in was added for that day.'],
    ])
  })

  it('has kind words for every kind, and for removed parents and habits', () => {
    expect(
      titles([
        adjustment('habit_created', { created_at: '2026-10-01T12:00:00+01:00' }),
        adjustment('habit_archived', { created_at: '2026-10-02T12:00:00+01:00' }),
        adjustment('habit_deleted', {
          habit_id: null,
          actor_member_id: null,
          created_at: '2026-10-03T12:00:00+01:00',
        }),
        adjustment('check_in_removed', {
          date: '2026-10-02',
          created_at: '2026-10-04T12:00:00+01:00',
        }),
        adjustment('streak_saver_used', {
          date: '2026-10-03',
          habit_id: 'gone',
          created_at: '2026-10-05T12:00:00+01:00',
        }),
      ]),
    ).toEqual([
      'Mum saved your streak on a habit for Sat 3 Oct',
      'Mum updated Reading for Fri 2 Oct',
      'A parent removed a habit on Sat 3 Oct',
      'Mum archived Reading on Fri 2 Oct',
      'Mum added Reading on Thu 1 Oct',
    ])
  })

  it('dates a change by the family day it happened', () => {
    // 23:30 UTC on 14 Oct is 15 Oct in Auckland.
    const late = adjustment('habit_updated', { created_at: '2026-10-14T23:30:00+00:00' })
    expect(changeNotices([late], [mum], [reading], 'Pacific/Auckland')[0].title).toBe(
      'Mum updated Reading on Thu 15 Oct',
    )
  })

  it('"Changes to my habits" keeps dismissed ones, with the parent’s avatar and the day', () => {
    const list = [
      adjustment('check_in_added', {
        date: '2026-10-14',
        acknowledged_at: '2026-10-20T08:00:00+01:00',
      }),
      adjustment('pin_reset', { habit_id: null, actor_member_id: null }),
    ]
    const lines = describeChanges(list, [mum, mia], [reading], TIMEZONE)
    expect(lines.map((x) => [x.title, x.actorEmoji, x.madeOn, x.acknowledged])).toEqual([
      [`A parent reset your PIN on ${lines[0].madeOn}`, null, lines[0].madeOn, false],
      ['Mum updated Reading for Wed 14 Oct', '🌻', lines[1].madeOn, true],
    ])
    expect(lines[1].madeOn).toMatch(/^\w{3} \d{1,2} Oct$/)
  })
})
