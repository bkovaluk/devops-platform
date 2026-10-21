import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './fonts'
import './index.css'
import '@/features/auth/identity-cache'
import { queryClient } from '@/lib/query-client'
import { router } from '@/router'
import { startMswIfRequested } from '@/test/msw/init-browser'
import { App } from './App'

const root = document.getElementById('root')
if (!root) throw new Error('index.html has no #root element')

// The mock answers before the first request leaves, or not at all.
await startMswIfRequested()

createRoot(root).render(
  <StrictMode>
    <App client={queryClient} router={router} />
  </StrictMode>,
)
