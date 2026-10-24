import type { HabitRead } from '../api/types'
import { copy } from '../copy'
import { formatShortDay, mondayOf } from '../lib/dates'
import { habitWeekState, type HabitHistory } from '../lib/dayStates'
import {
  calendarWeeks,
  cellLabel,
  cellTone,
  dayCell,
  type Period,
  type Tally,
} from '../lib/history'
import { CellIcon } from './DayChip'
import styles from './MonthCalendar.module.css'
import { WeekStateBadge } from './WeekStateBadge'

const WEEKDAYS = [
  ['M', 'Monday'],
  ['T', 'Tuesday'],
  ['W', 'Wednesday'],
  ['T', 'Thursday'],
  ['F', 'Friday'],
  ['S', 'Saturday'],
  ['S', 'Sunday'],
] as const

/**
 * One habit's month: a Monday-first calendar with each day's state ("19 ✓"), its name read out
 * in full ("Mon 19 Oct: Done"). Weekly habits add a Week column with the week's state (C13).
 */
export function MonthCalendar({
  title,
  habit,
  history,
  period,
  today,
  tally,
}: {
  title: string
  habit: HabitRead
  history: HabitHistory
  period: Period
  today: string
  tally: Tally
}) {
  const weekly = habit.frequency === 'weekly'
  const id = `month-${habit.id}`
  return (
    <section className={styles.card} aria-labelledby={id}>
      <div className={styles.head}>
        <h3 id={id} className={styles.title}>
          {title}
          {habit.archived && ' '}
          {habit.archived && <span className={styles.archived}>· {copy.history.archived}</span>}
        </h3>
        <p className={styles.tally}>{copy.history.daysOf(tally.done, tally.total)}</p>
      </div>
      <table className={`${styles.table} ${weekly ? styles.weekly : ''}`} aria-labelledby={id}>
        <thead>
          <tr>
            {WEEKDAYS.map(([letter, name], i) => (
              <th key={i} scope="col" abbr={name}>
                {letter}
              </th>
            ))}
            {weekly && <th scope="col">{copy.history.weekColumn}</th>}
          </tr>
        </thead>
        <tbody>
          {calendarWeeks(period).map((week) => {
            const monday = mondayOf(week.find((day) => day !== null) ?? period.start)
            const state = weekly ? habitWeekState(habit, history, monday, today) : null
            return (
              <tr key={monday}>
                {week.map((day, i) => {
                  if (day === null) return <td key={i} />
                  const cell = dayCell(habit, history, day, today)
                  return (
                    <td key={day}>
                      <span className={`${styles.cell} ${styles[cellTone(cell)]}`}>
                        <span aria-hidden="true">{Number(day.slice(8))}</span>
                        <CellIcon cell={cell} size={12} />
                        <span className="sr-only">
                          {formatShortDay(day)}: {cellLabel(cell)}
                        </span>
                      </span>
                    </td>
                  )
                })}
                {weekly && <td>{state && <WeekStateBadge state={state} />}</td>}
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}
