// What the Family board shows per member (REQ-022), derived from HabitRead fields only.
import type { HabitRead } from '../api/types'
import { copy } from '../copy'

export interface Streak {
  length: number
  unit: 'days' | 'weeks'
}

export interface MemberSummary {
  done: number
  due: number
  /** The longest current streak across the member's habits, or null with no habits. */
  longest: Streak | null
}

/**
 * Done today: checked in today, or (weekly habits) this week's target is already met,
 * so nothing more is due today.
 */
export function isDoneToday(habit: HabitRead): boolean {
  return habit.today_done || (habit.week_progress?.complete ?? false)
}

export function currentStreak(habit: HabitRead): Streak {
  return { length: habit.current_streak, unit: habit.frequency === 'weekly' ? 'weeks' : 'days' }
}

export function bestStreak(habit: HabitRead): Streak {
  return { length: habit.best_streak, unit: habit.frequency === 'weekly' ? 'weeks' : 'days' }
}

export function streakText(streak: Streak): string {
  return streak.unit === 'weeks' ? copy.habit.weeks(streak.length) : copy.habit.days(streak.length)
}

// A weekly streak counts as 7 days per week when compared with a daily one.
const inDays = (streak: Streak) => streak.length * (streak.unit === 'weeks' ? 7 : 1)

export function summarize(habits: HabitRead[]): MemberSummary {
  let longest: Streak | null = null
  for (const habit of habits) {
    const streak = currentStreak(habit)
    if (longest === null || inDays(streak) > inDays(longest)) longest = streak
  }
  return { done: habits.filter(isDoneToday).length, due: habits.length, longest }
}

export function habitsByMember(habits: HabitRead[]): Map<string, HabitRead[]> {
  const byMember = new Map<string, HabitRead[]>()
  for (const habit of habits) {
    const list = byMember.get(habit.member_id) ?? []
    list.push(habit)
    byMember.set(habit.member_id, list)
  }
  return byMember
}
