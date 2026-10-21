import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        'inline-flex h-4 min-w-4 items-center justify-center rounded-[4px] bg-foreground/[0.06] px-1',
        'font-mono text-nano leading-none text-dim-foreground tabular-nums',
        className,
      )}
    >
      {children}
    </kbd>
  )
}
