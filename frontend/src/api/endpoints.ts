// One typed function per endpoint the frontend calls; shapes come from schema.d.ts.
import { apiRequest, type RequestOptions } from './client'
import type { FamilyRead, HabitRead, MemberRead, SessionRead } from './types'

type ReadOptions = Pick<RequestOptions, 'background' | 'signal' | 'quiet'>

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

  listHabits: (options: ReadOptions = {}) => apiRequest<HabitRead[]>('/habits', options),
}
