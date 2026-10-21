import { copy } from '../copy'

/** "Tuesday 20 October" for the family's day (REQ-027). */
export function formatLongDate(instant: number, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone,
  }).format(instant)
}

/** "9:42 pm" on this device's clock. */
export function formatClockTime(instant: number): string {
  return new Intl.DateTimeFormat('en-GB', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(instant)
}

/** "Updated just now" / "Updated 20 seconds ago" / "Updated 2 minutes ago", in 10 s steps. */
export function formatUpdatedAgo(elapsedMs: number): string {
  const seconds = Math.max(0, Math.floor(elapsedMs / 1000))
  if (seconds < 10) return copy.board.updatedNow
  if (seconds < 60) return copy.board.updatedSeconds(Math.floor(seconds / 10) * 10)
  return copy.board.updatedMinutes(Math.floor(seconds / 60))
}

/** Whole minutes, rounded up, for a `Retry-After` wait ("try again in 5 minutes"). */
export function minutesFromSeconds(seconds: number): number {
  return Math.max(1, Math.ceil(seconds / 60))
}
