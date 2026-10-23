// One typed function per endpoint the frontend calls; shapes come from schema.d.ts.
import { apiRequest, type RequestOptions } from './client'
import type {
  AdjustmentRead,
  CheckInRead,
  FamilyRead,
  HabitRead,
  MemberRead,
  SessionRead,
  StreakSaverRead,
} from './types'

type ReadOptions = Pick<RequestOptions, 'background' | 'signal' | 'quiet'>

/** "?a=1&b=2", skipping undefined values; "" when nothing is left. */
function query(params: Record<string, string | boolean | undefined>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value))
  }
  const text = search.toString()
  return text ? `?${text}` : ''
}

interface Range {
  from: string
  to: string
  member_id?: string
}

export const api = {
  getSession: (options: ReadOptions = {}) => apiRequest<SessionRead>('/sessions/current', options),

  /** Passcode entry: the screen shows the 401/429 itself, so the error isn't announced. */
  createSession: (passcode: string) =>
    apiRequest<SessionRead>('/sessions', { method: 'POST', body: { passcode }, quiet: true }),

  chooseMember: (memberId: string, pin: string) =>
    apiRequest<SessionRead>('/sessions/current', {
      method: 'PATCH',
      body: { acting_member_id: memberId, pin },
    }),

  switchPerson: () =>
    apiRequest<SessionRead>('/sessions/current', {
      method: 'PATCH',
      body: { acting_member_id: null },
    }),

  getFamily: (options: ReadOptions = {}) => apiRequest<FamilyRead>('/families/current', options),

  listMembers: (options: ReadOptions = {}) => apiRequest<MemberRead[]>('/members', options),

  listHabits: (
    options: ReadOptions = {},
    params: { member_id?: string; include_archived?: boolean } = {},
  ) => apiRequest<HabitRead[]>(`/habits${query(params)}`, options),

  listCheckIns: (range: Range, options: ReadOptions = {}) =>
    apiRequest<CheckInRead[]>(`/check-ins${query({ ...range })}`, options),

  /** 201 for a new check-in, 200 when it already existed (REQ-012). */
  checkIn: (habitId: string, day: string) =>
    apiRequest<CheckInRead>(`/habits/${habitId}/check-ins/${day}`, { method: 'PUT', body: {} }),

  undoCheckIn: (habitId: string, day: string) =>
    apiRequest<void>(`/habits/${habitId}/check-ins/${day}`, { method: 'DELETE' }),

  listStreakSavers: (range: Range, options: ReadOptions = {}) =>
    apiRequest<StreakSaverRead[]>(`/streak-savers${query({ ...range })}`, options),

  saveStreak: (habitId: string, periodStart: string) =>
    apiRequest<StreakSaverRead>(`/habits/${habitId}/streak-savers`, {
      method: 'POST',
      body: { period_start: periodStart },
    }),

  listAdjustments: (options: ReadOptions = {}) =>
    apiRequest<AdjustmentRead[]>('/adjustments', options),

  acknowledgeAdjustment: (adjustmentId: string) =>
    apiRequest<AdjustmentRead>(`/adjustments/${adjustmentId}`, {
      method: 'PATCH',
      body: { acknowledged: true },
    }),
}
