import { copy } from '../copy'
import type { ChangeLine } from '../lib/myDay'
import styles from './ChangesList.module.css'

/** Every change a parent made for this member in the last 12 months, newest first (REQ-015). */
export function ChangesList({ lines }: { lines: ChangeLine[] }) {
  const text = copy.gemsPrizes
  return (
    <>
      <p className={styles.lead}>{text.changesLead}</p>
      {lines.length === 0 ? (
        <p className={styles.empty}>{text.noChanges}</p>
      ) : (
        <ul className={styles.list}>
          {lines.map((line) => (
            <li key={line.id} className={styles.change}>
              <span className={styles.avatar} aria-hidden="true">
                {line.actorEmoji ?? '•'}
              </span>
              <span className={styles.words}>
                <span className={styles.title}>{line.title}</span>
                <span className={styles.meta}>{text.changeMeta(line.text, line.madeOn)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
