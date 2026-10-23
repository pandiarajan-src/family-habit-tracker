import { copy } from '../copy'
import type { WeekState } from '../lib/dayStates'
import { Icon } from './Icon'
import styles from './WeekStateBadge.module.css'

/** A weekly habit's one state for its week: "Week complete — 3 of 3", "Week saved" (C13, C19). */
export function WeekStateBadge({ state }: { state: WeekState }) {
  return (
    <span className={`${styles.badge} ${styles[state.kind]}`}>
      {state.kind === 'complete' && <Icon name="check" size={14} strokeWidth={3} />}
      {state.kind === 'saved' && <Icon name="star" size={14} strokeWidth={3} />}
      {copy.history.weekStates[state.kind](state.done, state.target)}
    </span>
  )
}
