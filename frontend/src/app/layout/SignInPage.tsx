/**
 * What a tab without a credential sees. The deployment issues bearer tokens;
 * this page installs one for the tab. Locally the backend's dev auth mode
 * accepts any request and this page never shows.
 */
import { KeyRound } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/input'
import { Panel } from '@/components/ui/panel'
import { useAuthStore } from '@/features/auth/auth-store'

export function SignInPage({ appName }: { appName: string }) {
  const [token, setToken] = useState('')
  return (
    <main className="grid h-screen place-items-center bg-surface-chrome px-6">
      <Panel tone="framed" pad="lg" className="flex w-full max-w-sm flex-col gap-5 p-6">
        <div className="flex flex-col gap-1.5">
          <span className="font-display font-stretch-125% text-[28px] font-bold tracking-[-0.01em] text-foreground">
            {appName}
          </span>
          <p className="text-sm text-muted-foreground">
            Paste the access token your deployment issued.
          </p>
        </div>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            if (token.trim()) useAuthStore.getState().signIn(token.trim())
          }}
        >
          <Field label="Access token" htmlFor="sign-in-token">
            <Input
              id="sign-in-token"
              type="password"
              autoComplete="off"
              value={token}
              onChange={(event) => setToken(event.target.value)}
            />
          </Field>
          <Button type="submit" mutates={false} disabled={!token.trim()}>
            <KeyRound aria-hidden="true" className="h-4 w-4" />
            Sign in
          </Button>
        </form>
      </Panel>
    </main>
  )
}
