// The sample family (CLAUDE.md, spec REQ-020 / C16): Dad 🦉 and Mum 🌻 (parents), Mia 🐬 and
// Kavi 🦖 (children); today is Tue 20 Oct 2026 in Europe/London.
import type { FamilyRead, HabitRead, MemberRead, SessionRead } from '../api/types'
import { json, type Routes } from './mockApi'

export const TODAY = new Date('2026-10-20T09:00:00Z')
export const TIMEZONE = 'Europe/London'
export const FAMILY_ID = '00000000-0000-4000-8000-000000000001'

export const family: FamilyRead = { id: FAMILY_ID, timezone: TIMEZONE }

function member(
  id: string,
  nickname: string,
  emoji: string,
  role: MemberRead['role'],
  gems: number,
): MemberRead {
  return { id, nickname, avatar_emoji: emoji, role, gem_balance: gems, gems_held: 0 }
}

export const dad = member('10000000-0000-4000-8000-000000000001', 'Dad', '🦉', 'parent', 61)
export const mum = member('10000000-0000-4000-8000-000000000002', 'Mum', '🌻', 'parent', 112)
export const mia = member('10000000-0000-4000-8000-000000000003', 'Mia', '🐬', 'child', 24)
export const kavi = member('10000000-0000-4000-8000-000000000004', 'Kavi', '🦖', 'child', 1)
export const members = [dad, mum, mia, kavi]

let habitCount = 0

export function habit(owner: MemberRead, overrides: Partial<HabitRead> = {}): HabitRead {
  habitCount += 1
  return {
    id: `20000000-0000-4000-8000-${String(habitCount).padStart(12, '0')}`,
    member_id: owner.id,
    title: `Habit ${habitCount}`,
    goal_note: null,
    frequency: 'daily',
    weekly_target: null,
    created_on: '2026-09-01',
    archived: false,
    current_streak: 0,
    best_streak: 0,
    streak_pending: false,
    today_done: false,
    week_progress: null,
    next_saver_cost: null,
    saveable_periods: [],
    ...overrides,
  }
}

export function weekly(
  owner: MemberRead,
  done: number,
  target: number,
  overrides: Partial<HabitRead> = {},
) {
  return habit(owner, {
    frequency: 'weekly',
    weekly_target: target,
    week_progress: { done, target, complete: done >= target },
    ...overrides,
  })
}

/** Mia: 3 of 5 done today, longest streak 12 days (as on the design's board). */
export const miaHabits = [
  habit(mia, { title: 'Reading', goal_note: '20 minutes', current_streak: 3, best_streak: 9 }),
  habit(mia, {
    title: 'Exercise',
    goal_note: '40 minutes',
    current_streak: 12,
    best_streak: 15,
    today_done: true,
  }),
  habit(mia, { title: 'Water', goal_note: '3 litres', current_streak: 1, best_streak: 4 }),
  weekly(mia, 2, 3, {
    title: 'Piano',
    goal_note: '15 minutes',
    current_streak: 1,
    best_streak: 2,
    today_done: true,
  }),
  weekly(mia, 1, 1, { title: 'Family time', current_streak: 1, best_streak: 7 }),
]
/** Kavi: 1 of 2 done, longest streak 3 weeks (beats 5 days when weeks count as 7 days). */
export const kaviHabits = [
  habit(kavi, { title: 'Tidy room', current_streak: 5, best_streak: 5, today_done: true }),
  weekly(kavi, 1, 3, { title: 'Swimming', current_streak: 3, best_streak: 3 }),
]
export const dadHabits = [habit(dad, { title: 'Stretching', current_streak: 0, best_streak: 2 })]
export const allHabits = [...dadHabits, ...miaHabits, ...kaviHabits]

export function session(acting: MemberRead | null = null): SessionRead {
  return { family_id: FAMILY_ID, acting_member: acting, expires_at: '2026-10-20T10:05:00+01:00' }
}

/** The reads the board and My day need, for a device where `acting` is checking in. */
export function boardRoutes(acting: MemberRead | null = null): Routes {
  return {
    'GET /sessions/current': () => json(session(acting)),
    'GET /members': () => json(members),
    'GET /habits': () => json(allHabits),
    'GET /families/current': () => json(family),
    // My day (the screen a member lands on) also reads these.
    'GET /adjustments': () => json([]),
    'GET /check-ins': () => json([]),
    'GET /streak-savers': () => json([]),
  }
}
