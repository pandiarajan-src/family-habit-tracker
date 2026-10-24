import { copy } from '../copy'
import styles from './BalanceCard.module.css'
import { GemIcon } from './Icon'
import { Panel } from './Panel'

/** Available gems, with gems held by pending claims shown apart (REQ-021). */
export function BalanceCard({ balance, held }: { balance: number; held: number }) {
  return (
    <Panel title={copy.gemsPrizes.balanceTitle} tone="sun">
      <p className={styles.balance}>
        <GemIcon size={28} />
        <span>{copy.gems.count(balance)}</span>
      </p>
      {held > 0 && <p className={styles.held}>{copy.gemsPrizes.held(held)}</p>}
      <p className={styles.text}>{copy.gemsPrizes.balanceText}</p>
    </Panel>
  )
}
