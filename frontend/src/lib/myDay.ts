// What My day shows for each habit, derived from HabitRead and one day's check-ins/savers.
import type {
  AdjustmentRead,
  CheckInRead,
  HabitRead,
  MemberRead,
  SaveablePeriodRead,
  StreakSaverRead,
} from '../api/types'
import { copy } from '../copy'
import { familyDate, formatShortDay, mondayOf } from './dates'

export type DayView = 'today' | 'yesterday'

export interface HabitDay {
  habit: HabitRead
  /** The family date a tap checks in or undoes. */
  day: string
  done: boolean
  /** Covered by a streak saver: it can't be checked in (REQ-020, 409). */
  saved: boolean
  /** Encouraging line under the streak, or null. */
  hint: string | null
  /** "2 of 3 this week" only when the week shown is this week. */
  showWeek: boolean
}

interface DayInputs {
  view: DayView
  today: string
  yesterday: string
  habits: HabitRead[]
  /** The acting member's check-ins and savers for yesterday (today's come from HabitRead). */
  yesterdayCheckIns: CheckInRead[]
  yesterdaySavers: StreakSaverRead[]
}

function weeklyHint(habit: HabitRead): string | null {
  const week = habit.week_progress
  if (!week) return null
  return week.complete ? copy.myDay.weekComplete : copy.myDay.moreThisWeek(week.target - week.done)
}

/** The habits My day lists for `view`, each with its state for that day (REQ-011, 013, 016, 017). */
export function habitDays({
  view,
  today,
  yesterday,
  habits,
  yesterdayCheckIns,
  yesterdaySavers,
}: DayInputs): HabitDay[] {
  const active = habits.filter((habit) => !habit.archived)
  if (view === 'today') {
    return active.map((habit) => {
      const weekly = habit.frequency === 'weekly'
      let hint: string | null = null
      if (weekly) hint = weeklyHint(habit)
      else if (!habit.today_done && habit.streak_pending)
        hint = copy.myDay.makeIt(habit.current_streak + 1)
      return { habit, day: today, done: habit.today_done, saved: false, hint, showWeek: weekly }
    })
  }

  const doneIds = new Set(yesterdayCheckIns.map((c) => c.habit_id))
  const savedIds = new Set(yesterdaySavers.map((s) => s.habit_id))
  const sameWeek = mondayOf(yesterday) === mondayOf(today)
  // A habit created today has nothing to check in yesterday (REQ-013: 422).
  return active
    .filter((habit) => habit.created_on <= yesterday)
    .map((habit) => {
      const weekly = habit.frequency === 'weekly'
      const done = doneIds.has(habit.id)
      // Weekly savers cover a whole week, never a single day (C13).
      const saved = !weekly && !done && savedIds.has(habit.id)
      let hint: string | null = null
      if (saved) hint = copy.myDay.savedDay(formatShortDay(yesterday))
      else if (!done) hint = copy.myDay.countsFor(formatShortDay(yesterday))
      else if (weekly && sameWeek) hint = weeklyHint(habit)
      return { habit, day: yesterday, done, saved, hint, showWeek: weekly && sameWeek }
    })
}

export interface DaySummary {
  done: number
  total: number
  cheer: string
}

export function summarizeDay(days: HabitDay[]): DaySummary {
  const done = days.filter((d) => d.done || d.saved).length
  const total = days.length
  let cheer: string = copy.myDay.cheerSome
  if (done === 0) cheer = copy.myDay.cheerNone
  else if (done === total) cheer = copy.myDay.cheerAll
  return { done, total, cheer }
}

/** The saver to offer: the cheapest saveable period, the latest one on a tie (REQ-020). */
export function saverOffer(habit: HabitRead): SaveablePeriodRead | null {
  let best: SaveablePeriodRead | null = null
  for (const period of habit.saveable_periods) {
    if (
      best === null ||
      period.cost < best.cost ||
      (period.cost === best.cost && period.period_start > best.period_start)
    )
      best = period
  }
  return best
}

/** "Sun 18 Oct", or "the week of Mon 12 Oct" for a weekly habit. */
export function periodLabel(habit: HabitRead, periodStart: string): string {
  const day = formatShortDay(periodStart)
  return habit.frequency === 'weekly' ? copy.saver.weekOf(day) : day
}

export interface ChangeNotice {
  id: string
  title: string
  text: string
}

export interface ChangeLine extends ChangeNotice {
  /** The parent's avatar, or null once they're removed. */
  actorEmoji: string | null
  /** The family date the change was made ("Mon 19 Oct"). */
  madeOn: string
  acknowledged: boolean
}

/**
 * Every change a parent made, newest first (REQ-015). The API sends IDs only, so nicknames
 * and titles come from members and habits already loaded.
 */
export function describeChanges(
  adjustments: AdjustmentRead[],
  members: MemberRead[],
  habits: HabitRead[],
  timeZone: string,
): ChangeLine[] {
  const byId = new Map(members.map((m) => [m.id, m]))
  const title = new Map(habits.map((h) => [h.id, h.title]))
  return [...adjustments]
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
    .map((a) => {
      const actor = a.actor_member_id ? byId.get(a.actor_member_id) : undefined
      const who = actor?.nickname ?? copy.changes.someone
      const habit = (a.habit_id && title.get(a.habit_id)) || copy.changes.aHabit
      const madeOn = familyDate(Date.parse(a.created_at), timeZone)
      return {
        id: a.id,
        title: copy.changes.title[a.kind](who, habit, formatShortDay(a.date ?? madeOn)),
        text: copy.changes.text[a.kind],
        actorEmoji: actor?.avatar_emoji ?? null,
        madeOn: formatShortDay(madeOn),
        acknowledged: a.acknowledged_at !== null,
      }
    })
}

/** My day's notices: the changes not yet dismissed with "Got it", newest first. */
export function changeNotices(
  adjustments: AdjustmentRead[],
  members: MemberRead[],
  habits: HabitRead[],
  timeZone: string,
): ChangeNotice[] {
  return describeChanges(adjustments, members, habits, timeZone)
    .filter((line) => !line.acknowledged)
    .map(({ id, title, text }) => ({ id, title, text }))
}
