/**
 * Rendering for tests. `renderApp(path)` mounts the whole app — providers,
 * router, shell — at a URL, answered by the MSW handlers, as the principal
 * `as` names. `renderUi(element)` mounts one component with the providers a
 * primitive expects, for anything that needs no route.
 */
import { QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory } from '@tanstack/react-router'
import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement } from 'react'
import { App } from '@/App'
import { HintProvider } from '@/components/ui/hint'
import '@/features/auth/identity-cache'
import { queryClient } from '@/lib/query-client'
import { createAppRouter } from '@/router'
import { setMockPrincipal } from './msw/principal'

export function renderApp(path: string, { as = 'admin' }: { as?: string } = {}) {
  setMockPrincipal(as)
  const router = createAppRouter(queryClient, createMemoryHistory({ initialEntries: [path] }))
  const user = userEvent.setup()
  const view = render(<App client={queryClient} router={router} />)
  return { ...view, user, router }
}

export function renderUi(element: ReactElement) {
  const user = userEvent.setup()
  const view = render(
    <QueryClientProvider client={queryClient}>
      <HintProvider>{element}</HintProvider>
    </QueryClientProvider>,
  )
  return { ...view, user }
}
