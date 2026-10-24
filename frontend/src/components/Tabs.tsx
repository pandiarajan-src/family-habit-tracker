import { Link, useLocation } from 'react-router'
import { Icon, type IconName } from './Icon'
import styles from './Tabs.module.css'

export interface TabItem {
  to: string
  label: string
  icon: IconName
  /** Other screens that belong to this tab, e.g. My PIN under My habits. */
  also?: string[]
}

const within = (pathname: string, base: string) =>
  pathname === base || pathname.startsWith(`${base}/`)

/** Main navigation; the current tab gets `aria-current="page"`. */
export function Tabs({ label, items }: { label: string; items: TabItem[] }) {
  const { pathname } = useLocation()
  return (
    <nav className={styles.tabs} aria-label={label}>
      {items.map((item) => {
        const active = [item.to, ...(item.also ?? [])].some((base) => within(pathname, base))
        return (
          <Link
            key={item.to}
            to={item.to}
            className={`${styles.tab} ${active ? styles.active : ''}`}
            aria-current={active ? 'page' : undefined}
          >
            <Icon name={item.icon} />
            <span>{item.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
