import { copy } from '../copy'
import type { ClaimLine } from '../lib/gems'
import { Button } from './Button'
import styles from './ClaimList.module.css'

interface ClaimListProps {
  lines: ClaimLine[]
  busy: boolean
  onCancel: (line: ClaimLine) => void
}

/** My claims with their status, newest first; a pending one can be cancelled (REQ-025, 026). */
export function ClaimList({ lines, busy, onCancel }: ClaimListProps) {
  if (lines.length === 0) return <p className={styles.empty}>{copy.gemsPrizes.noClaims}</p>
  return (
    <ul className={styles.list}>
      {lines.map((line) => (
        <li key={line.claim.id} className={styles.claim}>
          <h3 className={styles.title}>{line.title}</h3>
          <p className={styles.status}>{line.status}</p>
          {line.canCancel && (
            <Button
              size="sm"
              className={styles.cancel}
              disabled={busy}
              onClick={() => onCancel(line)}
            >
              {copy.gemsPrizes.cancel}{' '}
              <span className="sr-only">{copy.gemsPrizes.cancelFor(line.claim.prize_title)}</span>
            </Button>
          )}
        </li>
      ))}
    </ul>
  )
}
