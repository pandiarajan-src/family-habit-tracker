import { copy } from '../copy'
import { streakText, type Streak } from '../lib/board'
import type { DaySummary as Summary, DayView } from '../lib/myDay'
import { GemBadge, StreakBadge } from './Badges'
import styles from './DaySummary.module.css'
import { ProgressRing } from './ProgressRing'

interface DaySummaryProps {
  summary: Summary
  view: DayView
  balance: number
  longest: Streak | null
}

/** My day's "My progress" panel: done so far, a cheer, the gem balance and longest streak. */
export function DaySummary({ summary, view, balance, longest }: DaySummaryProps) {
  const percent = summary.total > 0 ? Math.round((summary.done / summary.total) * 100) : 0
  return (
    <aside className={styles.panel} aria-label={copy.myDay.progress}>
      <div className={styles.top}>
        <span className={styles.ring}>
          <ProgressRing done={summary.done} due={summary.total} size={88} stroke={10} />
          <span className={styles.percent} aria-hidden="true">
            {percent}%
          </span>
        </span>
        <div className={styles.words}>
          <p className={styles.done}>{copy.myDay.doneOn(summary.done, summary.total, view)}</p>
          <p className={styles.cheer}>{summary.cheer}</p>
        </div>
      </div>
      <div className={styles.badges}>
        <GemBadge count={balance} prefix={copy.myDay.balance} />
        {longest && (
          <StreakBadge
            text={streakText(longest)}
            cold={longest.length === 0}
            prefix={copy.myDay.longest}
          />
        )}
      </div>
      <p className={styles.rules}>{copy.myDay.gemRules}</p>
    </aside>
  )
}
