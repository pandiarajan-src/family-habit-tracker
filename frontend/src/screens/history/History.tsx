import { useState } from 'react'
import { api } from '../../api/endpoints'
import { useActiveSession } from '../../auth/useSession'
import { useResource, type LoadOptions } from '../../api/hooks'
import type { HabitRead, MemberRead } from '../../api/types'
import { Button } from '../../components/Button'
import { Icon } from '../../components/Icon'
import { Loading } from '../../components/Loading'
import { EVERYONE, MemberFilter } from '../../components/MemberFilter'
import { Notice } from '../../components/Notice'
import { PeriodNav } from '../../components/PeriodNav'
import { Segmented, type SegmentedOption } from '../../components/Segmented'
import { copy } from '../../copy'
import { familyDate, formatShortDay } from '../../lib/dates'
import { fetchRange, periodOf, type HistoryView, type Period } from '../../lib/history'
import styles from './History.module.css'
import { MonthView } from './MonthView'
import { WeekView, type WeekCorrection } from './WeekView'

interface Family {
  today: string
  members: MemberRead[]
  /** Archived ones too: they stay in History (REQ-009). */
  habits: HabitRead[]
}

async function loadFamily(options: LoadOptions): Promise<Family> {
  const family = await api.getFamily(options)
  const [members, habits] = await Promise.all([
    api.listMembers(options),
    api.listHabits(options, { include_archived: true }),
  ])
  return { today: familyDate(Date.now(), family.timezone), members, habits }
}

/** The whole family's check-ins and savers for a period, in one ≤ 62-day request each. */
async function loadPeriod(period: Period, options: LoadOptions) {
  const range = fetchRange(period)
  const [checkIns, savers] = await Promise.all([
    api.listCheckIns(range, options),
    api.listStreakSavers(range, options),
  ])
  return { checkIns, savers }
}

const VIEWS: SegmentedOption<HistoryView>[] = [
  { id: 'week', label: copy.history.week },
  { id: 'month', label: copy.history.month },
]

function Trouble({ onRetry }: { onRetry: () => void }) {
  return (
    <Notice tone="caution" actions={<Button onClick={onRetry}>{copy.history.tryAgain}</Button>}>
      {copy.history.loadTrouble}
    </Notice>
  )
}

/** History: every member's week or month at a glance, back over 12 months (REQ-017, 020, 023). */
export function History() {
  const family = useResource('history', loadFamily)
  return (
    <main className="page">
      <div className={styles.titles}>
        <h1 className="page-title">{copy.screens.history}</h1>
        <p className="page-lead">{copy.history.lead}</p>
      </div>
      {family.data ? (
        <HistoryBody {...family.data} />
      ) : family.loading ? (
        <Loading />
      ) : (
        <Trouble onRetry={() => void family.reload()} />
      )}
    </main>
  )
}

function HistoryBody({ today, members, habits }: Family) {
  const [period, setPeriod] = useState(() => periodOf('week', today))
  const [whose, setWhose] = useState(EVERYONE)
  const data = useResource(`history:${period.start}:${period.end}`, (options) =>
    loadPeriod(period, options),
  )

  const changeView = (view: HistoryView) => {
    if (view === period.view) return
    // Keep today in view when it's on screen; otherwise open the period's first week or month.
    const showsToday = period.start <= today && today <= period.end
    setPeriod(periodOf(view, showsToday ? today : period.start))
  }

  const shown = whose === EVERYONE ? members : members.filter((m) => m.id === whose)
  const correction = useCorrection(members, () => data.reload())

  return (
    <>
      <div className={styles.controls}>
        <Segmented
          label={copy.history.whichView}
          options={VIEWS}
          value={period.view}
          onChange={changeView}
        />
        <PeriodNav period={period} today={today} onChange={setPeriod} />
        <MemberFilter members={members} value={whose} onChange={setWhose} />
        <StateKey />
      </div>
      {correction.message && (
        <Notice
          tone={correction.message.tone}
          icon={correction.message.tone === 'info' ? 'check' : 'info'}
        >
          {correction.message.text}
        </Notice>
      )}
      {data.data && period.view === 'week' ? (
        <>
          {correction.week && shown.some(correction.week.canCorrect) && (
            <p className={styles.hint}>{copy.correction.hint}</p>
          )}
          <WeekView
            members={shown}
            habits={habits}
            checkIns={data.data.checkIns}
            savers={data.data.savers}
            period={period}
            today={today}
            correction={correction.week}
          />
        </>
      ) : data.data ? (
        <MonthView
          members={shown}
          habits={habits}
          checkIns={data.data.checkIns}
          savers={data.data.savers}
          period={period}
          today={today}
        />
      ) : data.loading ? (
        <Loading />
      ) : (
        <Trouble onRetry={() => void data.reload()} />
      )}
    </>
  )
}

type Message = { tone: 'info' | 'caution'; text: string } | null

/**
 * A parent's corrections to a child's past days in the week view (REQ-014): one at a time,
 * then the period is read again, so streaks, week states and totals follow the server.
 * Children (and parents looking at the other parent) get no correction at all.
 */
function useCorrection(members: MemberRead[], reload: () => Promise<void>) {
  const me = useActiveSession()?.acting_member
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<Message>(null)

  const onToggle = async (habit: HabitRead, day: string, done: boolean) => {
    if (busy) return
    setBusy(true)
    setMessage(null)
    const owner = members.find((m) => m.id === habit.member_id)
    try {
      await (done ? api.undoCheckIn(habit.id, day) : api.checkIn(habit.id, day))
      const name = owner?.nickname ?? copy.approvals.aMember
      setMessage({
        tone: 'info',
        text: copy.correction.done(name, habit.title, formatShortDay(day)),
      })
    } catch {
      setMessage({ tone: 'caution', text: copy.correction.trouble })
    }
    await reload()
    setBusy(false)
  }

  const week: WeekCorrection | undefined =
    me?.role === 'parent'
      ? {
          canCorrect: (m) => m.role === 'child',
          busy,
          onToggle: (h, d, x) => void onToggle(h, d, x),
        }
      : undefined
  return { week, message }
}

/** "Key: ✓ Done ★ Saved Not yet · Weekly habits: Week complete, Week saved" */
function StateKey() {
  const { dayStates } = copy.history
  return (
    <dl className={styles.key}>
      <div className={styles.keyGroup}>
        <dt>{copy.history.key}</dt>
        <dd className={`${styles.keyItem} ${styles.keyDone}`}>
          <Icon name="check" size={14} strokeWidth={3} />
          {dayStates.done}
        </dd>
        <dd className={`${styles.keyItem} ${styles.keySaved}`}>
          <Icon name="star" size={14} strokeWidth={3} />
          {dayStates.saved}
        </dd>
        <dd className={`${styles.keyItem} ${styles.keyNotYet}`}>{dayStates.not_yet}</dd>
      </div>
      <div className={styles.keyGroup}>
        <dt>{copy.history.weeklyKey}</dt>
        <dd className={`${styles.keyItem} ${styles.keyDone}`}>
          <Icon name="check" size={14} strokeWidth={3} />
          {copy.history.weekComplete}
        </dd>
        <dd className={`${styles.keyItem} ${styles.keySaved}`}>
          <Icon name="star" size={14} strokeWidth={3} />
          {copy.history.weekSaved}
        </dd>
      </div>
    </dl>
  )
}
