import { useState } from 'react'
import { copy } from '../copy'
import { HISTORY_PAGE, type HistoryLine } from '../lib/gems'
import { Button } from './Button'
import styles from './GemHistory.module.css'

/** Gems earned and spent, newest first, a page at a time (REQ-018, 019, 021). */
export function GemHistory({ lines }: { lines: HistoryLine[] }) {
  const [shown, setShown] = useState(HISTORY_PAGE)
  if (lines.length === 0) return <p className={styles.empty}>{copy.gemsPrizes.noHistory}</p>
  const text = copy.gemsPrizes
  return (
    <>
      <ul className={styles.list}>
        {lines.slice(0, shown).map((line) => {
          const gained = line.amount >= 0
          const size = Math.abs(line.amount)
          return (
            <li key={line.key} className={styles.line}>
              <span className={`${styles.amount} ${gained ? styles.gain : styles.loss}`}>
                <span aria-hidden="true">{gained ? text.gained(size) : text.lost(size)}</span>
                <span className="sr-only">
                  {gained ? text.gainedFull(size) : text.lostFull(size)}
                </span>
              </span>
              <span className={styles.words}>
                <span className={styles.label}>{line.label}</span>
                <span className={styles.when}>{line.when}</span>
              </span>
            </li>
          )
        })}
      </ul>
      {shown < lines.length && (
        <Button
          variant="quiet"
          icon="clock"
          className={styles.more}
          onClick={() => setShown((n) => n + HISTORY_PAGE)}
        >
          {text.showOlder}
        </Button>
      )}
    </>
  )
}
