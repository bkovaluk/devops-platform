/**
 * A finding as Markdown, for pasting into a ticket or a chat thread: the
 * conclusion, how sure the agent was, what it weighed, what it saw and what
 * to do, with the link back to the page it came from.
 */
import type { FindingDetail } from '@/types/api'
import { orderedHypotheses } from './findings-reasoning'
import { HYPOTHESIS_WORD } from './findings-words'

/** Model text on one line, so a list item stays one item. */
function line(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function cites(steps: readonly number[]): string {
  if (steps.length === 0) return ''
  return ` (${steps.length === 1 ? 'step' : 'steps'} ${steps.join(', ')})`
}

export function findingMarkdown(finding: FindingDetail, link: string): string {
  const title = finding.title ?? finding.alarm_name ?? finding.finding_id
  const facts = [
    ['Severity', finding.severity],
    ['Outcome', finding.outcome],
    ['Confidence', finding.confidence],
    ['Effort', finding.fix_effort],
    ['Status', finding.status],
    ['Env', finding.env],
  ]
    .filter((fact): fact is [string, string] => Boolean(fact[1]))
    .map(([word, value]) => `${word}: ${value}`)
    .join(', ')

  const parts: string[] = [`# ${line(title)}`, facts]
  if (finding.likely_cause) parts.push(`## Likely cause\n\n${finding.likely_cause.trim()}`)

  const hypotheses = orderedHypotheses(finding)
  if (hypotheses.length > 0) {
    const items = hypotheses.map(
      (each) =>
        `- **${HYPOTHESIS_WORD[each.state]}**: ${line(each.text ?? '')}${cites(each.steps)}`,
    )
    parts.push(`## Hypotheses\n\n${items.join('\n')}`)
  }

  if (finding.evidence.length > 0) {
    const items = finding.evidence.map(
      (item) =>
        `- ${item.kind ? `**${item.kind}**: ` : ''}${line(item.detail ?? '')}${cites(item.steps)}`,
    )
    parts.push(`## Evidence\n\n${items.join('\n')}`)
  }

  if (finding.actions.length > 0) {
    const items = finding.actions.map((action, index) => {
      const command = action.command ? `\n\n   \`${line(action.command)}\`` : ''
      return `${index + 1}. ${line(action.text)}${command}`
    })
    parts.push(`## Next steps\n\n${items.join('\n')}`)
  }

  parts.push(`[Open the investigation](${link})`)
  return `${parts.join('\n\n')}\n`
}
