import type { CheckInRead, HabitRead, MemberRead, StreakSaverRead } from '../../api/types'
import { MonthCalendar } from '../../components/MonthCalendar'
import { copy } from '../../copy'
import { habitHistory } from '../../lib/dayStates'
import {
  checkInCount,
  daysOf,
  formatMonth,
  habitsInPeriod,
  tally,
  type Period,
} from '../../lib/history'
import styles from './History.module.css'

interface MonthViewProps {
  members: readonly MemberRead[]
  habits: readonly HabitRead[]
  checkIns: readonly CheckInRead[]
  savers: readonly StreakSaverRead[]
  period: Period
  today: string
}

/** Check-ins per person this month, then a month calendar per habit (REQ-023). */
export function MonthView({ members, habits, checkIns, savers, period, today }: MonthViewProps) {
  const days = daysOf(period)
  const month = formatMonth(period.start).split(' ')[0]
  const current = period.start <= today && today <= period.end
  const calendars = members.flatMap((member) =>
    habitsInPeriod(
      habits.filter((h) => h.member_id === member.id),
      period,
    ).map((habit) => ({ member, habit, history: habitHistory(habit, checkIns, savers) })),
  )
  return (
    <>
      <section className={styles.totals} aria-labelledby="month-totals">
        <h2 id="month-totals" className={styles.sectionTitle}>
          {current ? copy.history.monthSoFar(month) : copy.history.monthTotals(month)}
        </h2>
        <ul className={styles.people}>
          {members.map((member) => (
            <li key={member.id} className={styles.person}>
              <span className={styles.personEmoji} aria-hidden="true">
                {member.avatar_emoji}
              </span>
              <span className={styles.personText}>
                <span className={styles.personName}>{member.nickname}</span>
                <span className={styles.personCount}>
                  {copy.history.checkIns(checkInCount(checkIns, member.id, period))}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </section>
      <div className={styles.calendars}>
        {calendars.map(({ member, habit, history }) => (
          <MonthCalendar
            key={habit.id}
            title={copy.history.habitTitle(member.nickname, habit.title)}
            habit={habit}
            history={history}
            period={period}
            today={today}
            tally={tally([{ habit, history }], days, today)}
          />
        ))}
      </div>
    </>
  )
}
