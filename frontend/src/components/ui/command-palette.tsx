/**
 * ⌘K / Ctrl+K. The palette is a frame: "Go to" and the commands come from the
 * tool registry, filtered by what the principal can open, and every results
 * group below them is a tool's own palette contribution, mounted only for
 * tools the principal can open — so a denied tool costs no request.
 */
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog'
import { useNavigate } from '@tanstack/react-router'
import { Command } from 'cmdk'
import { Search } from 'lucide-react'
import { useState } from 'react'
import { useScopes } from '@/features/auth/use-scopes'
import { PALETTE_ROW_CLASS, PaletteGroup, SelectionMark } from '@/features/tools/palette-parts'
import { commandsFor, contributorsOf, navFor } from '@/features/tools/tool-registry'
import { cn } from '@/lib/utils'
import { useUIStore } from '@/stores/ui-store'
import { OVERLAY_BACKDROP } from './dialog'
import { Kbd } from './kbd'

export function CommandPalette() {
  const open = useUIStore((state) => state.commandPaletteOpen)
  const setOpen = useUIStore((state) => state.setCommandPaletteOpen)
  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className={OVERLAY_BACKDROP} />
        <DialogPrimitive.Popup
          className={cn(
            'glass fixed top-[14vh] left-1/2 z-50 w-[calc(100vw-2rem)] max-w-[600px] -translate-x-1/2 overflow-hidden rounded-xl shadow-overlay outline-none',
            'transition-[opacity,translate] duration-[var(--duration-slide)] ease-[var(--ease-slide)]',
            'starting:-translate-y-2 starting:opacity-0 data-ending-style:opacity-0',
          )}
        >
          <DialogPrimitive.Title className="sr-only">Command palette</DialogPrimitive.Title>
          <PaletteBody onClose={() => setOpen(false)} />
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

function PaletteBody({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('')
  const grants = useScopes()
  const navigate = useNavigate()
  const tools = navFor(grants)
  const commands = commandsFor(grants)
  const contributors = contributorsOf(grants, 'palette')

  return (
    <Command label="Command palette" loop>
      <div className="flex h-12 items-center gap-3 border-b border-border px-4">
        <Search aria-hidden="true" className="h-4 w-4 shrink-0 text-dim-foreground" />
        <Command.Input
          value={query}
          onValueChange={setQuery}
          placeholder="Search or jump to…"
          className="h-full flex-1 bg-transparent text-sm text-foreground placeholder:text-dim-foreground outline-none"
        />
        <Kbd>esc</Kbd>
      </div>
      <Command.List className="max-h-[min(60vh,420px)] overflow-y-auto p-2">
        <Command.Empty className="px-3 py-6 text-center text-xs text-dim-foreground">
          Nothing matches “{query}”.
        </Command.Empty>
        <PaletteGroup heading="Go to" count={tools.length}>
          {tools.map((tool, index) => (
            <Command.Item
              key={tool.id}
              value={`go ${tool.label}`}
              onSelect={() => {
                void navigate({ to: tool.path })
                onClose()
              }}
              className={PALETTE_ROW_CLASS}
            >
              <SelectionMark />
              <tool.icon aria-hidden="true" className={cn('h-4 w-4 shrink-0', tool.accent)} />
              <span className="flex-1 text-sm text-foreground">{tool.label}</span>
              <Kbd>{index + 1}</Kbd>
            </Command.Item>
          ))}
        </PaletteGroup>
        {commands.length > 0 && (
          <PaletteGroup heading="Commands" count={commands.length}>
            {commands.map((command) => (
              <Command.Item
                key={command.id}
                value={`${command.label} ${command.hint}`}
                onSelect={() => {
                  command.run(navigate)
                  onClose()
                }}
                className={PALETTE_ROW_CLASS}
              >
                <SelectionMark />
                <command.icon
                  aria-hidden="true"
                  className={cn('h-4 w-4 shrink-0 text-muted-foreground', command.iconClassName)}
                />
                <span className="text-sm text-foreground">{command.label}</span>
                <span className="ml-auto truncate text-xs text-dim-foreground">{command.hint}</span>
              </Command.Item>
            ))}
          </PaletteGroup>
        )}
        {contributors.map(({ id, contributions }) => {
          const Palette = contributions.palette
          return <Palette key={id} query={query} onSelected={onClose} />
        })}
      </Command.List>
    </Command>
  )
}
