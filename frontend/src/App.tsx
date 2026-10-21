import { type QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { type AnyRouter, RouterProvider } from '@tanstack/react-router'
import { HintProvider } from '@/components/ui/hint'
import { Toaster } from '@/components/ui/toaster'
import { useThemeEffect } from '@/lib/use-theme'

/** The providers every surface expects, in one place: the cache, the hint
 *  delays, the router and the toasts. */
export function App({ client, router }: { client: QueryClient; router: AnyRouter }) {
  useThemeEffect()
  return (
    <QueryClientProvider client={client}>
      <HintProvider>
        <RouterProvider router={router} />
        <Toaster />
      </HintProvider>
    </QueryClientProvider>
  )
}
