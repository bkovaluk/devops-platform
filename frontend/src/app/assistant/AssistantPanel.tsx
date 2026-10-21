/**
 * The dock's body: the conversation over the composer. Loaded the first time
 * the dock opens, so the AG-UI client never weighs on a page that does not
 * use it.
 */
import { AssistantComposer } from './AssistantComposer'
import { AssistantThread } from './AssistantThread'

export function AssistantPanel() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <AssistantThread />
      <AssistantComposer />
    </div>
  )
}
