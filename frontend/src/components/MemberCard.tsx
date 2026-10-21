import type { MemberRead } from '../api/types'
import { copy } from '../copy'
import { streakText, type MemberSummary } from '../lib/board'
import { Button } from './Button'
import { GemBadge, StreakBadge } from './Badges'
import { Icon } from './Icon'
import styles from './MemberCard.module.css'
import { ProgressRing } from './ProgressRing'

interface MemberCardProps {
  member: MemberRead
  summary: MemberSummary
  detailsOpen: boolean
  detailsId: string
  onPick: () => void
  onDetails: () => void
}

/** A Family board card: avatar, nickname, done today, longest streak, gems (REQ-022). */
export function MemberCard({
  member,
  summary,
  detailsOpen,
  detailsId,
  onPick,
  onDetails,
}: MemberCardProps) {
  return (
    <article className={styles.card} aria-label={member.nickname}>
      <button type="button" className={styles.main} onClick={onPick}>
        <span className={styles.avatar} aria-hidden="true">
          {member.avatar_emoji}
        </span>
        <span className={styles.who}>
          <span className={styles.name}>{member.nickname}</span>
          <span className={styles.cta}>{copy.board.tapToCheckIn}</span>
        </span>
        <Icon name="next" className={styles.chevron} />
      </button>
      <div className={styles.stats}>
        <span className={styles.today}>
          <ProgressRing done={summary.done} due={summary.due} />
          <span>
            {summary.due > 0
              ? copy.board.doneToday(summary.done, summary.due)
              : copy.board.noHabits}
          </span>
        </span>
        {summary.longest && (
          <StreakBadge
            prefix={copy.board.longest}
            text={streakText(summary.longest)}
            cold={summary.longest.length === 0}
          />
        )}
        <GemBadge count={member.gem_balance} />
      </div>
      <Button
        variant="quiet"
        icon="eye"
        className={styles.more}
        aria-expanded={detailsOpen}
        aria-controls={detailsId}
        onClick={onDetails}
      >
        {copy.board.seeHabits(member.nickname)}
      </Button>
    </article>
  )
}
