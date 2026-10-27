/**
 * Every fragment the tools lend to the rail, Home and the command palette. The
 * registry names them; the surfaces mount them only for a principal who can
 * open the tool they belong to.
 */
export type { PaletteContributionProps } from '../palette-parts'
export {
  ApprovalsActivity,
  ApprovalsAttention,
  ApprovalsCount,
  ApprovalsQuickAction,
} from './approvals'
export {
  FlagsActivity,
  FlagsAttention,
  FlagsHomeTile,
  FlagsPalette,
  FlagsQuickAction,
} from './flags'
export { InvestigationsAttention, InvestigationsHomeTile } from './investigations'
