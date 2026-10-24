import { useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router'
import { isApiError } from '../api/client'
import { api } from '../api/endpoints'
import { useResource, type LoadOptions } from '../api/hooks'
import type { HabitRead, MemberRead } from '../api/types'
import { useActiveSession } from '../auth/useSession'
import { Button } from '../components/Button'
import { ButtonLink } from '../components/ButtonLink'
import { Loading } from '../components/Loading'
import { Notice } from '../components/Notice'
import { copy } from '../copy'
import {
  habitMeta,
  habitOwner,
  MAX_ACTIVE_HABITS,
  ownerQuery,
  type HabitOwner,
} from '../lib/habits'
import styles from './MyHabits.module.css'

/** What the editor tells the list after a save, archive or delete ("Piano is saved."). */
export interface HabitsNote {
  note: string
}

interface ListData {
  owner: HabitOwner
  habits: HabitRead[]
}

async function loadList(
  me: MemberRead,
  requestedId: string | null,
  options: LoadOptions,
): Promise<ListData> {
  const members = await api.listMembers(options)
  const owner = habitOwner(me, members, requestedId)
  const habits = await api.listHabits(options, {
    member_id: owner.member.id,
    include_archived: true,
  })
  return { owner, habits }
}

/** The banner a parent sees while changing a child's habits (C15, REQ-010). */
export function ParentModeBanner({ owner }: { owner: HabitOwner }) {
  if (!owner.parentMode) return null
  const child = owner.member.nickname
  return (
    <Notice icon="people" title={copy.habits.parentTitle(child)}>
      {copy.habits.parentText(child)}
    </Notice>
  )
}

/**
 * My habits: active habits with Edit, archived ones with "Bring back" (REQ-008, REQ-009), and
 * the way to My PIN. A parent opens a child's list with `?member=<id>` from Family settings
 * and sees the parent-mode banner (C15, REQ-010).
 */
export function MyHabits() {
  const me = useActiveSession()?.acting_member
  const [params] = useSearchParams()
  const requestedId = params.get('member')
  const location = useLocation()
  const navigate = useNavigate()
  const list = useResource(`habits:${me?.id}:${requestedId}`, (options) =>
    loadList(me as MemberRead, requestedId, options),
  )
  const [busy, setBusy] = useState<string | null>(null)
  const [trouble, setTrouble] = useState<string | null>(null)

  // MemberLayout renders this screen only while someone is checking in.
  if (!me) return null
  const data = list.data

  if (!data) {
    return (
      <main className="page">
        {list.loading ? (
          <Loading />
        ) : (
          <Notice
            tone="caution"
            actions={<Button onClick={() => void list.reload()}>{copy.habits.tryAgain}</Button>}
          >
            {copy.habits.loadTrouble}
          </Notice>
        )}
      </main>
    )
  }

  const { owner, habits } = data
  const query = ownerQuery(owner)
  const active = habits.filter((h) => !h.archived)
  const archived = habits.filter((h) => h.archived)
  const note = (location.state as HabitsNote | null)?.note

  const bringBack = async (habit: HabitRead) => {
    setBusy(habit.id)
    setTrouble(null)
    try {
      await api.updateHabit(habit.id, { archived: false })
      // The note replaces this entry's state, so it doesn't come back on Back/Forward.
      navigate(`${location.pathname}${location.search}`, {
        replace: true,
        state: { note: copy.habits.broughtBack(habit.title) } satisfies HabitsNote,
      })
    } catch (error) {
      setTrouble(
        isApiError(error, 422) ? copy.habits.limit(MAX_ACTIVE_HABITS) : copy.habits.saveTrouble,
      )
    }
    await list.reload()
    setBusy(null)
  }

  return (
    <main className="page">
      {owner.parentMode && (
        <ButtonLink variant="quiet" icon="previous" to="/parent/settings" className={styles.back}>
          {copy.habits.backToSettings}
        </ButtonLink>
      )}

      <div className={styles.head}>
        <div className={styles.titles}>
          <h1 className="page-title">
            {owner.parentMode ? copy.habits.whose(owner.member.nickname) : copy.screens.habits}
          </h1>
          <p className="page-lead">{copy.habits.activeCount(active.length, MAX_ACTIVE_HABITS)}</p>
        </div>
        <ButtonLink variant="primary" icon="plus" to={`/habits/new${query}`}>
          {copy.habits.add}
        </ButtonLink>
      </div>

      <ParentModeBanner owner={owner} />
      {note && <Notice icon="check">{note}</Notice>}
      {trouble && <Notice tone="caution">{trouble}</Notice>}

      <section className={styles.section} aria-labelledby="active-title">
        <h2 id="active-title" className={styles.sectionTitle}>
          {copy.habits.active}
        </h2>
        {active.length === 0 && <p className={styles.empty}>{copy.habits.noneActive}</p>}
        <ul className={styles.list}>
          {active.map((habit) => (
            <li key={habit.id} className={styles.card}>
              <div className={styles.body}>
                <h3 className={styles.title}>{habit.title}</h3>
                <p className={styles.meta}>{habitMeta(habit)}</p>
              </div>
              <ButtonLink icon="edit" to={`/habits/${habit.id}${query}`}>
                {copy.habits.edit} <span className="sr-only">{habit.title}</span>
              </ButtonLink>
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.section} aria-labelledby="archived-title">
        <h2 id="archived-title" className={styles.sectionTitle}>
          {copy.habits.archived}
        </h2>
        <p className={styles.lead}>{copy.habits.archivedLead}</p>
        {archived.length > 0 && (
          <ul className={styles.list}>
            {archived.map((habit) => (
              <li key={habit.id} className={`${styles.card} ${styles.resting}`}>
                <div className={styles.body}>
                  <h3 className={styles.title}>{habit.title}</h3>
                  <p className={styles.meta}>{habitMeta(habit)}</p>
                </div>
                <Button
                  icon="archive"
                  onClick={() => void bringBack(habit)}
                  disabled={busy !== null}
                >
                  {copy.habits.bringBack} <span className="sr-only">{habit.title}</span>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {!owner.parentMode && (
        <div className={styles.card}>
          <p className={styles.pinNote}>{copy.habits.pinNote}</p>
          <ButtonLink icon="key" to="/my-pin">
            {copy.habits.changePin}
          </ButtonLink>
        </div>
      )}
    </main>
  )
}
