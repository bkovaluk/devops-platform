import { Check, Copy, ExternalLink } from 'lucide-react'
import { useCopy } from '@/lib/use-copy'

const ACTION =
  'inline-flex items-center gap-1.5 rounded-sm font-mono text-xs text-signal transition-colors duration-[var(--duration-fast)] hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal'

/** The row under a toast's title: open the thing, or copy its link. */
export function ToastLinkRow({
  url,
  label = 'Copy link',
  linkLabel,
}: {
  url: string
  label?: string
  linkLabel?: string
}) {
  const { copied, copy } = useCopy(url)
  return (
    <div className="mt-1 flex items-center gap-3">
      {linkLabel && (
        <a href={url} className={ACTION}>
          <ExternalLink aria-hidden="true" className="h-3 w-3" />
          {linkLabel}
        </a>
      )}
      <button type="button" onClick={() => void copy()} className={ACTION}>
        {copied ? (
          <Check aria-hidden="true" className="h-3 w-3" />
        ) : (
          <Copy aria-hidden="true" className="h-3 w-3" />
        )}
        {copied ? 'Copied' : label}
      </button>
    </div>
  )
}
