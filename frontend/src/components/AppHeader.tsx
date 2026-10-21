import type { ReactNode } from 'react'
import { copy } from '../copy'
import styles from './AppHeader.module.css'
import { BrandMark } from './Icon'

/** The bar at the top of every signed-in screen: app name on the left, `children` on the right. */
export function AppHeader({ children, below }: { children?: ReactNode; below?: ReactNode }) {
  return (
    <header className={styles.header}>
      <div className={styles.bar}>
        <div className={styles.brand}>
          <BrandMark />
          <span className={styles.name}>{copy.appTitle}</span>
        </div>
        {children && <div className={styles.end}>{children}</div>}
      </div>
      {below && <div className={styles.below}>{below}</div>}
    </header>
  )
}
