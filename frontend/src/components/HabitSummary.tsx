import type { HabitRead } from '../api/types'
import { copy } from '../copy'
import { bestStreak, currentStreak, isDoneToday, streakText } from '../lib/board'
import { StreakBadge } from './Badges'
import styles from './HabitSummary.module.css'
import { Icon } from './Icon'

/**
 * A read-only habit card for the board's member panel: today's status, current and best
 * streak (REQ-022). It has no controls, so nobody can change another member's habit here.
 */
export function HabitSummary({ habit }: { habit: HabitRead }) {
  const done = isDoneToday(habit)
  const current = currentStreak(habit)
  return (
    <article className={`${styles.habit} ${done ? styles.done : ''}`} aria-label={habit.title}>
      <div className={styles.body}>
        <h3 className={styles.title}>{habit.title}</h3>
        {habit.goal_note && <p className={styles.meta}>{habit.goal_note}</p>}
        <div className={styles.foot}>
          <StreakBadge text={streakText(current)} cold={current.length === 0} />
          {habit.week_progress && (
            <span className={styles.week}>
              {copy.habit.thisWeek(habit.week_progress.done, habit.week_progress.target)}
            </span>
          )}
          <span className={styles.best}>{copy.habit.best(streakText(bestStreak(habit)))}</span>
        </div>
      </div>
      <p className={`${styles.status} ${done ? styles.statusDone : ''}`}>
        {done && <Icon name="check" size={20} />}
        {done ? copy.habit.done : copy.habit.notYet}
      </p>
    </article>
  )
}
