import { describe, expect, it } from 'vitest'
import type { MemberRead, PrizeClaimRead } from '../api/types'
import { dad, habit, kavi, members, mia, mum, TIMEZONE } from '../test/fixtures'
import {
  approvalLines,
  isOnlyParent,
  isSingleEmoji,
  memberChanges,
  memberForm,
  memberFormError,
  ownClaimsNote,
  prizeBody,
  prizeForm,
  prizeFormError,
  prizesWithPendingClaims,
  removalList,
  resetPinError,
  timezoneGroups,
  zoneLabel,
} from './parent'

function claim(overrides: Partial<PrizeClaimRead>): PrizeClaimRead {
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

describe('REQ-026 approval lines', () => {
  it('names the claimant and the prize, with the held gems and the day it was asked', () => {
    const [line] = approvalLines([claim({})], members, mum, TIMEZONE)
    expect(line.title).toBe('Mia · Pick Friday dinner')
    expect(line.meta).toBe('15 gems held · asked Thu 15 Oct')
    expect(line.emoji).toBe('🐬')
    expect(line.approve).toBe('Approve Mia’s Pick Friday dinner')
    expect(line.declineFor).toBe('for Mia’s Pick Friday dinner')
    expect(line.approved).toBe('Mia’s Pick Friday dinner is approved. Enjoy!')
    expect(line.declined).toBe(
      'Not this time for Mia’s Pick Friday dinner. The gems are back with Mia.',
    )
  })

  it("leaves a parent's own claim to the other parent in a two-parent family (C5)", () => {
    const [line] = approvalLines(
      [claim({ member_id: mum.id, prize_title: 'Spa afternoon' })],
      members,
      mum,
      TIMEZONE,
    )
    expect(line.title).toBe('You · Spa afternoon')
    expect(line.approve).toBeNull()
  })

  it('lets the only parent decide their own claim (C5)', () => {
    const family = [mum, mia, kavi]
    const [line] = approvalLines(
      [claim({ member_id: mum.id, prize_title: 'Spa afternoon' })],
      family,
      mum,
      TIMEZONE,
    )
    expect(line.approve).toBe('Approve your Spa afternoon')
    expect(line.declineFor).toBe('for your Spa afternoon')
    expect(line.approved).toBe('Your Spa afternoon is approved. Enjoy!')
    expect(line.declined).toBe('Not this time for your Spa afternoon. Your gems are back.')
  })

  it('skips decided claims and names an unknown claimant kindly', () => {
    const lines = approvalLines(
      [claim({ status: 'approved' }), claim({ id: 'x', member_id: 'gone' })],
      members,
      mum,
      TIMEZONE,
    )
    expect(lines).toHaveLength(1)
    expect(lines[0].title).toBe('A family member · Pick Friday dinner')
    expect(lines[0].emoji).toBe('🙂')
  })

  it('says who decides your own claims', () => {
    expect(ownClaimsNote(mum, members)).toBe(
      'Your own claims are decided by Dad, and Dad’s by you.',
    )
    expect(ownClaimsNote(mum, [mum, mia])).toMatch(/only parent/)
    const third: MemberRead = { ...dad, id: 'p3', nickname: 'Gran' }
    expect(ownClaimsNote(mum, [...members, third])).toBe(
      'Your own claims are decided by another parent.',
    )
  })
})

describe('REQ-024 prizes', () => {
  it('finds prizes with a pending claim', () => {
    const locked = prizesWithPendingClaims([
      claim({}),
      claim({ id: 'b', prize_id: 'p2', status: 'declined' }),
      claim({ id: 'c', prize_id: null }),
    ])
    expect([...locked]).toEqual(['40000000-0000-4000-8000-000000000001'])
  })

  it('checks the name (1–40) and a whole-number cost (1–10,000) like the server', () => {
    const ok = { title: '  Ice cream trip ', cost: ' 20 ' }
    expect(prizeFormError(ok)).toBeNull()
    expect(prizeBody(ok)).toEqual({ title: 'Ice cream trip', gem_cost: 20 })
    expect(prizeFormError({ title: '  ', cost: '5' })?.field).toBe('title')
    expect(prizeFormError({ title: 'x'.repeat(41), cost: '5' })?.field).toBe('title')
    expect(prizeFormError({ title: '🍦'.repeat(40), cost: '5' })).toBeNull()
    for (const cost of ['', '0', '10001', '2.5', '-3', 'ten']) {
      expect(prizeFormError({ title: 'Ok', cost })?.field).toBe('cost')
    }
    expect(prizeFormError({ title: 'Ok', cost: '10000' })).toBeNull()
  })

  it('starts empty, or from the prize being edited', () => {
    expect(prizeForm()).toEqual({ title: '', cost: '' })
    expect(prizeForm({ id: 'p', title: 'Book', gem_cost: 40 })).toEqual({
      title: 'Book',
      cost: '40',
    })
  })
})

describe('REQ-006 member form', () => {
  it('accepts one emoji only', () => {
    for (const ok of ['🦊', '👨‍👩‍👧', '👍🏽', '🇬🇧', '❤️']) expect(isSingleEmoji(ok)).toBe(true)
    for (const bad of ['', 'a', '🦊🦊', '1️⃣', 'x🦊', ' ']) expect(isSingleEmoji(bad)).toBe(false)
  })

  it('checks nickname, avatar and, for a new member, the PIN', () => {
    const form = { nickname: 'Nana', avatar: '🦊', role: 'parent' as const, pin: '1234' }
    expect(memberFormError(form, members, null)).toBeNull()
    expect(memberFormError({ ...form, nickname: ' ' }, members, null)?.field).toBe('nickname')
    expect(memberFormError({ ...form, nickname: 'x'.repeat(21) }, members, null)?.field).toBe(
      'nickname',
    )
    expect(memberFormError({ ...form, nickname: 'mia' }, members, null)?.message).toMatch(
      /already has that nickname/,
    )
    expect(memberFormError({ ...form, avatar: 'N' }, members, null)?.field).toBe('avatar')
    expect(memberFormError({ ...form, pin: '12a4' }, members, null)?.field).toBe('pin')
  })

  it('lets a member keep their own nickname and needs no PIN when editing', () => {
    const form = { ...memberForm(mia), nickname: 'MIA' }
    expect(memberFormError(form, members, mia)).toBeNull()
  })

  it('sends only what changed', () => {
    expect(memberChanges(memberForm(mia), mia)).toEqual({})
    expect(
      memberChanges({ nickname: ' Mimi ', avatar: '🐳', role: 'parent', pin: '' }, mia),
    ).toEqual({
      nickname: 'Mimi',
      avatar_emoji: '🐳',
      role: 'parent',
    })
    expect(memberForm()).toEqual({ nickname: '', avatar: '', role: 'child', pin: '' })
  })

  it('knows the only parent', () => {
    expect(isOnlyParent(mum, members)).toBe(false)
    expect(isOnlyParent(mum, [mum, mia])).toBe(true)
    expect(isOnlyParent(mia, [mum, mia])).toBe(false)
  })
})

describe('REQ-005 reset a child’s PIN', () => {
  it('needs 4 numbers, typed the same twice', () => {
    expect(resetPinError('1234', '1234')).toBeNull()
    expect(resetPinError('12a4', '12a4')?.field).toBe('next')
    expect(resetPinError('1234', '4321')).toEqual({
      field: 'again',
      message: 'Those two PINs don’t match yet — try typing the new one again',
    })
  })
})

describe('REQ-007 what removing a member deletes', () => {
  it('lists their habits, savers, gems, claims, PIN and change notes', () => {
    const habits = [habit(kavi), habit(kavi, { archived: true }), habit(mia)]
    expect(removalList({ ...kavi, gem_balance: 38 }, habits)).toEqual([
      '2 habits and every check-in',
      'All streak savers',
      'Gem history and a balance of 38 gems',
      'Prize claims, waiting or decided',
      'Kavi’s PIN',
      'Notes about changes parents made for Kavi',
    ])
    expect(removalList(dad, [])[0]).toBe('Every habit and check-in')
  })
})

describe('REQ-027 timezone choices', () => {
  it('labels zones by city', () => {
    expect(zoneLabel('Europe/London')).toBe('London')
    expect(zoneLabel('America/Argentina/Buenos_Aires')).toBe('Argentina — Buenos Aires')
    expect(zoneLabel('UTC')).toBe('UTC')
  })

  it('groups by region and always includes the current zone', () => {
    const groups = timezoneGroups('Europe/Kiev', ['UTC', 'Europe/London', 'America/New_York'])
    expect(groups.map((g) => g.region)).toEqual(['America', 'Europe', 'Other'])
    expect(groups[1].zones.map((z) => z.id)).toEqual(['Europe/Kiev', 'Europe/London'])
    expect(timezoneGroups('UTC', ['UTC'])).toEqual([
      { region: 'Other', zones: [{ id: 'UTC', label: 'UTC' }] },
    ])
  })
})
