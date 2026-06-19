import type { LawSummary, LawNode, RevisionSummary } from '../types.js'

export interface FetchLawsParams {
  offset?: number
  limit?: number
}

export abstract class DataSource {
  abstract fetchLaws(params?: FetchLawsParams): Promise<LawSummary[]>
  abstract fetchRevisions(lawId: string): Promise<RevisionSummary[]>
  abstract fetchFullText(revisionId: string): Promise<LawNode>
}
