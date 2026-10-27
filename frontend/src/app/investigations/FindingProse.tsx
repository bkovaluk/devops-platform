/**
 * The agent's written finding, which arrives as light Markdown: paragraphs,
 * bullet lines, bold leads and backticked names. Those few shapes are drawn
 * as elements; everything else is plain text, and nothing the model wrote is
 * ever rendered as markup.
 */
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

const INLINE = /(`[^`]+`|\*\*[^*]+\*\*)/g

function inline(text: string): ReactNode[] {
  return text.split(INLINE).map((part, index) => {
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return (
        <code key={index} className="rounded-sm bg-accent px-1 font-mono text-[0.85em]">
          {part.slice(1, -1)}
        </code>
      )
    }
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <strong key={index} className="font-semibold">
          {part.slice(2, -2)}
        </strong>
      )
    }
    return part
  })
}

const BULLET = /^\s*[-*]\s+/

export function FindingProse({ text, className }: { text: string; className?: string }) {
  const blocks = text.trim().split(/\n\s*\n/)
  return (
    <div className={cn('flex max-w-[72ch] flex-col gap-3 text-sm leading-6', className)}>
      {blocks.map((block, index) => {
        const lines = block.split('\n')
        if (lines.every((line) => BULLET.test(line))) {
          return (
            <ul
              key={index}
              className="flex list-disc flex-col gap-1.5 pl-5 marker:text-dim-foreground"
            >
              {lines.map((line, at) => (
                <li key={at}>{inline(line.replace(BULLET, ''))}</li>
              ))}
            </ul>
          )
        }
        return <p key={index}>{inline(lines.join(' '))}</p>
      })}
    </div>
  )
}
