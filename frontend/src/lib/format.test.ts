import { renderHook, act } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TIMEZONE, TODAY } from '../test/fixtures'
import { formatClockTime, formatLongDate, formatUpdatedAgo, minutesFromSeconds } from './format'
import { useNow } from './useNow'

describe('REQ-027 family dates', () => {
  it('formats the family day', () => {
    expect(formatLongDate(TODAY.getTime(), TIMEZONE)).toBe('Tuesday 20 October')
    // 23:30 UTC on the 20th is already the 21st in Auckland.
    expect(formatLongDate(Date.parse('2026-10-20T23:30:00Z'), 'Pacific/Auckland')).toBe(
      'Wednesday 21 October',
    )
  })

  it('formats a clock time as "9:42 pm"', () => {
    const local = new Date(2026, 9, 20, 21, 42).getTime()
    expect(formatClockTime(local)).toBe('9:42 pm')
  })
})

describe('REQ-012 "Updated … ago"', () => {
  it.each([
    [0, 'Updated just now'],
    [-500, 'Updated just now'],
    [9_999, 'Updated just now'],
    [10_000, 'Updated 10 seconds ago'],
    [59_000, 'Updated 50 seconds ago'],
    [60_000, 'Updated 1 minute ago'],
    [150_000, 'Updated 2 minutes ago'],
  ])('%i ms → %s', (elapsed, text) => {
    expect(formatUpdatedAgo(elapsed)).toBe(text)
  })
})

describe('waits', () => {
  it('rounds Retry-After up to whole minutes, at least 1', () => {
    expect(minutesFromSeconds(300)).toBe(5)
    expect(minutesFromSeconds(241)).toBe(5)
    expect(minutesFromSeconds(0)).toBe(1)
  })
})

describe('useNow', () => {
  it('ticks on its interval', () => {
    vi.useFakeTimers({ now: TODAY })
    const { result } = renderHook(() => useNow(1000))
    expect(result.current).toBe(TODAY.getTime())

    act(() => vi.advanceTimersByTime(1000))

    expect(result.current).toBe(TODAY.getTime() + 1000)
  })
})
