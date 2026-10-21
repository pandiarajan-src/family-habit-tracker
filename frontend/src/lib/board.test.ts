import { describe, expect, it } from 'vitest'
import { dad, habit, kavi, kaviHabits, mia, miaHabits, weekly } from '../test/fixtures'
import { bestStreak, habitsByMember, isDoneToday, streakText, summarize } from './board'

describe('REQ-022 board summary', () => {
  it('counts done today out of due, and the longest current streak', () => {
    expect(summarize(miaHabits)).toEqual({ done: 3, due: 5, longest: { length: 12, unit: 'days' } })
  })

  it('counts a weekly streak as 7 days per week when comparing', () => {
    expect(summarize(kaviHabits)).toEqual({
      done: 1,
      due: 2,
      longest: { length: 3, unit: 'weeks' },
    })
  })

  it('keeps the first streak on a tie and handles no habits', () => {
    const tie = [habit(dad, { current_streak: 7 }), weekly(dad, 0, 1, { current_streak: 1 })]
    expect(summarize(tie).longest).toEqual({ length: 7, unit: 'days' })
    expect(summarize([])).toEqual({ done: 0, due: 0, longest: null })
  })

  it('treats a weekly habit as done today when checked in today or its week is complete', () => {
    expect(isDoneToday(weekly(mia, 1, 3, { today_done: true }))).toBe(true)
    expect(isDoneToday(weekly(mia, 3, 3))).toBe(true)
    expect(isDoneToday(weekly(mia, 1, 3))).toBe(false)
    expect(isDoneToday(habit(mia))).toBe(false)
  })

  it('names streaks in days or weeks', () => {
    expect(streakText({ length: 1, unit: 'days' })).toBe('1 day')
    expect(streakText(bestStreak(weekly(kavi, 0, 2, { best_streak: 4 })))).toBe('4 weeks')
    expect(streakText(bestStreak(habit(kavi, { best_streak: 9 })))).toBe('9 days')
  })

  it('groups habits by member', () => {
    const grouped = habitsByMember([...miaHabits, ...kaviHabits])
    expect(grouped.get(mia.id)).toHaveLength(5)
    expect(grouped.get(kavi.id)).toHaveLength(2)
    expect(grouped.get(dad.id)).toBeUndefined()
  })
})
