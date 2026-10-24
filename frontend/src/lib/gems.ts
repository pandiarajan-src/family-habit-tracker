// What Gems & prizes shows, derived from the API's IDs-only rows (REQ-021, 025, 026).
import type {
  GemTransactionRead,
  HabitRead,
  MemberRead,
  PrizeClaimRead,
  PrizeRead,
} from '../api/types'
import { copy } from '../copy'
import { familyDate, formatShortDay } from './dates'

/** How many history lines show at first, and how many more each "Show older" adds. */
export const HISTORY_PAGE = 10

export interface HistoryLine {
  key: string
  amount: number
  label: string
  when: string
}

/**
 * One line per earning or spending event, in the API's newest-first order. Titles come from
 * the member's habits (archived ones too) and claims; a deleted habit reads "a habit". A hold
 * whose claim was approved reads "Spent on …", because approving keeps the hold.
 */
export function historyLines(
  events: GemTransactionRead[],
  habits: HabitRead[],
  claims: PrizeClaimRead[],
  today: string,
): HistoryLine[] {
  const habitTitle = new Map(habits.map((h) => [h.id, h.title]))
  const claimById = new Map(claims.map((c) => [c.id, c]))
  const labels = copy.gemsPrizes.events
  return events.map((event, index) => {
    const habit = (event.habit_id && habitTitle.get(event.habit_id)) || copy.changes.aHabit
    const claim = event.prize_claim_id ? claimById.get(event.prize_claim_id) : undefined
    const prize = claim?.prize_title ?? copy.gemsPrizes.aPrize
    let label: string
    switch (event.kind) {
      case 'prize_hold':
        label = claim?.status === 'approved' ? labels.prize_spent(prize) : labels.prize_hold(prize)
        break
      case 'prize_release':
        label = labels.prize_release(prize)
        break
      case 'correction_writeoff':
        label = labels.correction_writeoff()
        break
      default:
        label = labels[event.kind](habit)
    }
    return {
      key: `${index}:${event.kind}:${event.date}`,
      amount: event.amount,
      label,
      when: event.date === today ? copy.gemsPrizes.today : formatShortDay(event.date),
    }
  })
}

export interface ClaimLine {
  claim: PrizeClaimRead
  title: string
  status: string
  canCancel: boolean
}

/** "Waiting for a parent · 15 gems held", "Your prize is approved! · Mon 28 Sep", … */
export function claimLine(
  claim: PrizeClaimRead,
  me: MemberRead,
  parentCount: number,
  timeZone: string,
): ClaimLine {
  const text = copy.gemsPrizes
  const title = text.claimTitle(claim.prize_title, claim.gem_cost)
  if (claim.status === 'pending') {
    let waiting: string = text.waitingParent
    // A parent's own claim needs the other parent, unless they're the only one (REQ-026, C5).
    if (me.role === 'parent') waiting = parentCount > 1 ? text.waitingOtherParent : text.waitingYou
    return {
      claim,
      title,
      status: text.withDay(waiting, text.heldNote(claim.gem_cost)),
      canCancel: true,
    }
  }
  const decided = claim.decided_at ?? claim.requested_at
  const day = formatShortDay(familyDate(Date.parse(decided), timeZone))
  return { claim, title, status: text.withDay(text[claim.status], day), canCancel: false }
}

export interface PrizeOffer {
  prize: PrizeRead
  affordable: boolean
  /** Gems still needed; 0 when affordable. */
  toGo: number
  /** Balance as a share of the cost, 0–1, for the progress bar. */
  progress: number
}

/** Each prize with "Claim" or "12 more gems to go!" for this balance (REQ-025). */
export function prizeOffers(prizes: PrizeRead[], balance: number): PrizeOffer[] {
  return prizes.map((prize) => {
    const toGo = Math.max(0, prize.gem_cost - balance)
    return {
      prize,
      affordable: toGo === 0,
      toGo,
      progress: Math.min(1, balance / prize.gem_cost),
    }
  })
}
