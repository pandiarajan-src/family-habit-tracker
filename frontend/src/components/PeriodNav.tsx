import { copy } from '../copy'
import {
  canGoBack,
  canGoForward,
  monthOptions,
  periodLabel,
  periodOf,
  selectedMonth,
  shiftPeriod,
  type Period,
} from '../lib/history'
import { Button } from './Button'
import styles from './PeriodNav.module.css'

/** Previous / next week or month and "Jump to month", within the 12 months History keeps. */
export function PeriodNav({
  period,
  today,
  onChange,
}: {
  period: Period
  today: string
  onChange: (period: Period) => void
}) {
  const week = period.view === 'week'
  return (
    <div className={styles.nav}>
      <div className={styles.steps}>
        <Button
          icon="previous"
          disabled={!canGoBack(period, today)}
          onClick={() => onChange(shiftPeriod(period, -1))}
        >
          {week ? copy.history.previousWeek : copy.history.previousMonth}
        </Button>
        <h2 className={styles.label} aria-live="polite">
          {periodLabel(period, today)}
        </h2>
        <Button
          icon="next"
          disabled={!canGoForward(period, today)}
          onClick={() => onChange(shiftPeriod(period, 1))}
        >
          {week ? copy.history.nextWeek : copy.history.nextMonth}
        </Button>
      </div>
      <label className={styles.jump}>
        <span className={styles.jumpLabel}>{copy.history.jumpToMonth}</span>
        <select
          className={styles.select}
          value={selectedMonth(period, today)}
          onChange={(event) => onChange(periodOf(period.view, event.target.value))}
        >
          {monthOptions(today).map((month) => (
            <option key={month.value} value={month.value}>
              {month.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}
