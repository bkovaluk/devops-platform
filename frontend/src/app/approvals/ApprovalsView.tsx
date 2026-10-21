import { GitPullRequest } from 'lucide-react'
import { ApprovalsInbox } from '@/components/approvals/ApprovalsInbox'
import { TOOL_ACCENTS } from '@/lib/theme-constants'
import { ViewHeader } from '../layout/ViewHeader'

export function ApprovalsView() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ViewHeader title="Approvals" icon={GitPullRequest} accent={TOOL_ACCENTS.approvals.text} />
      <div className="min-h-0 flex-1 overflow-y-auto px-gutter-page pb-8">
        <ApprovalsInbox />
      </div>
    </div>
  )
}
