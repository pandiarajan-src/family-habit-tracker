import { NavLink } from 'react-router'
import { Icon, type IconName } from './Icon'
import styles from './Tabs.module.css'

export interface TabItem {
  to: string
  label: string
  icon: IconName
}

/** Main navigation; the current tab gets `aria-current="page"` from NavLink. */
export function Tabs({ label, items }: { label: string; items: TabItem[] }) {
  return (
    <nav className={styles.tabs} aria-label={label}>
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) => `${styles.tab} ${isActive ? styles.active : ''}`}
        >
          <Icon name={item.icon} />
          <span>{item.label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
