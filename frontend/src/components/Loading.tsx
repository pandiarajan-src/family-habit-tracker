import { copy } from '../copy'
import styles from './Loading.module.css'

/** Shown while the session or a screen's first data load is in flight. */
export function Loading() {
  return (
    <p className={styles.loading} role="status">
      {copy.loading}
    </p>
  )
}
