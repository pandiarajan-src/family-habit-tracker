import { formatShortDay } from '../lib/dates'
import { cellLabel, cellTone, type DayCell } from '../lib/history'
import styles from './DayChip.module.css'
import { Icon } from './Icon'

/** ✓ for Done, ★ for Saved, nothing otherwise; always beside text [family-ux #4]. */
export function CellIcon({ cell, size = 14 }: { cell: DayCell; size?: number }) {
  if (cell.kind !== 'state' || cell.state === 'not_yet') return null
  return <Icon name={cell.state === 'done' ? 'check' : 'star'} size={size} strokeWidth={3} />
}

/**
 * One day of a habit in the week view: "M ✓ Done". The day letter shows when chips wrap under
 * the habit name (360px); in the wider grid the column header says the day instead (C12).
 */
export function DayChip({ day, cell }: { day: string; cell: DayCell }) {
  const name = formatShortDay(day)
  return (
    <li className={`${styles.chip} ${styles[cellTone(cell)]}`}>
      <span className={styles.letter} aria-hidden="true">
        {name.charAt(0)}
      </span>
      <span className="sr-only">{name}: </span>
      <span className={styles.state}>
        <CellIcon cell={cell} />
        {cellLabel(cell)}
      </span>
    </li>
  )
}
