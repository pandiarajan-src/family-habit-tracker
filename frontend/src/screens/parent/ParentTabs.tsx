import { NavLink, Outlet } from 'react-router'
import { copy } from '../../copy'
import styles from './ParentTabs.module.css'

const SECTIONS = [
  { to: '/parent/approvals', label: copy.parent.approvals },
  { to: '/parent/settings', label: copy.parent.settings },
]

/**
 * The Parent tab (parents only, REQ-028): the page with its "Parent" heading and the switch
 * between "Approvals & prizes" and "Family settings" (spec §5, C15). The section is the Outlet.
 */
export function ParentTabs() {
  return (
    <main className="page">
      <div className={styles.head}>
        <h1 className="page-title">{copy.parent.title}</h1>
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
    </main>
  )
}
