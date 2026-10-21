import { QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vite-plus/test'
import { IdentityChangedError } from '@/lib/api-client'
import { createQueryClient } from '@/lib/query-client'
import { useIdentityBoundMutation } from './use-identity-bound-mutation'
import { useViewAsStore } from './view-as'

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={createQueryClient()}>{children}</QueryClientProvider>
}

/** A request that waits mid-flight until the test lets it go. */
function gated() {
  let release: () => void = () => {}
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const sending = vi.fn()
  return { gate, release, sending }
}

describe('useIdentityBoundMutation', () => {
  it('sends and settles when nothing moved', async () => {
    const onSuccess = vi.fn()
    const { result } = renderHook(
      () =>
        useIdentityBoundMutation({
          mutationFn: async (_: void, ensureCurrent) => {
            ensureCurrent()
            return 'sent'
          },
          onSuccess,
        }),
      { wrapper },
    )
    act(() => result.current.mutate())
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(onSuccess).toHaveBeenCalledOnce()
  })

  it('refuses to send once the lens has moved under it', async () => {
    const { gate, release, sending } = gated()
    const sent = vi.fn()
    const onSuccess = vi.fn()
    const { result } = renderHook(
      () =>
        useIdentityBoundMutation({
          mutationFn: async (_: void, ensureCurrent) => {
            sending()
            await gate
            ensureCurrent()
            sent()
            return 'sent'
          },
          onSuccess,
        }),
      { wrapper },
    )
    act(() => result.current.mutate())
    await waitFor(() => expect(sending).toHaveBeenCalled())
    act(() => useViewAsStore.getState().setViewAs('grace@example.com'))
    release()
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toBeInstanceOf(IdentityChangedError)
    expect(sent).not.toHaveBeenCalled()
    expect(onSuccess).not.toHaveBeenCalled()
  })

  it('keeps an outlived success out of the cache it would have touched', async () => {
    const { gate, release, sending } = gated()
    const onSuccess = vi.fn()
    const { result } = renderHook(
      () =>
        useIdentityBoundMutation({
          mutationFn: async () => {
            sending()
            await gate
            return 'answered'
          },
          onSuccess,
        }),
      { wrapper },
    )
    act(() => result.current.mutate())
    await waitFor(() => expect(sending).toHaveBeenCalled())
    act(() => useViewAsStore.getState().setViewAs('alan@example.com'))
    release()
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(onSuccess).not.toHaveBeenCalled()
  })
})
