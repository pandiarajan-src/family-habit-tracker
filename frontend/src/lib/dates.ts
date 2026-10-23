// Family dates as ISO strings ("2026-10-20"), mirroring app/domain/dates.py (REQ-027).
// Date-only arithmetic runs in UTC so it never shifts across a DST change.

const DAY_MS = 86_400_000

/** The family's calendar date at `instant`. */
export function familyDate(instant: number, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone,
  }).format(instant)
}

const toUtc = (day: string) => Date.parse(`${day}T00:00:00Z`)
const fromUtc = (ms: number) => new Date(ms).toISOString().slice(0, 10)

export function addDays(day: string, days: number): string {
  return fromUtc(toUtc(day) + days * DAY_MS)
}

/** The Monday that starts `day`'s family week (ISO-8601). */
export function mondayOf(day: string): string {
  const weekday = (new Date(toUtc(day)).getUTCDay() + 6) % 7
  return addDays(day, -weekday)
}

/** "Tue 14 Oct" */
export function formatShortDay(day: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(toUtc(day))
}

/** "Monday 19 October" */
export function formatLongDay(day: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(toUtc(day))
}
