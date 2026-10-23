import { copy } from '../copy'
import type { DayView } from '../lib/myDay'
import styles from './DayToggle.module.css'

const OPTIONS: { id: DayView; label: string }[] = [
  { id: 'today', label: copy.myDay.today },
  { id: 'yesterday', label: copy.myDay.yesterday },
]

/** "Today / Yesterday" on My day (REQ-013): two pressed-state buttons in a labelled group. */
export function DayToggle({
  value,
  onChange,
}: {
  value: DayView
  onChange: (view: DayView) => void
}) {
  return (
    <div className={styles.toggle} role="group" aria-label={copy.myDay.whichDay}>
      {OPTIONS.map((option) => (
        <button
          key={option.id}
          type="button"
          className={`${styles.option} ${option.id === value ? styles.on : ''}`}
          aria-pressed={option.id === value}
          onClick={() => onChange(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
