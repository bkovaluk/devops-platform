import { MousePointerClick } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'

/** The detail column before anything is picked. */
export function FindingIdle() {
  return (
    <EmptyState
      variant="inspector"
      icon={<MousePointerClick />}
      title="Pick an investigation"
      body="What the agent concluded, what it weighed and every call it made open here. j and k move down and up the list."
    />
  )
}
