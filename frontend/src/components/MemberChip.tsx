import styles from './MemberChip.module.css'

/** Avatar emoji + nickname, e.g. the acting member in the header. */
export function MemberChip({ emoji, label }: { emoji: string; label: string }) {
  return (
    <span className={styles.chip}>
      <span className={styles.emoji} aria-hidden="true">
        {emoji}
      </span>
      <span>{label}</span>
    </span>
  )
}
