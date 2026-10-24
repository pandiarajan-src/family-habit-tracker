import { useId, type ReactNode, type Ref } from 'react'
import styles from './Panel.module.css'

interface PanelProps {
  title: string
  tone?: 'raised' | 'sun'
  /** Lets a screen move focus to the heading after an action removes the focused button. */
  headingRef?: Ref<HTMLHeadingElement>
  children: ReactNode
}

/** A titled card section; the region is named by its heading. */
export function Panel({ title, tone = 'raised', headingRef, children }: PanelProps) {
  const id = useId()
  return (
    <section className={`${styles.panel} ${styles[tone]}`} aria-labelledby={id}>
      <h2 id={id} className={styles.title} ref={headingRef} tabIndex={headingRef ? -1 : undefined}>
        {title}
      </h2>
      {children}
    </section>
  )
}
