import pThrottle from 'p-throttle'
import { DataSource, type FetchLawsParams } from './DataSource.js'
import type { LawSummary, LawNode, RevisionSummary } from '../types.js'

const BASE_URL = 'https://laws.e-gov.go.jp/api/2'
const MAX_RETRIES = 3
const RETRY_BASE_MS = 1000

// At most 5 requests per second
const throttle = pThrottle({ limit: 5, interval: 1000 })

const fetchThrottled = throttle(async (url: string): Promise<Response> => {
  return fetch(url)
})

async function fetchWithRetry(url: string): Promise<unknown> {
  let lastError: Error | null = null
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, RETRY_BASE_MS * 2 ** (attempt - 1)))
    }
    try {
      const res = await fetchThrottled(url)
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${url}`)
      }
      return await res.json()
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e))
      console.warn(`Retry ${attempt + 1}/${MAX_RETRIES}: ${url} — ${lastError.message}`)
    }
  }
  throw lastError
}

export class EGovDataSource extends DataSource {
  async fetchLaws(params: FetchLawsParams = {}): Promise<LawSummary[]> {
    const { offset = 0, limit } = params
    const pageSize = 1000
    const results: LawSummary[] = []
    let currentOffset = offset

    while (true) {
      const remaining = limit !== undefined ? limit - results.length : pageSize
      if (remaining <= 0) break
      const fetchSize = Math.min(pageSize, remaining)

      const url = `${BASE_URL}/laws?repeal_status=None&offset=${currentOffset}&limit=${fetchSize}`
      const data = (await fetchWithRetry(url)) as {
        total_count: number
        laws: Array<{
          law_info: {
            law_id: string
            law_num: string
            law_num_era: string | null
            law_num_year: number | null
            law_num_type: string | null
            law_num_num: string | null
            law_type: string
            promulgation_date: string | null
          }
          revision_info: {
            law_title: string
            law_title_kana: string | null
            abbrev: string | null
            category: string | null
            updated: string | null
            repeal_status: string
            repeal_date: string | null
            remain_in_force: boolean
            mission: string | null
            current_revision_status: string | null
          }
        }>
      }

      for (const item of data.laws) {
        results.push({
          lawId: item.law_info.law_id,
          lawNum: item.law_info.law_num,
          lawNumEra: item.law_info.law_num_era ?? null,
          lawNumYear: item.law_info.law_num_year ?? null,
          lawNumType: item.law_info.law_num_type ?? null,
          lawNumNum: item.law_info.law_num_num ?? null,
          lawType: item.law_info.law_type,
          title: item.revision_info.law_title,
          titleKana: item.revision_info.law_title_kana,
          abbrev: item.revision_info.abbrev ?? null,
          category: item.revision_info.category,
          updatedAt: item.revision_info.updated,
          promulgationDate: item.law_info.promulgation_date ?? null,
          repealStatus: item.revision_info.repeal_status,
          repealDate: item.revision_info.repeal_date ?? null,
          remainInForce: item.revision_info.remain_in_force,
          mission: item.revision_info.mission ?? null,
          currentRevisionStatus: item.revision_info.current_revision_status ?? null,
        })
      }

      if (results.length >= (limit ?? data.total_count) || data.laws.length < fetchSize) break
      currentOffset += fetchSize
    }

    return results
  }

  async fetchRevisions(lawId: string): Promise<RevisionSummary[]> {
    const url = `${BASE_URL}/law_revisions/${lawId}`
    const data = (await fetchWithRetry(url)) as {
      revisions: Array<{
        law_revision_id: string
        amendment_promulgate_date: string | null
        amendment_enforcement_date: string
        amendment_scheduled_enforcement_date: string | null
        amendment_enforcement_comment: string | null
        amendment_law_id: string | null
        amendment_law_num: string | null
        amendment_law_title: string | null
        amendment_law_title_kana: string | null
        amendment_type: string | null
      }>
    }

    return data.revisions.map((r) => ({
      revisionId: r.law_revision_id,
      lawId,
      promulgatedAt: r.amendment_promulgate_date,
      enforcedAt: r.amendment_enforcement_date,
      scheduledEnforcedAt: r.amendment_scheduled_enforcement_date ?? null,
      enforcementComment: r.amendment_enforcement_comment ?? null,
      amendmentLawId: r.amendment_law_id,
      amendmentLawNum: r.amendment_law_num,
      amendmentLawName: r.amendment_law_title,
      amendmentLawNameKana: r.amendment_law_title_kana ?? null,
      amendmentType: r.amendment_type ?? null,
      isFuture: r.amendment_enforcement_date > new Date().toISOString().slice(0, 10),
    }))
  }

  async fetchFullText(revisionId: string): Promise<LawNode> {
    const url = `${BASE_URL}/law_file/json/${revisionId}`
    return (await fetchWithRetry(url)) as LawNode
  }
}
