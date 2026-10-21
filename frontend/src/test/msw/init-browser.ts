/**
 * MSW mode: answer every API request from the in-browser mock.
 *
 * On with `VITE_USE_MSW=true`, or `?msw=1` for one tab (`?msw=0` turns it back
 * off). `?as=<principal>` picks who the mock answers as. Never in a production
 * build: the branch is constant-folded away.
 */
import { mockActive, mockPrincipal, setMockActive } from './principal'

/** A little wait on every answer, so loading states are seen. */
const BROWSER_LATENCY_MS = 120

export async function startMswIfRequested(): Promise<void> {
  if (import.meta.env.PROD) return
  const asked = new URLSearchParams(window.location.search).get('msw')
  if (asked === '0') setMockActive(false)
  if (asked === '1' || import.meta.env.VITE_USE_MSW === 'true') setMockActive(true)
  if (!mockActive()) return

  mockPrincipal()
  const [{ worker }, { setLatency }] = await Promise.all([
    import('./browser'),
    import('./handlers'),
  ])
  setLatency(BROWSER_LATENCY_MS)
  await worker.start({ onUnhandledFrame: 'bypass', quiet: true })
}
