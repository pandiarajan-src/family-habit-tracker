// My habits, the Habit editor and My PIN (REQ-005, REQ-008–010): who the habits belong to,
// how a habit is described, and the checks the browser makes before anything is sent.
import type { Frequency, HabitRead, MemberRead } from '../api/types'
import { copy } from '../copy'
import { bestStreak, streakText } from './board'
import { formatShortDay } from './dates'

/** A member can have up to 20 active habits (REQ-008, C7). */
export const MAX_ACTIVE_HABITS = 20
export const TITLE_MAX = 40
export const GOAL_MAX = 60
export const TARGETS = [1, 2, 3, 4, 5, 6, 7] as const

/**
 * Whose habits a screen shows. A parent can open a child's with `?member=<id>` (C15, REQ-010);
 * any other id (themselves, the other parent, a stranger) falls back to their own.
 */
export interface HabitOwner {
  member: MemberRead
  /** True while a parent works on a child's habits: the banner shows (C15). */
  parentMode: boolean
}

export function habitOwner(
  me: MemberRead,
  members: MemberRead[],
  requestedId: string | null,
): HabitOwner {
  const requested = members.find((m) => m.id === requestedId)
  if (me.role === 'parent' && requested?.role === 'child') {
    return { member: requested, parentMode: true }
  }
  return { member: members.find((m) => m.id === me.id) ?? me, parentMode: false }
}

/** "?member=<id>" in parent mode, so links keep working on the child's habits. */
export function ownerQuery(owner: HabitOwner): string {
  return owner.parentMode ? `?member=${owner.member.id}` : ''
}

/** "Every day", "Once a week", "3 times a week". */
export function frequencyText(habit: Pick<HabitRead, 'frequency' | 'weekly_target'>): string {
  if (habit.frequency === 'daily' || habit.weekly_target === null) return copy.habits.everyDay
  return copy.habits.perWeek(habit.weekly_target)
}

/** "20 minutes · Every day"; archived: "Archived on Mon 13 Jul · best streak 14 days". */
export function habitMeta(habit: HabitRead): string {
  if (habit.archived) {
    const parts = [copy.habits.bestStreak(streakText(bestStreak(habit)))]
    if (habit.archived_on) parts.unshift(copy.habits.archivedOn(formatShortDay(habit.archived_on)))
    return parts.join(' · ')
  }
  return [habit.goal_note, frequencyText(habit)].filter(Boolean).join(' · ')
}

export interface HabitForm {
  title: string
  goalNote: string
  frequency: Frequency
  target: number
}

export function emptyForm(): HabitForm {
  return { title: '', goalNote: '', frequency: 'daily', target: 3 }
}

export function formFromHabit(habit: HabitRead): HabitForm {
  return {
    title: habit.title,
    goalNote: habit.goal_note ?? '',
    frequency: habit.frequency,
    target: habit.weekly_target ?? 3,
  }
}

/** Length in characters as the server counts them (code points), not UTF-16 units. */
const length = (text: string) => [...text].length

/**
 * The same limits as the server's HabitCreate (title 1–40 and goal note ≤ 60 after trimming,
 * target 1–7). Once these pass, the only 422 left for a new habit is the 20-habit limit.
 */
export function habitFormError(form: HabitForm): FormError<'title' | 'goalNote'> | null {
  const title = form.title.trim()
  if (title === '') return { field: 'title', message: copy.editor.titleEmpty }
  if (length(title) > TITLE_MAX) return { field: 'title', message: copy.editor.titleHint }
  if (length(form.goalNote.trim()) > GOAL_MAX) {
    return { field: 'goalNote', message: copy.editor.goalHint }
  }
  return null
}

export interface FormError<Field extends string> {
  field: Field
  message: string
}

/** The goal note to send: trimmed, or null to leave it out (or clear it). */
export function goalNoteValue(form: HabitForm): string | null {
  return form.goalNote.trim() || null
}

export interface PinForm {
  current: string
  next: string
  again: string
}

export type PinField = keyof PinForm
export type PinFormError = FormError<PinField>

const isPin = (value: string) => /^[0-9]{4}$/.test(value)

/**
 * My PIN's browser checks (REQ-005): both PINs are 4 numbers, and the confirmation matches.
 * The confirmation never reaches the server, so a mismatch sends nothing.
 */
export function pinFormError(form: PinForm): PinFormError | null {
  if (!isPin(form.current)) return { field: 'current', message: copy.myPin.currentFormat }
  if (!isPin(form.next)) return { field: 'next', message: copy.myPin.nextFormat }
  if (form.again !== form.next) return { field: 'again', message: copy.myPin.mismatch }
  return null
}
