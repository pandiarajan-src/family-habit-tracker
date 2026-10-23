import { copy } from '../copy'
import styles from './Badges.module.css'
import { FlameIcon, GemIcon } from './Icon'

/** Flame + streak text ("🔥 12 days"); grey when the streak is 0. */
export function StreakBadge({
  text,
  cold = false,
  prefix,
}: {
  text: string
  cold?: boolean
  prefix?: string
}) {
  return (
    <span className={`${styles.streak} ${cold ? styles.cold : ''}`}>
      <FlameIcon />
      <span>
        {prefix && <span className={styles.prefix}>{prefix} </span>}
        {text}
      </span>
    </span>
  )
}

/** Gem + count ("24 gems", or "Balance 24 gems" with a prefix). */
export function GemBadge({ count, prefix }: { count: number; prefix?: string }) {
  return (
    <span className={styles.gems}>
      <GemIcon />
      <span>
        {prefix && <span className={styles.prefix}>{prefix} </span>}
        {copy.gems.count(count)}
      </span>
    </span>
  )
}
