import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { POLL_INTERVAL_MS, usePolling, useResource, type Loader, type LoadOptions } from './hooks'

describe('useResource', () => {
  it('loads on mount as a person-initiated request', async () => {
    const load = vi.fn<Loader<string>>(async () => 'data')

    const { result } = renderHook(() => useResource('k', load))

    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.data).toBe('data'))
    expect(result.current.loading).toBe(false)
    expect(result.current.error).toBeNull()
    expect(load.mock.calls[0][0].background).toBe(false)
  })

  it('keeps the last data and reports the error when a refresh fails', async () => {
    const load = vi
      .fn<(o: LoadOptions) => Promise<string>>()
      .mockResolvedValueOnce('first')
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce('third')
    const { result } = renderHook(() => useResource('k', load))
    await waitFor(() => expect(result.current.data).toBe('first'))

    await act(() => result.current.reload({ background: true }))

    expect(result.current.data).toBe('first')
    expect(result.current.error).toEqual(new Error('offline'))
    expect(load.mock.calls[1][0].background).toBe(true)

    await act(() => result.current.reload())
    expect(result.current.data).toBe('third')
    expect(result.current.error).toBeNull()
  })

  it('reports a first-load error with no data', async () => {
    const { result } = renderHook(() => useResource('k', () => Promise.reject(new Error('x'))))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.data).toBeUndefined()
    expect(result.current.error).toEqual(new Error('x'))
  })

  it('aborts a load that a newer one replaces, and ignores its answer', async () => {
    let resolveFirst: (value: string) => void = () => {}
    const signals: AbortSignal[] = []
    const load = vi.fn((options: LoadOptions) => {
      signals.push(options.signal)
      return signals.length === 1
        ? new Promise<string>((resolve) => (resolveFirst = resolve))
        : Promise.resolve('second')
    })
    const { result } = renderHook(() => useResource('k', load))

    await act(() => result.current.reload())
    resolveFirst('first')

    expect(signals[0].aborted).toBe(true)
    await waitFor(() => expect(result.current.data).toBe('second'))
  })

  it('ignores a failure from an aborted load', async () => {
    let rejectFirst: (error: Error) => void = () => {}
    const load = vi.fn(() => new Promise<string>((_, reject) => (rejectFirst = reject)))
    const { result, unmount } = renderHook(() => useResource('k', load))

    unmount()
    rejectFirst(new Error('late'))

    await waitFor(() => expect(load).toHaveBeenCalledTimes(1))
    expect(result.current.error).toBeNull()
  })

  it('drops the old data when the key changes', async () => {
    const { result, rerender } = renderHook(
      ({ id }) => useResource(id, async () => `data for ${id}`),
      { initialProps: { id: 'a' } },
    )
    await waitFor(() => expect(result.current.data).toBe('data for a'))

    rerender({ id: 'b' })

    expect(result.current.data).toBeUndefined()
    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.data).toBe('data for b'))
  })

  it('keeps no stale data when a new key fails', async () => {
    const { result, rerender } = renderHook(
      ({ id }) =>
        useResource(id, async () => {
          if (id === 'b') throw new Error('nope')
          return 'a'
        }),
      { initialProps: { id: 'a' } },
    )
    await waitFor(() => expect(result.current.data).toBe('a'))

    rerender({ id: 'b' })

    await waitFor(() => expect(result.current.error).toEqual(new Error('nope')))
    expect(result.current.data).toBeUndefined()
  })
})

describe('REQ-012 usePolling', () => {
  it('refreshes in the background every 30 seconds', () => {
    vi.useFakeTimers()
    const refresh = vi.fn()
    renderHook(() => usePolling(refresh))

    vi.advanceTimersByTime(POLL_INTERVAL_MS - 1)
    expect(refresh).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(refresh).toHaveBeenCalledWith({ background: true })
  })

  it('refreshes when the window regains focus or the page becomes visible', () => {
    const refresh = vi.fn()
    renderHook(() => usePolling(refresh))
    const visibility = vi.spyOn(document, 'visibilityState', 'get')

    window.dispatchEvent(new Event('focus'))
    visibility.mockReturnValue('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    visibility.mockReturnValue('visible')
    document.dispatchEvent(new Event('visibilitychange'))

    expect(refresh).toHaveBeenCalledTimes(2)
    expect(refresh).toHaveBeenLastCalledWith({ background: true })
  })

  it('stops after unmounting', () => {
    vi.useFakeTimers()
    const refresh = vi.fn()
    const { unmount } = renderHook(() => usePolling(refresh, 1000))

    unmount()
    vi.advanceTimersByTime(5000)
    window.dispatchEvent(new Event('focus'))

    expect(refresh).not.toHaveBeenCalled()
  })
})
