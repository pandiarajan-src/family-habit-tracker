// The Parent tab (REQ-002, 005, 006, 007, 024, 026, 027): approval lines, what removing a
// member deletes, timezone choices, and the checks the browser makes before anything is sent.
import type { HabitRead, MemberRead, PrizeClaimRead, PrizeRead, Role } from '../api/types'
import { copy } from '../copy'
import { familyDate, formatShortDay } from './dates'
import type { FormError } from './habits'

export const PRIZE_TITLE_MAX = 40
export const PRIZE_COST_MAX = 10_000
export const NICKNAME_MAX = 20

/** Length in characters as the server counts them (code points), not UTF-16 units. */
const length = (text: string) => [...text].length
const isPin = (value: string) => /^[0-9]{4}$/.test(value)

export interface ApprovalLine {
  claim: PrizeClaimRead
  emoji: string
  title: string
  meta: string
  /** The approve button's text; null when the other parent has to decide (REQ-026, C5). */
  approve: string | null
  /** Screen-reader end of "Not this time". */
  declineFor: string
  /** The note shown after a decision. */
  approved: string
  declined: string
}

/**
 * Pending claims as the parent sees them, in the API's order. Someone else's claim gets
 * "Approve Mia’s Pick Friday dinner"; the parent's own claim waits for another parent, unless
 * they're the only one (REQ-026, C5).
 */
export function approvalLines(
  claims: PrizeClaimRead[],
  members: MemberRead[],
  me: MemberRead,
  timeZone: string,
): ApprovalLine[] {
  const text = copy.approvals
  const byId = new Map(members.map((m) => [m.id, m]))
  const onlyParent = members.filter((m) => m.role === 'parent').length <= 1
  return claims
    .filter((c) => c.status === 'pending')
    .map((claim) => {
      const prize = claim.prize_title
      const asked = formatShortDay(familyDate(Date.parse(claim.requested_at), timeZone))
      const meta = text.claimMeta(claim.gem_cost, asked)
      if (claim.member_id === me.id) {
        return {
          claim,
          emoji: me.avatar_emoji,
          title: text.claimTitle(text.you, prize),
          meta,
          approve: onlyParent ? text.approveOwn(prize) : null,
          declineFor: text.declineOwnFor(prize),
          approved: text.approvedOwn(prize),
          declined: text.declinedOwn(prize),
        }
      }
      const claimant = byId.get(claim.member_id)
      const who = claimant?.nickname ?? text.aMember
      return {
        claim,
        emoji: claimant?.avatar_emoji ?? '🙂',
        title: text.claimTitle(who, prize),
        meta,
        approve: text.approve(who, prize),
        declineFor: text.declineFor(who, prize),
        approved: text.approved(who, prize),
        declined: text.declined(who, prize),
      }
    })
}

/** Who decides this parent's own claims: "Your own claims are decided by Dad, …" (C5). */
export function ownClaimsNote(me: MemberRead, members: MemberRead[]): string {
  const others = members.filter((m) => m.role === 'parent' && m.id !== me.id)
  if (others.length === 0) return copy.approvals.onlyParent
  if (others.length === 1) return copy.approvals.twoParents(others[0].nickname)
  return copy.approvals.manyParents
}

/** Prizes with a pending claim can't be deleted (REQ-024, 409). */
export function prizesWithPendingClaims(claims: PrizeClaimRead[]): Set<string> {
  return new Set(
    claims.filter((c) => c.status === 'pending' && c.prize_id !== null).map((c) => c.prize_id!),
  )
}

export interface PrizeForm {
  title: string
  cost: string
}

export function prizeForm(prize?: PrizeRead): PrizeForm {
  return prize ? { title: prize.title, cost: String(prize.gem_cost) } : { title: '', cost: '' }
}

/** The same limits as PrizeCreate: title 1–40 after trimming, cost a whole number 1–10,000. */
export function prizeFormError(form: PrizeForm): FormError<'title' | 'cost'> | null {
  const title = form.title.trim()
  if (title === '') return { field: 'title', message: copy.prizes.nameEmpty }
  if (length(title) > PRIZE_TITLE_MAX) return { field: 'title', message: copy.prizes.nameHint }
  const cost = form.cost.trim()
  if (!/^[0-9]+$/.test(cost) || Number(cost) < 1 || Number(cost) > PRIZE_COST_MAX) {
    return { field: 'cost', message: copy.prizes.costHint }
  }
  return null
}

export function prizeBody(form: PrizeForm): { title: string; gem_cost: number } {
  return { title: form.title.trim(), gem_cost: Number(form.cost.trim()) }
}

/**
 * Exactly one emoji, as the server's `AvatarEmoji` wants: one grapheme that is a pictograph
 * (ZWJ sequences and skin tones included) or a flag. Letters, digits and keycaps are refused.
 */
export function isSingleEmoji(text: string): boolean {
  const graphemes = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)]
  if (graphemes.length !== 1) return false
  const [{ segment }] = graphemes
  if (/[\p{L}\p{N}\s]/u.test(segment)) return false
  return /^\p{Extended_Pictographic}/u.test(segment) || /^\p{Regional_Indicator}{2}$/u.test(segment)
}

export interface MemberForm {
  nickname: string
  avatar: string
  role: Role
  pin: string
}

export type MemberField = keyof MemberForm

export function memberForm(member?: MemberRead): MemberForm {
  return member
    ? { nickname: member.nickname, avatar: member.avatar_emoji, role: member.role, pin: '' }
    : { nickname: '', avatar: '', role: 'child', pin: '' }
}

/**
 * The browser's checks before adding or editing a member (REQ-006): a nickname of 1–20
 * characters that nobody else in the family has (ignoring case, as the server does), one
 * emoji, and for a new member a 4-number PIN.
 */
export function memberFormError(
  form: MemberForm,
  members: MemberRead[],
  editing: MemberRead | null,
): FormError<MemberField> | null {
  const text = copy.settings
  const nickname = form.nickname.trim()
  if (nickname === '') return { field: 'nickname', message: text.nicknameEmpty }
  if (length(nickname) > NICKNAME_MAX) return { field: 'nickname', message: text.nicknameHint }
  const taken = members.some(
    (m) => m.id !== editing?.id && m.nickname.toLowerCase() === nickname.toLowerCase(),
  )
  if (taken) return { field: 'nickname', message: text.nicknameTaken }
  if (!isSingleEmoji(form.avatar.trim())) return { field: 'avatar', message: text.avatarWrong }
  if (editing === null && !isPin(form.pin)) return { field: 'pin', message: text.pinFormat }
  return null
}

/** Only what changed, so a child's profile edit never sends a role (REQ-006). */
export function memberChanges(form: MemberForm, member: MemberRead) {
  const nickname = form.nickname.trim()
  const avatar = form.avatar.trim()
  return {
    ...(nickname !== member.nickname && { nickname }),
    ...(avatar !== member.avatar_emoji && { avatar_emoji: avatar }),
    ...(form.role !== member.role && { role: form.role }),
  }
}

/** The only parent can't stop being one, or be removed (REQ-006, REQ-007). */
export function isOnlyParent(member: MemberRead, members: MemberRead[]): boolean {
  return member.role === 'parent' && members.filter((m) => m.role === 'parent').length === 1
}

export type ResetField = 'next' | 'again'

/** A parent's reset of a child's PIN: 4 numbers, typed twice; no current PIN (REQ-005). */
export function resetPinError(next: string, again: string): FormError<ResetField> | null {
  if (!isPin(next)) return { field: 'next', message: copy.settings.pinFormat }
  if (again !== next) return { field: 'again', message: copy.settings.mismatch }
  return null
}

/** Everything removing a member deletes, for the confirmation (REQ-007). */
export function removalList(member: MemberRead, habits: HabitRead[]): string[] {
  const text = copy.settings
  const owned = habits.filter((h) => h.member_id === member.id).length
  return [
    text.removeHabits(owned),
    text.removeSavers,
    text.removeGems(member.gem_balance),
    text.removeClaims,
    text.removePin(member.nickname),
    text.removeNotes(member.nickname),
  ]
}

export interface ZoneGroup {
  region: string
  zones: { id: string; label: string }[]
}

/** "America/Argentina/Buenos_Aires" → "Argentina — Buenos Aires"; "UTC" stays "UTC". */
export function zoneLabel(zone: string): string {
  const parts = zone.split('/').map((p) => p.replaceAll('_', ' '))
  return parts.length > 1 ? parts.slice(1).join(' — ') : parts[0]
}

/**
 * The browser's IANA timezones grouped by region ("Europe", "America", …), always including
 * the family's current one, so the select can show it even if this browser doesn't list it.
 */
export function timezoneGroups(current: string, zones: readonly string[]): ZoneGroup[] {
  const all = zones.includes(current) ? [...zones] : [...zones, current]
  const groups = new Map<string, ZoneGroup>()
  for (const zone of [...all].sort()) {
    const region = zone.includes('/') ? zone.split('/')[0] : copy.settings.otherZones
    const group = groups.get(region) ?? { region, zones: [] }
    group.zones.push({ id: zone, label: zoneLabel(zone) })
    groups.set(region, group)
  }
  return [...groups.values()]
}
