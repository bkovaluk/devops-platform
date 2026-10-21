import { cn } from '@/lib/utils'

/** A loading placeholder shaped like the content it stands in for. The one
 *  owner of the shimmer: no surface draws its own. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn('shimmer rounded-sm', className)} />
}
