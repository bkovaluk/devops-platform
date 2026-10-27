/**
 * The API's shapes, under the names the UI uses.
 *
 * Every type here is a re-export from `api-generated.ts`, which
 * `bun run generate-api-types` writes from the backend's `openapi.json`. Never
 * restate a shape by hand: when the API changes, regenerate and let the type
 * checker point at every call site that has to follow.
 */
import type { components } from './api-generated'

type Schemas = components['schemas']

/** `GET /config` — served to anyone. */
export type AppConfig = Schemas['PublicConfig']

/** `GET /auth/me` */
export type AuthMe = Schemas['Me']

export type Flag = Schemas['Flag']
export type FlagCreate = Schemas['FlagCreate']
export type FlagUpdate = Schemas['FlagPatch']

export type EvaluationPoint = Schemas['EvaluationPoint']

/** `GET /api/flags/{key}/evaluations` — oldest first, one point per minute. */
export type EvaluationSeries = Schemas['EvaluationSeries']

export type Approval = Schemas['Approval']
export type ApprovalStatus = Schemas['ApprovalStatus']

/** What a write answers: applied in a direct env, an approval request elsewhere. */
export type FlagChange = Schemas['FlagApplied'] | Schemas['ApprovalQueued']

/** `GET /api/agent/status` — whether this deployment runs an assistant. */
export type AgentStatus = Schemas['AgentStatus']

/** `GET /api/findings`: one page of the DevOps agent's findings, with facet counts. */
export type FindingList = Schemas['FindingList']
export type FindingRow = Schemas['FindingRow']
export type FindingDetail = Schemas['FindingDetail']
export type FindingFacets = Schemas['FindingFacets']
export type FindingStatus = Schemas['FindingStatus']
export type FindingWindow = Schemas['FindingWindow']
export type FindingAction = Schemas['FindingAction']
export type FindingHistoryEntry = Schemas['FindingHistoryEntry']
export type ActionKind = Schemas['ActionKind']
export type Resolution = Schemas['Resolution']
export type Confidence = Schemas['Confidence']
export type Hypothesis = Schemas['Hypothesis']
export type HypothesisState = Schemas['HypothesisState']
export type Evidence = Schemas['Evidence']
export type CheckedFact = Schemas['CheckedFact']
export type ToolTrailStep = Schemas['ToolTrailStep']
export type ToolCall = Schemas['ToolCall']
export type RunSummary = Schemas['RunSummary']

/** The body of `POST /api/findings/{id}/close`. */
export type ResolveFindingBody = Schemas['ResolveFindingBody']
