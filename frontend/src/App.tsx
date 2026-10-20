import { useEffect, useState } from 'react'
import type { components } from './api/schema'
import { copy } from './copy'

type HealthState = 'checking' | 'ok' | 'unreachable'

type HealthRead = components['schemas']['HealthRead']

async function fetchHealth(signal: AbortSignal): Promise<HealthState> {
  try {
    const response = await fetch('/api/v1/health', { signal })
    if (!response.ok) return 'unreachable'
    const body = (await response.json()) as HealthRead
    return body.status === 'ok' ? 'ok' : 'unreachable'
  } catch {
    return 'unreachable'
  }
}

function App() {
  const [health, setHealth] = useState<HealthState>('checking')

  useEffect(() => {
    const controller = new AbortController()
    void fetchHealth(controller.signal).then((state) => {
      if (!controller.signal.aborted) setHealth(state)
    })
    return () => controller.abort()
  }, [])

  return (
    <main className="app">
      <h1>{copy.appTitle}</h1>
      <p role="status">{copy.health[health]}</p>
    </main>
  )
}

export default App
