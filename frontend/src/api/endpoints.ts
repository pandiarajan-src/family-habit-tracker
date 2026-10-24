// One typed function per endpoint the frontend calls; shapes come from schema.d.ts.
import { apiRequest, type RequestOptions } from './client'
import type {
  AdjustmentRead,
  CheckInRead,
  ClaimStatus,
  FamilyRead,
  FamilyUpdate,
  GemTransactionRead,
  HabitCreate,
  HabitRead,
  HabitUpdate,
  MemberCreate,
  MemberCredentialUpdate,
  MemberRead,
  MemberUpdate,
  PrizeClaimRead,
  PrizeCreate,
  PrizeRead,
  PrizeUpdate,
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

  /** "Sign this device out" (parents only): the cookie stops working everywhere (REQ-002). */
  signOut: () => apiRequest<void>('/sessions/current', { method: 'DELETE' }),

  getFamily: (options: ReadOptions = {}) => apiRequest<FamilyRead>('/families/current', options),

  /** A bad IANA name is a 422; past check-ins keep their dates (REQ-027). */
  updateFamily: (body: FamilyUpdate) =>
    apiRequest<FamilyRead>('/families/current', { method: 'PATCH', body }),

  listMembers: (options: ReadOptions = {}) => apiRequest<MemberRead[]>('/members', options),

  /** Parents only; a duplicate nickname or a bad emoji is a 422 (REQ-006). */
  createMember: (body: MemberCreate) =>
    apiRequest<MemberRead>('/members', { method: 'POST', body }),

  /** Demoting the last parent is a 422 (REQ-006). */
  updateMember: (memberId: string, body: MemberUpdate) =>
    apiRequest<MemberRead>(`/members/${memberId}`, { method: 'PATCH', body }),

  /** Deletes everything the member owns; the last parent is a 422 (REQ-007). */
  deleteMember: (memberId: string) =>
    apiRequest<void>(`/members/${memberId}`, { method: 'DELETE' }),

  listHabits: (
    options: ReadOptions = {},
    params: { member_id?: string; include_archived?: boolean } = {},
  ) => apiRequest<HabitRead[]>(`/habits${query(params)}`, options),

  getHabit: (habitId: string, options: ReadOptions = {}) =>
    apiRequest<HabitRead>(`/habits/${habitId}`, options),

  createHabit: (body: HabitCreate) => apiRequest<HabitRead>('/habits', { method: 'POST', body }),

  /** Rename, change the goal or target, archive (`archived: true`) or bring back (REQ-009). */
  updateHabit: (habitId: string, body: HabitUpdate) =>
    apiRequest<HabitRead>(`/habits/${habitId}`, { method: 'PATCH', body }),

  deleteHabit: (habitId: string) => apiRequest<void>(`/habits/${habitId}`, { method: 'DELETE' }),

  /**
   * Your own PIN needs `current_pin`; a wrong one is a 401 `MemberPIN` (REQ-005, C14).
   * A parent resets a child's without it.
   */
  setPin: (memberId: string, body: MemberCredentialUpdate) =>
    apiRequest<void>(`/members/${memberId}/credentials`, { method: 'PUT', body }),

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

  /** Earnings (derived) and spends, newest first; the last 12 months by default (REQ-021). */
  listGemTransactions: (memberId: string, options: ReadOptions = {}) =>
    apiRequest<GemTransactionRead[]>(`/members/${memberId}/gem-transactions`, options),

  listPrizes: (options: ReadOptions = {}) => apiRequest<PrizeRead[]>('/prizes', options),

  createPrize: (body: PrizeCreate) => apiRequest<PrizeRead>('/prizes', { method: 'POST', body }),

  /** A new cost doesn't change pending claims (REQ-024). */
  updatePrize: (prizeId: string, body: PrizeUpdate) =>
    apiRequest<PrizeRead>(`/prizes/${prizeId}`, { method: 'PATCH', body }),

  /** 409 while a claim for it is waiting (REQ-024). */
  deletePrize: (prizeId: string) => apiRequest<void>(`/prizes/${prizeId}`, { method: 'DELETE' }),

  listClaims: (
    options: ReadOptions = {},
    params: { member_id?: string; status?: ClaimStatus } = {},
  ) => apiRequest<PrizeClaimRead[]>(`/prize-claims${query(params)}`, options),

  /** Holds the cost from the balance; 409 when it's more than the member has (REQ-025). */
  claimPrize: (prizeId: string) =>
    apiRequest<PrizeClaimRead>('/prize-claims', { method: 'POST', body: { prize_id: prizeId } }),

  /** The claimant cancels; parents approve or decline (REQ-025, REQ-026). */
  decideClaim: (claimId: string, status: Exclude<ClaimStatus, 'pending'>) =>
    apiRequest<PrizeClaimRead>(`/prize-claims/${claimId}`, { method: 'PATCH', body: { status } }),
}
