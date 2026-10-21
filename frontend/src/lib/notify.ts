/**
 * Toasts for the outcome of a change.
 *
 * `notifyWithLink` is the "it worked, here is where it lives" pattern: the
 * title in the caller's voice, then a row with the shareable URL to open or
 * copy. Each tool wraps it in its own `*-toast.ts` so the titles live beside
 * the hooks that raise them; this module stays free of any tool's words.
 */
import { createElement } from 'react'
import { ToastLinkRow } from '@/components/ui/toast-link-row'
import { isHandled } from './api-client'
import { buildResourceLink, type ResourceLink } from './resource-links'
import { toast } from './toast'

interface NotifyWithLinkArgs {
  title: string
  resource: ResourceLink
  type?: 'success' | 'info'
  /** Defaults to "Copy link". */
  copyLabel?: string
  /** Shown before the copy action as a direct link, when given. */
  linkLabel?: string
}

export function notifyWithLink({
  title,
  resource,
  type = 'success',
  copyLabel,
  linkLabel,
}: NotifyWithLinkArgs): void {
  const url = buildResourceLink(resource)
  toast[type](title, {
    description: createElement(ToastLinkRow, { url, label: copyLabel, linkLabel }),
    timeout: 12_000,
  })
}

/**
 * A change's failure, said once. The API client already explains the
 * refusals only it can (a request dropped because the identity moved) and
 * marks them handled; a surface that toasted anyway would say it twice.
 */
export function notifyFailure(title: string, error: unknown): void {
  if (isHandled(error)) return
  toast.error(title, {
    description: error instanceof Error ? error.message : String(error),
  })
}
