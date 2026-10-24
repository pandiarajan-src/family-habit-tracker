import { formatShortDay } from '../lib/dates'
import { cellLabel, cellTone, type DayCell } from '../lib/history'
import styles from './DayChip.module.css'
import { Icon } from './Icon'

/** ✓ for Done, ★ for Saved, nothing otherwise; always beside text [family-ux #4]. */
export function CellIcon({ cell, size = 14 }: { cell: DayCell; size?: number }) {
  if (cell.kind !== 'state' || cell.state === 'not_yet') return null
  return <Icon name={cell.state === 'done' ? 'check' : 'star'} size={size} strokeWidth={3} />
}

export interface DayCorrection {
  /** The button's accessible name, e.g. "Mon 19 Oct: Not yet — add a check-in for Reading". */
  name: string
  /** While a correction is saving, taps are ignored but focus stays put. */
  busy: boolean
  onToggle: () => void
}

/**
 * One day of a habit in the week view: "M ✓ Done". The day letter shows when chips wrap under
 * the habit name (360px); in the wider grid the column header says the day instead (C12).
 * With `correction` (a parent looking at a child's habit, REQ-014) the chip is a button that
 * adds or takes off that day's check-in.
 */
export function DayChip({
  day,
  cell,
  correction,
}: {
  day: string
  cell: DayCell
  correction?: DayCorrection
}) {
  const name = formatShortDay(day)
  const content = (
    <>
      <span className={styles.letter} aria-hidden="true">
        {name.charAt(0)}
      </span>
      <span className="sr-only">{name}: </span>
      <span className={styles.state}>
        <CellIcon cell={cell} />
        {cellLabel(cell)}
      </span>
    </>
  )
  if (!correction) {
    return <li className={`${styles.chip} ${styles[cellTone(cell)]}`}>{content}</li>
  }
  return (
    <li className={styles.item}>
      <button
        type="button"
        className={`${styles.chip} ${styles.toggle} ${styles[cellTone(cell)]}`}
        aria-label={correction.name}
        aria-disabled={correction.busy || undefined}
        onClick={() => {
          if (!correction.busy) correction.onToggle()
        }}
      >
        {content}
      </button>
    </li>
  )
}
