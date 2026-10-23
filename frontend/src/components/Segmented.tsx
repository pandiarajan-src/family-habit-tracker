import styles from './Segmented.module.css'

export interface SegmentedOption<T extends string> {
  id: T
  label: string
}

/** Two or three pressed-state buttons in a labelled group ("Today | Yesterday", "Week | Month"). */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: readonly SegmentedOption<T>[]
  value: T
  onChange: (value: T) => void
}) {
  return (
    <div className={styles.toggle} role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          className={`${styles.option} ${option.id === value ? styles.on : ''}`}
          aria-pressed={option.id === value}
          onClick={() => onChange(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
