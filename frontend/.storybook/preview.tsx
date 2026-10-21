/// <reference types="vite/client" />
import type { Preview } from '@storybook/react-vite'
import { QueryClientProvider } from '@tanstack/react-query'
import { HintProvider } from '../src/components/ui/hint'
import { createQueryClient } from '../src/lib/query-client'
import '../src/fonts'
import '../src/index.css'

const client = createQueryClient()

const preview: Preview = {
  globalTypes: {
    theme: {
      description: 'Theme',
      toolbar: { icon: 'mirror', items: ['dark', 'light'], dynamicTitle: true },
    },
  },
  initialGlobals: { theme: 'dark' },
  decorators: [
    (Story, context) => {
      const theme = context.globals.theme === 'light' ? 'light' : 'dark'
      document.documentElement.className = theme
      return (
        <QueryClientProvider client={client}>
          <HintProvider>
            <div className="min-h-screen bg-surface-workspace p-6 text-foreground">
              <Story />
            </div>
          </HintProvider>
        </QueryClientProvider>
      )
    },
  ],
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'error' },
  },
}

export default preview
