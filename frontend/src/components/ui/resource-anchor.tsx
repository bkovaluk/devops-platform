/**
 * A link to anything `lib/resource-links.ts` can address. A real anchor —
 * middle-click and "copy link" work — that navigates in place through the
 * router on a plain click.
 */
import { useRouter } from '@tanstack/react-router'
import type * as React from 'react'
import { type ResourceLink, resourcePath } from '@/lib/resource-links'

interface ResourceAnchorProps extends Omit<React.ComponentProps<'a'>, 'href' | 'resource'> {
  resource: ResourceLink
}

export function ResourceAnchor({ resource, onClick, children, ...props }: ResourceAnchorProps) {
  const router = useRouter()
  const href = resourcePath(resource)
  return (
    <a
      href={href}
      onClick={(event) => {
        onClick?.(event)
        if (event.defaultPrevented || event.button !== 0) return
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
        event.preventDefault()
        void router.navigate({ href })
      }}
      {...props}
    >
      {children}
    </a>
  )
}
