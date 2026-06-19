import pThrottle from 'p-throttle';
import { DataSource } from './DataSource.js';
const BASE_URL = 'https://laws.e-gov.go.jp/api/2';
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 1000;
// At most 5 requests per second
const throttle = pThrottle({ limit: 5, interval: 1000 });
const fetchThrottled = throttle(async (url) => {
    return fetch(url);
});
async function fetchWithRetry(url) {
    let lastError = null;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        if (attempt > 0) {
            await new Promise((r) => setTimeout(r, RETRY_BASE_MS * 2 ** (attempt - 1)));
        }
        try {
            const res = await fetchThrottled(url);
            if (!res.ok) {
                throw new Error(`HTTP ${res.status}: ${url}`);
            }
            return await res.json();
        }
        catch (e) {
            lastError = e instanceof Error ? e : new Error(String(e));
            console.warn(`Retry ${attempt + 1}/${MAX_RETRIES}: ${url} — ${lastError.message}`);
        }
    }
    throw lastError;
}
export class EGovDataSource extends DataSource {
    async fetchLaws(params = {}) {
        const { offset = 0, limit } = params;
        const pageSize = 1000;
        const results = [];
        let currentOffset = offset;
        while (true) {
            const remaining = limit !== undefined ? limit - results.length : pageSize;
            if (remaining <= 0)
                break;
            const fetchSize = Math.min(pageSize, remaining);
            const url = `${BASE_URL}/laws?repeal_status=None&offset=${currentOffset}&limit=${fetchSize}`;
            const data = (await fetchWithRetry(url));
            for (const item of data.laws) {
                results.push({
                    lawId: item.law_info.law_id,
                    lawNum: item.law_info.law_num,
                    lawType: item.law_info.law_type,
                    title: item.revision_info.law_title,
                    titleKana: item.revision_info.law_title_kana,
                    category: item.revision_info.category,
                    updatedAt: item.revision_info.updated,
                    promulgationDate: item.law_info.promulgation_date ?? null,
                });
            }
            if (results.length >= (limit ?? data.total_count) || data.laws.length < fetchSize)
                break;
            currentOffset += fetchSize;
        }
        return results;
    }
    async fetchRevisions(lawId) {
        const url = `${BASE_URL}/law_revisions/${lawId}`;
        const data = (await fetchWithRetry(url));
        return data.revisions.map((r) => ({
            revisionId: r.law_revision_id,
            lawId,
            promulgatedAt: r.amendment_promulgate_date,
            enforcedAt: r.amendment_enforcement_date,
            amendmentLawId: r.amendment_law_id,
            amendmentLawNum: r.amendment_law_num,
            amendmentLawName: r.amendment_law_title,
            isFuture: r.amendment_enforcement_date > new Date().toISOString().slice(0, 10),
        }));
    }
    async fetchFullText(revisionId) {
        const url = `${BASE_URL}/law_file/json/${revisionId}`;
        return (await fetchWithRetry(url));
    }
}
