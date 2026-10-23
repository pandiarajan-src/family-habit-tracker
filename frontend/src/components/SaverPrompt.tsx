import type { HabitRead, SaveablePeriodRead } from '../api/types'
import { copy } from '../copy'
import { formatShortDay } from '../lib/dates'
import { periodLabel } from '../lib/myDay'
import { Button } from './Button'
import styles from './SaverPrompt.module.css'

interface SaverPromptProps {
  habit: HabitRead
  period: SaveablePeriodRead
  balance: number
  /** The server said 409: not enough gems, whatever the balance on screen says. */
  short: boolean
  busy: boolean
  onUse: () => void
  onSkip: () => void
}

/**
 * "Save your streak for 2 gems?" (REQ-020). When the balance is below the cost it says how
 * many gems are needed, kindly [family-ux #6]; the server still has the last word (409).
 */
export function SaverPrompt({
  habit,
  period,
  balance,
  short,
  busy,
  onUse,
  onSkip,
}: SaverPromptProps) {
  const label = periodLabel(habit, period.period_start)
  const day = formatShortDay(period.period_start)
  const tooFew = short || balance < period.cost
  return (
    <div className={styles.prompt}>
      <p className={styles.title}>{copy.saver.title(period.cost)}</p>
      <p className={styles.text}>
        {habit.frequency === 'weekly'
          ? copy.saver.restWeek(habit.title, day)
          : copy.saver.restDay(habit.title, day)}
      </p>
      {tooFew && (
        <p className={styles.short} role="status">
          {copy.saver.short(period.cost, balance)}
        </p>
      )}
      <div className={styles.actions}>
        <Button variant="sun" icon="sparkle" onClick={onUse} aria-disabled={busy || undefined}>
          {copy.saver.use} <span className="sr-only">{copy.saver.useFor(habit.title, label)}</span>
        </Button>
        <Button variant="quiet" onClick={onSkip}>
          {copy.saver.notNow}{' '}
          <span className="sr-only">{copy.saver.notNowFor(habit.title, label)}</span>
        </Button>
      </div>
    </div>
  )
}
