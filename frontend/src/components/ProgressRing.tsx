import styles from './ProgressRing.module.css'

interface ProgressRingProps {
  done: number
  due: number
  size?: number
  stroke?: number
}

/**
 * Today's progress as a ring, beside the same numbers in text (so hidden from screen readers).
 * Drawn with SVG attributes only: the CSP (`default-src 'self'`)
 * blocks inline style attributes.
 */
export function ProgressRing({ done, due, size = 40, stroke = 6 }: ProgressRingProps) {
  const value = due > 0 ? Math.min(1, done / due) : 0
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const centre = size / 2
  return (
    <svg
      className={`${styles.ring} ${value >= 1 ? styles.full : ''}`}
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-hidden="true"
      focusable="false"
    >
      <circle
        className={styles.track}
        cx={centre}
        cy={centre}
        r={radius}
        fill="none"
        strokeWidth={stroke}
      />
      <circle
        className={styles.arc}
        cx={centre}
        cy={centre}
        r={radius}
        fill="none"
        strokeWidth={stroke}
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - value)}
        strokeLinecap="round"
        transform={`rotate(-90 ${centre} ${centre})`}
      />
    </svg>
  )
}
