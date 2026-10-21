import { describe, expect, it } from 'vitest'
import { copy } from './copy'

// Calls every copy function with sample arguments so templates are checked too.
function allStrings(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (typeof value === 'function') return allStrings(value(3, 5))
  if (value && typeof value === 'object') return Object.values(value).flatMap(allStrings)
  return []
}

describe('family-ux #6 kind copy', () => {
  const strings = allStrings(copy)

  it('collects the copy', () => {
    expect(strings.length).toBeGreaterThan(40)
    expect(strings).toContain("That passcode didn't work — try again")
  })

  it.each(['failed', 'fail', 'missed', 'bad'])('never says "%s"', (word) => {
    const offending = strings.filter((s) => new RegExp(`\\b${word}\\b`, 'i').test(s))
    expect(offending).toEqual([])
  })

  it('pluralises counts', () => {
    expect(copy.gems.count(1)).toBe('1 gem')
    expect(copy.gems.count(24)).toBe('24 gems')
    expect(copy.habit.days(1)).toBe('1 day')
    expect(copy.habit.weeks(2)).toBe('2 weeks')
    expect(copy.pin.locked(1)).toContain('1 minute.')
  })
})
