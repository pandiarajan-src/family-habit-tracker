import { useEffect, useState } from 'react'

/** The current time (ms), updated every `intervalMs` so relative labels stay fresh. */
export function useNow(intervalMs: number = 5000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(timer)
  }, [intervalMs])
  return now
}
