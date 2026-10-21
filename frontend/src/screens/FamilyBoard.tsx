import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { usePolling, useResource, type LoadOptions } from '../api/hooks'
import { api } from '../api/endpoints'
import type { HabitRead, MemberRead } from '../api/types'
import { AppHeader } from '../components/AppHeader'
import { Button } from '../components/Button'
import { HabitSummary } from '../components/HabitSummary'
import { Icon } from '../components/Icon'
import { MemberCard } from '../components/MemberCard'
import { Notice } from '../components/Notice'
import { Loading } from '../components/Loading'
import { copy } from '../copy'
import { habitsByMember, summarize } from '../lib/board'
import { formatLongDate, formatUpdatedAgo } from '../lib/format'
import { useNow } from '../lib/useNow'
import styles from './FamilyBoard.module.css'

interface BoardData {
  members: MemberRead[]
  habits: Map<string, HabitRead[]>
  timezone: string
  loadedAt: number
}

async function loadBoard(options: LoadOptions): Promise<BoardData> {
  const [members, habits, family] = await Promise.all([
    api.listMembers(options),
    api.listHabits(options),
    api.getFamily(options),
  ])
  return {
    members,
    habits: habitsByMember(habits),
    timezone: family.timezone,
    loadedAt: Date.now(),
  }
}

const PANEL_ID = 'member-habits'

/**
 * "Who's checking in?" — the device home (REQ-022). Works with or without an acting member,
 * refreshes every 30 s and on focus as a background refresh (REQ-012, REQ-004), and opens the
 * PIN pad when a card is tapped (REQ-003). The member panel is view only.
 */
export function FamilyBoard() {
  const board = useResource('family-board', loadBoard)
  usePolling(board.reload)
  const now = useNow()
  const navigate = useNavigate()
  const [viewing, setViewing] = useState<string | null>(null)
  const panelHeading = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    if (viewing) panelHeading.current?.focus()
  }, [viewing])

  const data = board.data
  const viewed = data?.members.find((member) => member.id === viewing)
  const viewedHabits = viewed ? (data?.habits.get(viewed.id) ?? []) : []

  return (
    <>
      <AppHeader>
        {data && (
          <p className={styles.updated}>
            <Icon name="clock" size={18} />
            {formatUpdatedAgo(now - data.loadedAt)}
          </p>
        )}
      </AppHeader>
      <main className="page">
        <div className={styles.intro}>
          <h1 className="page-title">{copy.board.title}</h1>
          {data && (
            <p className="page-lead">{copy.board.lead(formatLongDate(now, data.timezone))}</p>
          )}
        </div>
        {!data && board.loading && <Loading />}
        {!data && !board.loading && (
          <Notice
            tone="caution"
            actions={<Button onClick={() => void board.reload()}>{copy.board.tryAgain}</Button>}
          >
            {copy.board.loadTrouble}
          </Notice>
        )}
        {data && (
          <div className={styles.cards}>
            {data.members.map((member) => (
              <MemberCard
                key={member.id}
                member={member}
                summary={summarize(data.habits.get(member.id) ?? [])}
                detailsOpen={viewing === member.id}
                detailsId={PANEL_ID}
                onPick={() => navigate(`/pin/${member.id}`)}
                onDetails={() => setViewing(viewing === member.id ? null : member.id)}
              />
            ))}
          </div>
        )}
        {viewed && (
          <section id={PANEL_ID} className={styles.panel} aria-labelledby={`${PANEL_ID}-title`}>
            <div className={styles.panelHead}>
              <h2
                id={`${PANEL_ID}-title`}
                className={styles.panelTitle}
                ref={panelHeading}
                tabIndex={-1}
              >
                {copy.board.habitsToday(viewed.nickname)}
              </h2>
              <span className={styles.viewOnly}>{copy.board.viewOnly}</span>
            </div>
            {viewedHabits.length > 0 ? (
              <div className={styles.habits}>
                {viewedHabits.map((habit) => (
                  <HabitSummary key={habit.id} habit={habit} />
                ))}
              </div>
            ) : (
              <p className={styles.empty}>{copy.board.nothingYet(viewed.nickname)}</p>
            )}
          </section>
        )}
      </main>
    </>
  )
}
