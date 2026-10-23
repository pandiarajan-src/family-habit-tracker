import { describe, expect, it } from 'vitest'
import { addDays, familyDate, formatLongDay, formatShortDay, mondayOf } from './dates'

describe('REQ-027 family dates on My day', () => {
  it("is the family's calendar date, not the device's", () => {
    expect(familyDate(Date.parse('2026-10-20T09:00:00Z'), 'Europe/London')).toBe('2026-10-20')
    // 23:30 UTC on Sunday 25 Oct is already Monday in Auckland.
    expect(familyDate(Date.parse('2026-10-25T23:30:00Z'), 'Pacific/Auckland')).toBe('2026-10-26')
    // 23:30 on Sunday in London (GMT after the clocks change) is still Sunday.
    expect(familyDate(Date.parse('2026-10-25T23:30:00Z'), 'Europe/London')).toBe('2026-10-25')
  })

  it('adds days across months, years and DST changes', () => {
    expect(addDays('2026-10-20', -1)).toBe('2026-10-19')
    expect(addDays('2026-11-01', -1)).toBe('2026-10-31')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-10-25', 1)).toBe('2026-10-26')
  })

  it('REQ-017 finds the Monday that starts the week', () => {
    expect(mondayOf('2026-10-19')).toBe('2026-10-19')
    expect(mondayOf('2026-10-20')).toBe('2026-10-19')
    expect(mondayOf('2026-10-25')).toBe('2026-10-19')
    expect(mondayOf('2026-10-26')).toBe('2026-10-26')
  })

  it('formats days the way the screens say them', () => {
    expect(formatShortDay('2026-10-13')).toBe('Tue 13 Oct')
    expect(formatLongDay('2026-10-19')).toBe('Monday 19 October')
  })
})
