import type { ReactNode } from 'react'
import { copy } from '../copy'
import { bestStreak, currentStreak, streakText } from '../lib/board'
import type { HabitDay } from '../lib/myDay'
import { StreakBadge } from './Badges'
import styles from './HabitRow.module.css'
import { Icon } from './Icon'

interface HabitRowProps {
  item: HabitDay
  /** A check-in or undo for this habit is in flight. */
  busy: boolean
  onToggle: () => void
  /** The saver prompt or its result, shown above the button. */
  children?: ReactNode
}

/**
 * One habit on My day: title, goal note, current and best streak, weekly progress, and the
 * one-tap "Check off <title>" / "Done — Undo <title>" button (REQ-011, 016, 017).
 * While a request is in flight the button is aria-disabled, not disabled, so keyboard focus
 * (and its ring) stays on it [family-ux #1].
 */
export function HabitRow({ item, busy, onToggle, children }: HabitRowProps) {
  const { habit, done, saved, hint, showWeek } = item
  const current = currentStreak(habit)
  const week = habit.week_progress

  let label: ReactNode = (
    <>
      <span className={styles.circle} aria-hidden="true" />
      <span>{copy.myDay.checkOff}</span>
    </>
  )
  if (done)
    label = (
      <>
        <Icon name="check" size={22} strokeWidth={3} />
        <span>{copy.myDay.doneUndo}</span>
      </>
    )
  else if (saved) label = <span>{copy.myDay.saved}</span>

  return (
    <article className={`${styles.habit} ${done ? styles.done : ''}`} aria-label={habit.title}>
      <div className={styles.body}>
        <h3 className={styles.title}>{habit.title}</h3>
        {habit.goal_note && <p className={styles.meta}>{habit.goal_note}</p>}
        <div className={styles.foot}>
          <StreakBadge text={streakText(current)} cold={current.length === 0} />
          {showWeek && week && (
            <span className={styles.week}>{copy.habit.thisWeek(week.done, week.target)}</span>
          )}
          <span className={styles.best}>{copy.habit.best(streakText(bestStreak(habit)))}</span>
        </div>
      </div>
      {hint && <p className={styles.hint}>{hint}</p>}
      {children && <div className={styles.extra}>{children}</div>}
      <button
        type="button"
        className={`${styles.check} ${done ? styles.checkDone : ''}`}
        onClick={() => {
          if (!busy) onToggle()
        }}
        aria-disabled={busy || undefined}
        disabled={saved}
      >
        {label} <span className="sr-only">{habit.title}</span>
      </button>
    </article>
  )
}
