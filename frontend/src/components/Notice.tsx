import type { ReactNode } from 'react'
import { Icon, type IconName } from './Icon'
import styles from './Notice.module.css'

interface NoticeProps {
  tone?: 'info' | 'caution' | 'sun'
  icon?: IconName
  title?: string
  children?: ReactNode
  actions?: ReactNode
}

/** A friendly message box, announced politely to screen readers. */
export function Notice({ tone = 'info', icon = 'info', title, children, actions }: NoticeProps) {
  return (
    <div className={`${styles.notice} ${styles[tone]}`} role="status">
      <span className={styles.icon}>
        <Icon name={icon} size={22} />
      </span>
      <div className={styles.body}>
        {title && <p className={styles.title}>{title}</p>}
        {children && <p className={styles.text}>{children}</p>}
      </div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </div>
  )
}
