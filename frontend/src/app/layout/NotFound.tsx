import { Link } from '@tanstack/react-router'
import { Compass } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'

export function NotFound() {
  return (
    <EmptyState
      className="flex-1"
      icon={<Compass />}
      title="Nothing lives at this address"
      body="The link may be from an older version, or mistyped."
      cta={
        <Button asChild variant="soft" size="sm">
          <Link to="/">Go home</Link>
        </Button>
      }
    />
  )
}
