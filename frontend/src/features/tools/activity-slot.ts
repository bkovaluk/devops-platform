/**
 * Home's activity feed: one time-ordered reading assembled from many tools.
 * The event shape and the slot live apart from Home's markup, so a tool can
 * contribute without importing it.
 */
import type { ElementType } from 'react'
import type { ResourceLink } from '@/lib/resource-links'
import { createContributionSlot, type Keyed } from './contribution-slot'

export interface ActivityEvent extends Keyed {
  icon: ElementType
  /** The tool's accent, or a state colour where the row reports a state. */
  tint: string
  /** The kind of thing, for a reader who cannot see the icon. */
  noun: string
  resource: string
  env: string | null
  actor: string
  /** What happened, after the actor: "requested an update". */
  detail: string
  at: string
  link: ResourceLink
}

export const activitySlot = createContributionSlot<ActivityEvent>()
