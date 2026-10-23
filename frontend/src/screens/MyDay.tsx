import { useState } from 'react'
import { isApiError } from '../api/client'
import { api } from '../api/endpoints'
import { useResource, type LoadOptions } from '../api/hooks'
import type {
  AdjustmentRead,
  CheckInRead,
  HabitRead,
  MemberRead,
  SaveablePeriodRead,
  StreakSaverRead,
} from '../api/types'
import { useActiveSession } from '../auth/useSession'
import { AdjustmentNotice } from '../components/AdjustmentNotice'
import { Button } from '../components/Button'
import { DaySummary } from '../components/DaySummary'
import { DayToggle } from '../components/DayToggle'
import { HabitRow } from '../components/HabitRow'
import { Loading } from '../components/Loading'
import { Notice } from '../components/Notice'
import { SaverPrompt } from '../components/SaverPrompt'
import saverStyles from '../components/SaverPrompt.module.css'
import { copy } from '../copy'
import { summarize } from '../lib/board'
import { addDays, familyDate, formatLongDay, formatShortDay } from '../lib/dates'
import {
  changeNotices,
  habitDays,
  periodLabel,
  saverOffer,
  summarizeDay,
  type DayView,
  type HabitDay,
} from '../lib/myDay'
import styles from './MyDay.module.css'

interface DayData {
  timezone: string
  today: string
  yesterday: string
  members: MemberRead[]
  /** Archived ones too, so change notices can name them; My day lists only active ones. */
  habits: HabitRead[]
  adjustments: AdjustmentRead[]
  yesterdayCheckIns: CheckInRead[]
  yesterdaySavers: StreakSaverRead[]
}

async function loadDay(memberId: string, options: LoadOptions): Promise<DayData> {
  const family = await api.getFamily(options)
  const today = familyDate(Date.now(), family.timezone)
  const yesterday = addDays(today, -1)
  const range = { from: yesterday, to: yesterday, member_id: memberId }
  const [members, habits, adjustments, yesterdayCheckIns, yesterdaySavers] = await Promise.all([
    api.listMembers(options),
    api.listHabits(options, { member_id: memberId, include_archived: true }),
    api.listAdjustments(options),
    api.listCheckIns(range, options),
    api.listStreakSavers(range, options),
  ])
  return {
    timezone: family.timezone,
    today,
    yesterday,
    members,
    habits,
    adjustments,
    yesterdayCheckIns,
    yesterdaySavers,
  }
}

function without<T>(record: Record<string, T>, key: string): Record<string, T> {
  const copied = { ...record }
  delete copied[key]
  return copied
}

type SaverState =
  { status: 'busy' | 'short'; period: string } | { status: 'done'; period: string; cost: number }

/**
 * My day, the acting member's home: one-tap check-off and undo (REQ-011, 012), a Yesterday
 * toggle (REQ-013), streaks and gems (REQ-016–019), streak savers (REQ-020), and notices of
 * what a parent changed (REQ-015). A tap shows its result straight away, then the habit and
 * balance are re-read from the server, which has the last word.
 */
export function MyDay() {
  const me = useActiveSession()?.acting_member
  const memberId = me?.id ?? ''
  const day = useResource(`my-day:${memberId}`, (options) => loadDay(memberId, options))
  const [view, setView] = useState<DayView>('today')
  /** Optimistic done state per "habitId:date" while its request is in flight. */
  const [optimistic, setOptimistic] = useState<Record<string, boolean>>({})
  const [savers, setSavers] = useState<Record<string, SaverState>>({})
  const [skipped, setSkipped] = useState<Set<string>>(() => new Set())
  const [dismissing, setDismissing] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set())
  const [trouble, setTrouble] = useState<string | null>(null)

  // MemberLayout renders this screen only while someone is checking in.
  if (!me) return null
  const data = day.data

  if (!data) {
    return (
      <main className="page">
        {day.loading ? (
          <Loading />
        ) : (
          <Notice
            tone="caution"
            actions={<Button onClick={() => void day.reload()}>{copy.myDay.tryAgain}</Button>}
          >
            {copy.myDay.loadTrouble}
          </Notice>
        )}
      </main>
    )
  }

  const balance = data.members.find((m) => m.id === me.id)?.gem_balance ?? me.gem_balance
  const active = data.habits.filter((h) => !h.archived)
  const items = habitDays({ view, ...data }).map((item) => {
    const key = `${item.habit.id}:${item.day}`
    return key in optimistic ? { ...item, done: optimistic[key], hint: null } : item
  })
  const notices = changeNotices(data.adjustments, data.members, data.habits, data.timezone).filter(
    (n) => !dismissed.has(n.id),
  )
  const shownDay = view === 'today' ? data.today : data.yesterday

  const toggle = async (item: HabitDay) => {
    const key = `${item.habit.id}:${item.day}`
    if (key in optimistic) return
    setOptimistic((prev) => ({ ...prev, [key]: !item.done }))
    setTrouble(null)
    try {
      if (item.done) await api.undoCheckIn(item.habit.id, item.day)
      else await api.checkIn(item.habit.id, item.day)
    } catch (error) {
      setTrouble(isApiError(error, 409) ? copy.myDay.alreadySaved : copy.myDay.saveTrouble)
    }
    await day.reload()
    setOptimistic((prev) => without(prev, key))
  }

  const spendSaver = async (habit: HabitRead, period: SaveablePeriodRead) => {
    if (savers[habit.id]?.status === 'busy') return
    const setState = (state: SaverState | null) =>
      setSavers((prev) => (state ? { ...prev, [habit.id]: state } : without(prev, habit.id)))
    setState({ status: 'busy', period: period.period_start })
    setTrouble(null)
    try {
      const saver = await api.saveStreak(habit.id, period.period_start)
      setState({ status: 'done', period: saver.period_start, cost: saver.cost })
    } catch (error) {
      if (isApiError(error, 409)) {
        setState({ status: 'short', period: period.period_start })
        return
      }
      setState(null)
      setTrouble(isApiError(error, 422) ? copy.saver.gone : copy.myDay.saveTrouble)
    }
    await day.reload()
  }

  const gotIt = async (id: string) => {
    setDismissing(id)
    try {
      await api.acknowledgeAdjustment(id)
      setDismissed((prev) => new Set(prev).add(id))
    } catch {
      setTrouble(copy.myDay.saveTrouble)
    } finally {
      setDismissing(null)
    }
  }

  const saverSlot = (habit: HabitRead) => {
    if (view !== 'today') return null
    const state = savers[habit.id]
    if (state?.status === 'done') {
      return (
        <p className={saverStyles.result} role="status">
          {copy.saver.done(periodLabel(habit, state.period), state.cost)}
        </p>
      )
    }
    const offer = saverOffer(habit)
    if (!offer || skipped.has(`${habit.id}:${offer.period_start}`)) return null
    return (
      <SaverPrompt
        habit={habit}
        period={offer}
        balance={balance}
        short={state?.status === 'short' && state.period === offer.period_start}
        busy={state?.status === 'busy'}
        onUse={() => void spendSaver(habit, offer)}
        onSkip={() => setSkipped((prev) => new Set(prev).add(`${habit.id}:${offer.period_start}`))}
      />
    )
  }

  const section = (id: string, title: string, list: HabitDay[]) =>
    list.length > 0 && (
      <section className={styles.section} aria-labelledby={id}>
        <h2 id={id} className={styles.sectionTitle}>
          {title}
        </h2>
        <div className={styles.grid}>
          {list.map((item) => (
            <HabitRow
              key={item.habit.id}
              item={item}
              busy={`${item.habit.id}:${item.day}` in optimistic}
              onToggle={() => void toggle(item)}
            >
              {saverSlot(item.habit)}
            </HabitRow>
          ))}
        </div>
      </section>
    )

  return (
    <main className="page">
      <div className={styles.layout}>
        <div className={styles.main}>
          <div className={styles.head}>
            <div className={styles.titles}>
              <h1 className="page-title">
                {view === 'today' ? copy.myDay.greeting(me.nickname) : copy.myDay.yesterdayTitle}
              </h1>
              <p className="page-lead">{formatLongDay(shownDay)}</p>
            </div>
            <DayToggle value={view} onChange={setView} />
          </div>

          {view === 'today' &&
            notices.map((notice) => (
              <AdjustmentNotice
                key={notice.id}
                notice={notice}
                busy={dismissing === notice.id}
                onGotIt={() => void gotIt(notice.id)}
              />
            ))}

          {view === 'yesterday' && (
            <Notice tone="sun" icon="calendar" title={copy.myDay.yesterdayNoticeTitle}>
              {copy.myDay.yesterdayNoticeText(formatShortDay(data.yesterday))}
            </Notice>
          )}

          {trouble && <Notice tone="caution">{trouble}</Notice>}

          {active.length === 0 && <p className={styles.empty}>{copy.myDay.noHabits}</p>}
          {active.length > 0 && items.length === 0 && (
            <p className={styles.empty}>{copy.myDay.nothingYesterday}</p>
          )}

          {section(
            'daily-title',
            copy.myDay.daily,
            items.filter((i) => i.habit.frequency === 'daily'),
          )}
          {section(
            'weekly-title',
            copy.myDay.weekly,
            items.filter((i) => i.habit.frequency === 'weekly'),
          )}
        </div>

        <DaySummary
          summary={summarizeDay(items)}
          view={view}
          balance={balance}
          longest={summarize(active).longest}
        />
      </div>
    </main>
  )
}
