import { describe, expect, it } from 'vite-plus/test'
import { seedFindings } from '@/test/msw/findings'
import type { FindingDetail } from '@/types/api'
import { findingMarkdown } from './findings-markdown'
import {
  awsCliCommand,
  citationsByStep,
  contextEvidence,
  orderedHypotheses,
  stepSubject,
  stepToolLabel,
} from './findings-reasoning'
import { compactTokens, formatDuration, runEnding } from './findings-run'
import { isNarrowed, NO_FILTERS, paramsOf, searchOf, windowFor } from './findings-search'
import { ageWord, isReported, resolutionsFor, severityTone } from './findings-words'

const NOW = Date.parse('2026-10-20T12:00:00Z')

function seeded(id: string): FindingDetail {
  const found = seedFindings(NOW).find((item) => item.finding_id === id)
  if (!found) throw new Error(`no fixture ${id}`)
  return found
}

describe('the list URL', () => {
  it('reads absences as the defaults and writes the defaults as absences', () => {
    const params = paramsOf({})
    expect(params).toEqual({
      status: 'open',
      window: '30d',
      query: '',
      includeTriage: false,
      filters: NO_FILTERS,
    })
    expect(Object.values(searchOf(params)).every((value) => value === undefined)).toBe(true)
    expect(isNarrowed(params)).toBe(false)
  })

  it('round-trips a narrowed list', () => {
    const search = {
      status: 'closed' as const,
      window: '365d' as const,
      q: 'orders',
      severity: ['high'],
    }
    const params = paramsOf(search)
    expect(searchOf(params)).toMatchObject(search)
    expect(isNarrowed(params)).toBe(true)
  })

  it('reads a year on a tab that offers none as its deepest window', () => {
    expect(windowFor('open', '365d')).toBe('90d')
    expect(paramsOf({ window: '365d' }).window).toBe('90d')
    expect(windowFor('closed', '365d')).toBe('365d')
  })
})

describe('the reasoning', () => {
  const checkout = seeded('f-checkout-0001')

  it('reads the hypotheses as the answer, the open ones, then the ruled out', () => {
    expect(orderedHypotheses(checkout).map((each) => each.state)).toEqual([
      'likely',
      'ruled_out',
      'ruled_out',
    ])
  })

  it('knows what cites each step, and what came from the context', () => {
    const citations = citationsByStep(checkout)
    expect(citations.get(2)?.hypotheses).toEqual([0, 1])
    expect(citations.get(1)?.evidence.map((item) => item.kind)).toEqual(['metric'])
    expect(citations.has(5)).toBe(false)
    expect(contextEvidence(checkout).map((item) => item.kind)).toEqual(['context'])
  })

  it('names a step by its call, and a lookup as one', () => {
    const [first, , , fourth, fifth] = checkout.tool_trail
    expect(stepToolLabel(first!)).toEqual({ prefix: 'aws.', name: 'cloudwatch.get_metric_data' })
    expect(stepSubject(first!)).toBe('checkout-api Errors')
    expect(stepToolLabel(fifth!)).toEqual({ prefix: null, name: 'lookup' })
    expect(stepSubject(fifth!)).toBe('"lambda versions"')
    expect(awsCliCommand(fourth!)).toBe(
      "aws lambda list-event-source-mappings --function-name 'checkout-api'",
    )
    expect(awsCliCommand(first!)).toBeNull()
  })

  it('falls back to the tool and its first argument for a step without a call', () => {
    const step = {
      step: 1,
      tool: 'get_metric',
      status: 'data' as const,
      input: '',
      args: { metric: 'Errors' },
      call: null,
    }
    expect(stepToolLabel(step)).toEqual({ prefix: null, name: 'get_metric' })
    expect(stepSubject(step)).toBe('Errors')
  })
})

describe('the run', () => {
  it('says how a run ended and which limit forced it', () => {
    expect(runEnding(seeded('f-checkout-0001').run!, 'reported')).toMatchObject({
      tone: 'ok',
      reasonLabel: 'Chose to stop',
      highlight: null,
    })
    expect(runEnding(seeded('f-billing-0001').run!, 'incomplete')).toMatchObject({
      tone: 'bad',
      outcomeWord: 'Incomplete',
      highlight: 'turns',
    })
    expect(formatDuration(84.6)).toBe('1m 25s')
    expect(formatDuration(3720)).toBe('1h 2m')
    expect(compactTokens(121_000)).toBe('121K')
  })
})

describe('the words', () => {
  it('lets only a reported cause be graded', () => {
    expect(isReported(undefined)).toBe(true)
    expect(resolutionsFor('reported')).toEqual(['confirmed', 'false_positive', 'wrong'])
    expect(resolutionsFor('incomplete')).toEqual(['dismissed'])
  })

  it('tones a severity and ages a moment', () => {
    expect(severityTone('critical')).toBe('bad')
    expect(severityTone('medium')).toBe('warn')
    expect(severityTone(null)).toBe('unknown')
    expect(ageWord('2026-10-20T11:15:00Z', NOW)).toBe('45m')
    expect(ageWord('2026-10-18T12:00:00Z', NOW)).toBe('2d')
    expect(ageWord(null, NOW)).toBe('unknown')
  })

  it('writes a finding out as Markdown with the way back to it', () => {
    const markdown = findingMarkdown(seeded('f-checkout-0001'), 'https://ops.example.com/x')
    expect(markdown).toContain('# checkout-api errors started with the version 214 deploy')
    expect(markdown).toContain('- **Likely**: Version 214 broke pricing')
    expect(markdown).toContain('[Open the investigation](https://ops.example.com/x)')
  })
})
