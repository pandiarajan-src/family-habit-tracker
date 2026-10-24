import { describe, expect, it } from 'vitest'
import type { GemTransactionRead, PrizeClaimRead } from '../api/types'
import { dad, habit, mia, TIMEZONE } from '../test/fixtures'
import { claimLine, historyLines, prizeOffers } from './gems'

const reading = habit(mia, { title: 'Reading' })
const piano = habit(mia, { title: 'Piano', frequency: 'weekly' })

function claim(overrides: Partial<PrizeClaimRead> = {}): PrizeClaimRead {
  return {
    id: '30000000-0000-4000-8000-000000000001',
    prize_id: '40000000-0000-4000-8000-000000000001',
    prize_title: 'Pick Friday dinner',
    gem_cost: 15,
    member_id: mia.id,
    status: 'pending',
    requested_at: '2026-10-15T18:00:00+01:00',
    decided_at: null,
    decided_by_member_id: null,
    ...overrides,
  }
}

function event(overrides: Partial<GemTransactionRead>): GemTransactionRead {
  return { kind: 'daily_checkin', amount: 1, date: '2026-10-20', ...overrides }
}

describe('REQ-021 gem history lines', () => {
  it('labels earnings, bonuses and spends, keeping the API order', () => {
    const held = claim()
    const lines = historyLines(
      [
        event({ habit_id: reading.id }),
        event({ kind: 'weekly_goal', habit_id: piano.id }),
        event({ kind: 'daily_bonus_7', amount: 7, date: '2026-10-19', habit_id: reading.id }),
        event({ kind: 'daily_bonus_5', amount: 5, date: '2026-10-17', habit_id: reading.id }),
        event({ kind: 'weekly_bonus_5', amount: 5, date: '2026-10-17', habit_id: piano.id }),
        event({ kind: 'streak_saver', amount: -2, date: '2026-10-16', habit_id: reading.id }),
        event({ kind: 'prize_hold', amount: -15, date: '2026-10-15', prize_claim_id: held.id }),
        event({ kind: 'correction_writeoff', amount: 3, date: '2026-10-14' }),
      ],
      [reading, piano],
      [held],
      '2026-10-20',
    )

    expect(lines.map((l) => [l.amount, l.label, l.when])).toEqual([
      [1, 'Reading check-in', 'Today'],
      [1, 'Piano — week complete', 'Today'],
      [7, 'Reading · 7-day streak bonus', 'Mon 19 Oct'],
      [5, 'Reading · 5-day streak bonus', 'Sat 17 Oct'],
      [5, 'Piano · 5-week streak bonus', 'Sat 17 Oct'],
      [-2, 'Streak saver for Reading', 'Fri 16 Oct'],
      [-15, 'Held for Pick Friday dinner', 'Thu 15 Oct'],
      [3, 'Fresh start after a parent’s change', 'Wed 14 Oct'],
    ])
    expect(new Set(lines.map((l) => l.key)).size).toBe(lines.length)
  })

  it('an approved hold reads as spent, and a release names its prize', () => {
    const approved = claim({ status: 'approved', decided_at: '2026-10-16T09:00:00+01:00' })
    const declined = claim({ id: 'declined', prize_title: 'Sleepover', status: 'declined' })
    const lines = historyLines(
      [
        event({ kind: 'prize_release', amount: 60, prize_claim_id: declined.id }),
        event({ kind: 'prize_hold', amount: -60, prize_claim_id: declined.id }),
        event({ kind: 'prize_hold', amount: -15, prize_claim_id: approved.id }),
      ],
      [],
      [approved, declined],
      '2026-10-21',
    )

    expect(lines.map((l) => l.label)).toEqual([
      'Back from Sleepover',
      'Held for Sleepover',
      'Spent on Pick Friday dinner',
    ])
  })

  it('falls back kindly when a habit or claim is no longer there', () => {
    const lines = historyLines(
      [
        event({ kind: 'streak_saver', amount: -1, habit_id: null }),
        event({ habit_id: 'deleted-habit' }),
        event({ kind: 'prize_hold', amount: -5, prize_claim_id: 'unknown' }),
      ],
      [],
      [],
      '2026-10-20',
    )

    expect(lines.map((l) => l.label)).toEqual([
      'Streak saver for a habit',
      'a habit check-in',
      'Held for a prize',
    ])
  })
})

describe('REQ-025 / REQ-026 claim status lines', () => {
  it('a child’s pending claim waits for a parent, shows the held gems, and can be cancelled', () => {
    expect(claimLine(claim(), mia, 2, TIMEZONE)).toMatchObject({
      title: 'Pick Friday dinner · 15 gems',
      status: 'Waiting for a parent · 15 gems held',
      canCancel: true,
    })
  })

  it('a parent’s own claim waits for the other parent, or for them in a one-parent family', () => {
    const own = claim({ member_id: dad.id })
    expect(claimLine(own, dad, 2, TIMEZONE).status).toBe(
      'Waiting for the other parent · 15 gems held',
    )
    expect(claimLine(own, dad, 1, TIMEZONE).status).toBe(
      'Waiting for you to decide in Approvals & prizes · 15 gems held',
    )
  })

  it.each([
    ['approved', 'Your prize is approved! · Mon 28 Sept'],
    ['declined', 'Not this time — your gems are back. · Mon 28 Sept'],
    ['cancelled', 'You cancelled this claim — your gems are back. · Mon 28 Sept'],
  ] as const)('a %s claim says so with the family day it was decided', (status, text) => {
    // 23:30 UTC is already the next day in London (BST, REQ-027).
    const line = claimLine(claim({ status, decided_at: '2026-09-27T23:30:00Z' }), mia, 2, TIMEZONE)
    expect(line.status).toBe(text)
    expect(line.canCancel).toBe(false)
  })

  it('uses the request day if a decided claim has no decision time', () => {
    const line = claimLine(claim({ status: 'cancelled' }), mia, 2, TIMEZONE)
    expect(line.status).toContain('Thu 15 Oct')
  })
})

describe('REQ-025 prize offers', () => {
  const prizes = [
    { id: 'a', title: 'Ice cream trip', gem_cost: 20 },
    { id: 'b', title: 'Pick the movie night film', gem_cost: 30 },
    { id: 'c', title: 'Exactly enough', gem_cost: 24 },
  ]

  it('can claim at or above the cost; otherwise counts the gems to go', () => {
    expect(prizeOffers(prizes, 24).map((o) => [o.affordable, o.toGo, o.progress])).toEqual([
      [true, 0, 1],
      [false, 6, 0.8],
      [true, 0, 1],
    ])
  })

  it('an empty balance has nothing claimable and an empty bar', () => {
    expect(prizeOffers(prizes, 0)[0]).toMatchObject({ affordable: false, toGo: 20, progress: 0 })
  })
})
