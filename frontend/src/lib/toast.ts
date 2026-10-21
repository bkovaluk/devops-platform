/**
 * Toasts, raised from anywhere — a hook, a handler, a module with no React in
 * it — and drawn by the one `Toaster` at the root (Base UI Toast with a
 * global manager). An error is announced assertively; the rest politely.
 *
 * A change that worked, or a mutation that failed, is said through
 * `lib/notify.ts` (`notifyWithLink`, `notifyFailure`) rather than here.
 */
import { Toast } from '@base-ui/react/toast'
import type { ReactNode } from 'react'

export type ToastTone = 'success' | 'info' | 'error'

export interface ToastOptions {
  description?: ReactNode
  /** Raising a toast whose id is already showing replaces it, so a repeat
   *  says it once. */
  id?: string
  /** How long it stays, in ms. */
  timeout?: number
}

export const toastManager = Toast.createToastManager()

function raise(type: ToastTone) {
  return (title: string, options: ToastOptions = {}): void => {
    toastManager.add({ type, title, priority: type === 'error' ? 'high' : 'low', ...options })
  }
}

export const toast = {
  success: raise('success'),
  info: raise('info'),
  error: raise('error'),
}
