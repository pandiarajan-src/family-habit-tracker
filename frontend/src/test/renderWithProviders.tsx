import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { vi } from 'vitest'
import { AppRoutes } from '../App'
import { SessionProvider } from '../auth/SessionProvider'
import { LocationProbe } from './LocationProbe'

interface Options {
  route?: string
  idleTimeoutMs?: number
  /** Use when the test runs fake timers, so user-event advances them. */
  fakeTimers?: boolean
}

/** Renders the whole app (session + every route) at `route`, as a person would see it. */
export function renderApp({ route = '/', idleTimeoutMs, fakeTimers = false }: Options = {}) {
  const user = userEvent.setup(fakeTimers ? { advanceTimers: vi.advanceTimersByTime } : {})
  const result = render(
    <MemoryRouter initialEntries={[route]}>
      <SessionProvider idleTimeoutMs={idleTimeoutMs}>
        <AppRoutes />
        <LocationProbe />
      </SessionProvider>
    </MemoryRouter>,
  )
  return { user, ...result }
}
