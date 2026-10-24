import type { CheckInRead, HabitRead, MemberRead, StreakSaverRead } from '../../api/types'
import { DayChip, type DayCorrection } from '../../components/DayChip'
import { WeekStateBadge } from '../../components/WeekStateBadge'
import { copy } from '../../copy'
import { formatShortDay } from '../../lib/dates'
import { habitHistory, habitWeekState } from '../../lib/dayStates'
import {
  cellLabel,
  correctable,
  dayCell,
  daysOf,
  habitsInPeriod,
  periodLabel,
  tally,
  type DayCell,
  type Period,
} from '../../lib/history'
import styles from './History.module.css'

interface WeekViewProps {
  members: readonly MemberRead[]
  habits: readonly HabitRead[]
  checkIns: readonly CheckInRead[]
  savers: readonly StreakSaverRead[]
  period: Period
  today: string
  /** Set for a parent: their children's days become buttons (REQ-014). */
  correction?: WeekCorrection
}

export interface WeekCorrection {
  /** Whose days this parent may correct: children only (REQ-014, REQ-028). */
  canCorrect: (member: MemberRead) => boolean
  busy: boolean
  /** `done` is the day's state now, so the toggle takes the check-in off when it's true. */
  onToggle: (habit: HabitRead, day: string, done: boolean) => void
}

function chipCorrection(
  correction: WeekCorrection | undefined,
  member: MemberRead,
  habit: HabitRead,
  day: string,
  cell: DayCell,
): DayCorrection | undefined {
  if (!correction?.canCorrect(member) || !correctable(habit, cell)) return undefined
  const done = cell.kind === 'state' && cell.state === 'done'
  const describe = done ? copy.correction.remove : copy.correction.add
  return {
    name: describe(formatShortDay(day), cellLabel(cell), habit.title),
    busy: correction.busy,
    onToggle: () => correction.onToggle(habit, day, done),
  }
}

/**
 * One card per member: each habit against Monday–Sunday with a text-labelled state per day,
 * and one week state for weekly habits (REQ-023, C13). From 640px of card width it's a
 * habit × day grid; narrower, each habit stacks its name above 7 wrapping chips (C12).
 */
export function WeekView({
  members,
  habits,
  checkIns,
  savers,
  period,
  today,
  correction,
}: WeekViewProps) {
  const days = daysOf(period)
  const label = periodLabel(period, today)
  return (
    <div className={styles.cards}>
      {members.map((member) => {
        const rows = habitsInPeriod(
          habits.filter((h) => h.member_id === member.id),
          period,
        ).map((habit) => ({ habit, history: habitHistory(habit, checkIns, savers) }))
        const total = tally(rows, days, today)
        const id = `week-${member.id}`
        return (
          <section key={member.id} className={styles.card} aria-labelledby={id}>
            <div className={styles.cardHead}>
              <h3 id={id} className={styles.member}>
                <span aria-hidden="true">{member.avatar_emoji}</span> {member.nickname}
              </h3>
              {rows.length > 0 && (
                <p className={styles.total}>{copy.history.doneOf(total.done, total.total)}</p>
              )}
            </div>
            {rows.length === 0 ? (
              <p className={styles.empty}>{copy.history.noHabits(member.nickname)}</p>
            ) : (
              <div className={styles.week}>
                <div className={styles.weekHead} aria-hidden="true">
                  <span>{copy.history.habit}</span>
                  <span className={styles.dayNames}>
                    {days.map((day) => (
                      <span key={day}>{formatShortDay(day).slice(0, 3)}</span>
                    ))}
                  </span>
                </div>
                {rows.map(({ habit, history }) => {
                  const state =
                    habit.frequency === 'weekly'
                      ? habitWeekState(habit, history, period.start, today)
                      : null
                  return (
                    <div key={habit.id} className={styles.habitRow}>
                      <div className={styles.habitName}>
                        <p className={styles.habitTitle}>
                          {habit.title}
                          {habit.archived && ' '}
                          {habit.archived && (
                            <span className={styles.archived}>· {copy.history.archived}</span>
                          )}
                        </p>
                        {state && <WeekStateBadge state={state} />}
                      </div>
                      <ul
                        className={styles.chips}
                        aria-label={copy.history.habitDays(habit.title, label)}
                      >
                        {days.map((day) => {
                          const cell = dayCell(habit, history, day, today)
                          return (
                            <DayChip
                              key={day}
                              day={day}
                              cell={cell}
                              correction={chipCorrection(correction, member, habit, day, cell)}
                            />
                          )
                        })}
                      </ul>
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}
