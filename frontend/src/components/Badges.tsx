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

/** Gem + count ("24 gems"). */
export function GemBadge({ count }: { count: number }) {
  return (
    <span className={styles.gems}>
      <GemIcon />
      <span>{copy.gems.count(count)}</span>
    </span>
  )
}
