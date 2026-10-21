import { Switch as SwitchPrimitive } from '@base-ui/react/switch'
import type * as React from 'react'
import { cn } from '@/lib/utils'

type SwitchProps = Omit<
  React.ComponentProps<typeof SwitchPrimitive.Root>,
  'render' | 'nativeButton' | 'className'
> & { className?: string }

/** On/off. The "on" fill is the signal token, so it holds on both ramps. A
 *  native button, so a sibling `<label htmlFor>` names it. */
export function Switch({ className, ...props }: SwitchProps) {
  return (
    <SwitchPrimitive.Root
      nativeButton
      render={(buttonProps) => <button type="button" {...buttonProps} />}
      className={cn(
        'inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full bg-muted p-0.5 transition-colors duration-[var(--duration-fast)]',
        'data-checked:bg-signal focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="block h-4 w-4 rounded-full bg-foreground shadow-sm transition-transform duration-[var(--duration-fast)] data-checked:translate-x-4 data-checked:bg-background" />
    </SwitchPrimitive.Root>
  )
}
