// History day and week states, mirroring app/domain/day_states.py (REQ-023, REQ-017, C13).
// Both sides are tested against dayStates.cases.json, so the screen and the server agree.
import type { CheckInRead, HabitRead, StreakSaverRead, TargetChangeRead } from '../api/types'
import { addDays, mondayOf } from './dates'

export type DayState = 'done' | 'saved' | 'not_yet'

export type WeekKind = 'complete' | 'saved' | 'in_progress' | 'below_target' | 'coming_up'

export interface WeekState {
  kind: WeekKind
  /** Capped at the target: 5 check-ins against 3 shows as "3 of 3" (C13). */
  done: number
  target: number
}

export interface HabitHistory {
  frequency: HabitRead['frequency']
  /** Check-in dates. */
  done: ReadonlySet<string>
  /** Saver period starts: a day for a daily habit, a Monday for a weekly one. */
  saved: ReadonlySet<string>
  targets: readonly TargetChangeRead[]
}

/** The target in effect for the week containing `day`; the first one also covers earlier weeks. */
export function targetForWeek(targets: readonly TargetChangeRead[], day: string): number {
  const ordered = [...targets].sort((a, b) =>
    a.effective_from_week.localeCompare(b.effective_from_week),
  )
  const monday = mondayOf(day)
  let target = ordered[0]?.target ?? 1
  for (const change of ordered) {
    if (change.effective_from_week > monday) break
    target = change.target
  }
  return target
}

/** "Done", "Saved" or "Not yet"; null (blank) after today or before the habit existed. */
export function dayState(
  history: HabitHistory,
  day: string,
  today: string,
  createdOn?: string,
): DayState | null {
  if (day > today || (createdOn !== undefined && day < createdOn)) return null
  if (history.done.has(day)) return 'done'
  // Weekly savers cover a whole week, never a day; today can't be saved yet (C13).
  if (history.frequency === 'daily' && history.saved.has(day) && day < today) return 'saved'
  return 'not_yet'
}

/** A weekly habit's one state for the week containing `week`; null before the habit existed. */
export function weekState(
  history: HabitHistory,
  week: string,
  today: string,
  createdOn?: string,
): WeekState | null {
  const monday = mondayOf(week)
  if (createdOn !== undefined && monday < mondayOf(createdOn)) return null
  const target = targetForWeek(history.targets, monday)
  if (monday > today) return { kind: 'coming_up', done: 0, target }
  const sunday = addDays(monday, 6)
  let done = 0
  for (const day of history.done) if (day >= monday && day <= sunday && day <= today) done += 1
  let kind: WeekKind
  if (done >= target) kind = 'complete'
  else if (history.saved.has(monday)) kind = 'saved'
  else if (monday === mondayOf(today)) kind = 'in_progress'
  else kind = 'below_target'
  return { kind, done: Math.min(done, target), target }
}

/** One habit's history from the check-ins and savers loaded for a period. */
export function habitHistory(
  habit: HabitRead,
  checkIns: readonly CheckInRead[],
  savers: readonly StreakSaverRead[],
): HabitHistory {
  return {
    frequency: habit.frequency,
    done: new Set(checkIns.filter((c) => c.habit_id === habit.id).map((c) => c.date)),
    saved: new Set(savers.filter((s) => s.habit_id === habit.id).map((s) => s.period_start)),
    targets: habit.target_history,
  }
}

/**
 * The last day History shows a state for: today, or the archive date, because an archived
 * habit stops there (REQ-009) — the server freezes its streak the same way.
 */
export function lastShownDay(habit: HabitRead, today: string): string {
  return habit.archived_on !== null && habit.archived_on < today ? habit.archived_on : today
}

/** A habit's day state in History, blank after it was archived. */
export function habitDayState(
  habit: HabitRead,
  history: HabitHistory,
  day: string,
  today: string,
): DayState | null {
  const last = lastShownDay(habit, today)
  if (day > last) return null
  return dayState(history, day, last, habit.created_on)
}

/** A weekly habit's week state in History, blank for weeks after it was archived. */
export function habitWeekState(
  habit: HabitRead,
  history: HabitHistory,
  week: string,
  today: string,
): WeekState | null {
  const last = lastShownDay(habit, today)
  if (last !== today && mondayOf(week) > mondayOf(last)) return null
  return weekState(history, week, last, habit.created_on)
}
