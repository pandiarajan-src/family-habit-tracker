import { NavLink, Outlet } from 'react-router'
import { copy } from '../../copy'
import styles from './ParentTabs.module.css'

const SECTIONS = [
  { to: '/parent/approvals', label: copy.parent.approvals },
  { to: '/parent/settings', label: copy.parent.settings },
]

/** The Parent tab: "Approvals & prizes | Family settings" (spec §5, C15). */
export function ParentTabs() {
  return (
    <>
      <div className={styles.wrap}>
        <nav className={styles.sections} aria-label={copy.parent.sections}>
          {SECTIONS.map((section) => (
            <NavLink
              key={section.to}
              to={section.to}
              className={({ isActive }) => `${styles.section} ${isActive ? styles.active : ''}`}
            >
              {section.label}
            </NavLink>
          ))}
        </nav>
      </div>
      <Outlet />
    </>
  )
}
