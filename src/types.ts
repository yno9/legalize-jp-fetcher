export interface LawSummary {
  lawId: string
  lawNum: string
  lawNumEra: string | null        // law_info.law_num_era (e.g. "Meiji", "Reiwa")
  lawNumYear: number | null       // law_info.law_num_year
  lawNumType: string | null       // law_info.law_num_type
  lawNumNum: string | null        // law_info.law_num_num (numeric part, e.g. "337")
  lawType: string
  title: string
  titleKana: string | null
  abbrev: string | null           // revision_info.abbrev
  category: string | null
  updatedAt: string | null
  promulgationDate: string | null // law_info.promulgation_date (original promulgation)
  repealStatus: string            // revision_info.repeal_status ("None", "Repealed", etc.)
  repealDate: string | null       // revision_info.repeal_date
  remainInForce: boolean          // revision_info.remain_in_force
  mission: string | null          // revision_info.mission (e.g. "New")
  currentRevisionStatus: string | null // revision_info.current_revision_status
}

export interface RevisionSummary {
  revisionId: string
  lawId: string
  promulgatedAt: string | null
  enforcedAt: string
  scheduledEnforcedAt: string | null
  enforcementComment: string | null
  amendmentLawId: string | null
  amendmentLawNum: string | null
  amendmentLawName: string | null
  amendmentLawNameKana: string | null
  amendmentType: string | null
  isFuture: boolean
}

// Response from e-Gov API /law_file/json/{revision_id}
export interface LawNode {
  tag: string
  attr: Record<string, string>
  children: (LawNode | string)[]
}

export interface RevisionEntry {
  revisionId: string
  enforcedAt: string
  promulgatedAt: string | null
  scheduledEnforcedAt: string | null  // amendment_scheduled_enforcement_date
  enforcementComment: string | null   // amendment_enforcement_comment
  amendmentLawId: string | null
  amendmentLawNum: string | null
  amendmentLawName: string | null
  amendmentLawNameKana: string | null // amendment_law_title_kana
  amendmentType: string | null        // amendment_type
}

export interface LawEntry extends LawSummary {
  past: RevisionEntry[]
  current: RevisionEntry | null
  future: RevisionEntry[]
}

export interface LawElementNode {
  elementType: string
  num: string | null
  title: string | null
  text: string | null
  orderIndex: number
  path: string
  children: LawElementNode[]
}
