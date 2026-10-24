// 24px line icons from the design system (currentColor). Always decorative: every icon sits
// next to a visible text label [family-ux #4], so they are hidden from screen readers.
import styles from './Icon.module.css'

const PATHS = {
  check: 'M5 12.5l4.5 4.5L19 7.5',
  next: 'M9 5l7 7-7 7',
  lock: 'M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5z',
  home: 'M4 11l8-7 8 7v9h-5v-6H9v6H4z',
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  list: 'M9 6h11M9 12h11M9 18h11M4 6h1M4 12h1M4 18h1',
  gift: 'M4 10h16v10H4zM3 7h18v3H3zM12 7v13M12 7c-2-4-6-3-5 0M12 7c2-4 6-3 5 0',
  shield: 'M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z',
  swap: 'M7 7h12l-3-3M17 17H5l3 3',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13 7l4 4',
  info: 'M12 8h.01M11 12h1v5h1M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
  star: 'M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z',
  previous: 'M15 5l-7 7 7 7',
  plus: 'M12 5v14M5 12h14',
  archive: 'M3 5h18v4H3zM5 9v10h14V9M10 13h4',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  key: 'M7.5 20a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zM10.7 12.3L20 3M16.5 6.5l3 3M14 9l2 2',
  people:
    'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21v-1a6 6 0 0 1 12 0v1M16 3.5a4 4 0 0 1 0 7.5M18 14.5a6 6 0 0 1 4 5.5v1',
  sparkle: 'M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6',
  signOut: 'M14 4H5v16h9M10 12h10M17 9l3 3-3 3',
} as const

export type IconName = keyof typeof PATHS

interface IconProps {
  name: IconName
  size?: number
  strokeWidth?: number
  className?: string
}

export function Icon({ name, size = 24, strokeWidth = 2, className }: IconProps) {
  return (
    <svg
      className={[styles.icon, className].filter(Boolean).join(' ')}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  )
}

export function FlameIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      className={styles.flame}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="currentColor"
        d="M12 2.5c.6 3.2-1.4 4.9-3 6.7C7.4 11 6 12.8 6 15.2A6 6 0 0 0 12 21.5a6 6 0 0 0 6-6.3c0-2.7-1.5-4.6-2.6-5.8-.2 1.6-.9 2.7-2 3.2.4-3.6-.4-7.1-1.4-9.1z"
      />
    </svg>
  )
}

export function GemIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      className={styles.gem}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
    >
      <path fill="currentColor" d="M7 3h10l4 6-9 12L3 9z" />
      <path
        className={styles.gemFacets}
        fill="none"
        strokeWidth="1.5"
        strokeLinejoin="round"
        d="M3 9h18M9 3l3 6 3-6M12 9v12"
      />
    </svg>
  )
}

/** The three-bar mark beside the app name. */
export function BrandMark() {
  return (
    <span className={styles.brand} aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
  )
}
