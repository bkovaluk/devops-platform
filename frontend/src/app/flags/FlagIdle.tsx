import { MousePointerClick } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'

/** The detail column before anything is picked. */
export function FlagIdle() {
  return (
    <EmptyState
      variant="inspector"
      icon={<MousePointerClick />}
      title="Pick a flag"
      body="Its state, its last hour of evaluations and its history open here."
    />
  )
}
