// What History shows: the week or month on screen, the 12 months it reaches back, the habits in a
// period and per-member totals (REQ-023). Dates are family dates as ISO strings, like lib/dates.
import type { CheckInRead, HabitRead } from '../api/types'
import { copy } from '../copy'
import { addDays, mondayOf } from './dates'
import { habitDayState, type DayState, type HabitHistory } from './dayStates'

export type HistoryView = 'week' | 'month'

export interface Period {
  view: HistoryView
  /** A Monday, or the 1st of the month. */
  start: string
  /** The Sunday, or the last day of the month: at most 31 days, inside the API's 62. */
  end: string
}

/** History reaches back over this month and the 11 before it (REQ-023). */
export const MONTHS_BACK = 11

export function monthStart(day: string): string {
  return `${day.slice(0, 8)}01`
}

/** The 1st of the month `months` after the month of `day` (negative goes back). */
export function addMonths(day: string, months: number): string {
  const [year, month] = day.split('-').map(Number)
  const index = year * 12 + (month - 1) + months
  const y = Math.floor(index / 12)
  const m = (index % 12) + 1
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-01`
}

export function earliestMonth(today: string): string {
  return addMonths(today, -MONTHS_BACK)
}

/** The week or month that contains `day`. */
export function periodOf(view: HistoryView, day: string): Period {
  if (view === 'week') {
    const start = mondayOf(day)
    return { view, start, end: addDays(start, 6) }
  }
  const start = monthStart(day)
  return { view, start, end: addDays(addMonths(start, 1), -1) }
}

/** The period before (-1) or after (+1) this one. */
export function shiftPeriod(period: Period, step: -1 | 1): Period {
  return periodOf(period.view, step === -1 ? addDays(period.start, -1) : addDays(period.end, 1))
}

/** Previous stops once it would leave the 12 months History keeps. */
export function canGoBack(period: Period, today: string): boolean {
  return addDays(period.start, -1) >= earliestMonth(today)
}

/** Next stops at the period that holds today. */
export function canGoForward(period: Period, today: string): boolean {
  return period.end < today
}

export interface MonthOption {
  /** The 1st of the month. */
  value: string
  label: string
}

/** "October 2026" */
export function formatMonth(day: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(Date.parse(`${day}T00:00:00Z`))
}

/** This month and the 11 before it, newest first, for "Jump to month". */
export function monthOptions(today: string): MonthOption[] {
  return Array.from({ length: MONTHS_BACK + 1 }, (_, i) => {
    const value = addMonths(today, -i)
    return { value, label: formatMonth(value) }
  })
}

/** The month "Jump to month" shows for a period, kept inside the 12 months on offer. */
export function selectedMonth(period: Period, today: string): string {
  const month = monthStart(period.start)
  const earliest = earliestMonth(today)
  return month < earliest ? earliest : month
}

const dayMonth = (day: string, withMonth: boolean) =>
  new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    ...(withMonth ? { month: 'short' } : {}),
    timeZone: 'UTC',
  }).format(Date.parse(`${day}T00:00:00Z`))

/** "This week · 19–25 Oct", "Last week · 12–18 Oct", "28 Sep – 4 Oct", or "October 2026". */
export function periodLabel(period: Period, today: string): string {
  if (period.view === 'month') return formatMonth(period.start)
  const sameMonth = period.start.slice(0, 7) === period.end.slice(0, 7)
  const range = sameMonth
    ? `${dayMonth(period.start, false)}–${dayMonth(period.end, true)}`
    : `${dayMonth(period.start, true)} – ${dayMonth(period.end, true)}`
  const thisWeek = mondayOf(today)
  if (period.start === thisWeek) return copy.history.thisWeek(range)
  if (period.start === addDays(thisWeek, -7)) return copy.history.lastWeek(range)
  return range
}

export function daysOf(period: Period): string[] {
  const days: string[] = []
  for (let day = period.start; day <= period.end; day = addDays(day, 1)) days.push(day)
  return days
}

/**
 * The habits History lists for a period: those that existed by its end and weren't archived
 * before it began, so an archived habit still appears for the weeks it was kept (REQ-009).
 * Daily habits come first, then weekly ones, each in the order the API sent them.
 */
export function habitsInPeriod(habits: readonly HabitRead[], period: Period): HabitRead[] {
  const shown = habits.filter(
    (h) => h.created_on <= period.end && (h.archived_on === null || h.archived_on >= period.start),
  )
  return [
    ...shown.filter((h) => h.frequency === 'daily'),
    ...shown.filter((h) => h.frequency === 'weekly'),
  ]
}

export interface Tally {
  done: number
  /** Days with a state: blank days (coming up, before the habit, after archiving) don't count. */
  total: number
}

/** "15 of 28 done": check-in days out of the days that have a state. */
export function tally(
  rows: readonly { habit: HabitRead; history: HabitHistory }[],
  days: readonly string[],
  today: string,
): Tally {
  let done = 0
  let total = 0
  for (const { habit, history } of rows) {
    for (const day of days) {
      const state = habitDayState(habit, history, day, today)
      if (state === null) continue
      total += 1
      if (state === 'done') done += 1
    }
  }
  return { done, total }
}

/** Check-ins a member made in a period ("58 check-ins"). */
export function checkInCount(
  checkIns: readonly CheckInRead[],
  memberId: string,
  period: Period,
): number {
  return checkIns.filter(
    (c) => c.member_id === memberId && c.date >= period.start && c.date <= period.end,
  ).length
}

/**
 * The dates History loads for a period: whole weeks, so a weekly habit's week state can count
 * its check-ins and find its saver even when the week starts or ends in another month.
 * At most 43 days, inside the API's 62 (REQ-023).
 */
export function fetchRange(period: Period): { from: string; to: string } {
  return { from: mondayOf(period.start), to: addDays(mondayOf(period.end), 6) }
}

/** A month as calendar rows, Monday first; days outside the month are null. */
export function calendarWeeks(period: Period): (string | null)[][] {
  const weeks: (string | null)[][] = []
  for (let monday = mondayOf(period.start); monday <= period.end; monday = addDays(monday, 7)) {
    weeks.push(
      Array.from({ length: 7 }, (_, i) => {
        const day = addDays(monday, i)
        return day >= period.start && day <= period.end ? day : null
      }),
    )
  }
  return weeks
}

/** What a day chip or calendar cell shows: a state, or why it's blank. */
export type DayCell =
  { kind: 'state'; state: DayState } | { kind: 'blank'; reason: 'later' | 'before' | 'after' }

export function dayCell(
  habit: HabitRead,
  history: HabitHistory,
  day: string,
  today: string,
): DayCell {
  const state = habitDayState(habit, history, day, today)
  if (state !== null) return { kind: 'state', state }
  if (day > today) return { kind: 'blank', reason: 'later' }
  if (day < habit.created_on) return { kind: 'blank', reason: 'before' }
  return { kind: 'blank', reason: 'after' }
}

/** The text a cell reads as, beside its colour and icon (REQ-023: never colour alone). */
export function cellLabel(cell: DayCell): string {
  return cell.kind === 'state'
    ? copy.history.dayStates[cell.state]
    : copy.history.blank[cell.reason]
}

/** The style a cell takes: its state, or "blank". */
export function cellTone(cell: DayCell): DayState | 'blank' {
  return cell.kind === 'state' ? cell.state : 'blank'
}
