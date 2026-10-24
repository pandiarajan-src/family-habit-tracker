import type { MemberRead } from '../api/types'
import { copy } from '../copy'
import styles from './MemberFilter.module.css'

export const EVERYONE = 'everyone'

/** "Everyone | Dad | Mum | Mia | Kavi": whose history is shown. */
export function MemberFilter({
  members,
  value,
  onChange,
}: {
  members: readonly MemberRead[]
  value: string
  onChange: (value: string) => void
}) {
  const options = [
    { id: EVERYONE, emoji: '👪', label: copy.history.everyone },
    ...members.map((m) => ({ id: m.id, emoji: m.avatar_emoji, label: m.nickname })),
  ]
  return (
    <div className={styles.filter} role="group" aria-label={copy.history.whose}>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          className={`${styles.option} ${option.id === value ? styles.on : ''}`}
          aria-pressed={option.id === value}
          onClick={() => onChange(option.id)}
        >
          <span className={styles.emoji} aria-hidden="true">
            {option.emoji}
          </span>
          {option.label}
        </button>
      ))}
    </div>
  )
}
