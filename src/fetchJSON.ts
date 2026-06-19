import 'dotenv/config'
import { mkdirSync, writeFileSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { EGovDataSource } from './datasource/EGovDataSource.js'
import type { LawEntry, RevisionSummary } from './types.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

const DATA_DIR = process.env['DATA_DIR'] ?? join(__dirname, '../data')
const FULLTEXT_DIR = join(DATA_DIR, 'json')
const REVISIONS_DIR = join(DATA_DIR, 'revisions')
const MD_MODE = process.env['MD_MODE'] ?? 'full'
const CATALOG_PATH = join(DATA_DIR, 'catalog.json')

async function main() {
  mkdirSync(FULLTEXT_DIR, { recursive: true })
  mkdirSync(REVISIONS_DIR, { recursive: true })

  const ds = new EGovDataSource()

  // 1. Fetch law list
  console.log('[fetchAll] fetching law list...')
  const laws = await ds.fetchLaws()
  console.log(`[fetchAll] ${laws.length} laws fetched`)

  // In essential mode, only fetch fulltexts for catalog laws
  let catalogIds: Set<string> | null = null
  if (MD_MODE === 'essential' && existsSync(CATALOG_PATH)) {
    const catalog = JSON.parse(readFileSync(CATALOG_PATH, 'utf-8')) as { lawId: string }[]
    catalogIds = new Set(catalog.map((c) => c.lawId))
    console.log(`[fetchAll] essential mode: restricting fulltext fetch to ${catalogIds.size} catalog laws`)
  }

  const today = new Date().toISOString().slice(0, 10)
  const entries: LawEntry[] = []

  // In essential mode, restrict to catalog laws only
  const lawsToProcess = catalogIds !== null
    ? laws.filter((l) => catalogIds!.has(l.lawId))
    : laws

  console.log(`[fetchAll] ${lawsToProcess.length} laws to process`)

  for (let i = 0; i < lawsToProcess.length; i++) {
    const law = lawsToProcess[i]
    process.stdout.write(`[${i + 1}/${lawsToProcess.length}] ${law.title} ... `)

    // 2. Fetch and save revision list
    const revisions = await ds.fetchRevisions(law.lawId)
    writeFileSync(join(REVISIONS_DIR, `${law.lawId}.json`), JSON.stringify(revisions, null, 2))

    const pastRevisions = revisions
      .filter((r) => r.enforcedAt <= today)
      .sort((a, b) => a.enforcedAt.localeCompare(b.enforcedAt))
    const current = pastRevisions.length > 0 ? pastRevisions[pastRevisions.length - 1]! : null
    const past = pastRevisions.slice(0, -1)
    const futures = revisions
      .filter((r) => r.enforcedAt > today)
      .sort((a, b) => a.enforcedAt.localeCompare(b.enforcedAt))

    const toEntry = (r: RevisionSummary) => ({
      revisionId: r.revisionId,
      enforcedAt: r.enforcedAt,
      promulgatedAt: r.promulgatedAt ?? null,
      scheduledEnforcedAt: r.scheduledEnforcedAt,
      enforcementComment: r.enforcementComment,
      amendmentLawId: r.amendmentLawId,
      amendmentLawNum: r.amendmentLawNum,
      amendmentLawName: r.amendmentLawName,
      amendmentLawNameKana: r.amendmentLawNameKana,
      amendmentType: r.amendmentType,
    })

    entries.push({
      ...law,
      past: past.map(toEntry),
      current: current ? toEntry(current) : null,
      future: futures.map(toEntry),
    })

    // 3. Fetch and save fulltext for all revisions (skip if already cached)
    const toFetch = [...past, ...(current ? [current] : []), ...futures]
    let fetched = 0
    for (const revision of toFetch) {
      const dest = join(FULLTEXT_DIR, `${revision.revisionId}.json`)
      if (existsSync(dest)) { fetched++; continue }
      try {
        const root = await ds.fetchFullText(revision.revisionId)
        writeFileSync(dest, JSON.stringify(root, null, 2))
        fetched++
      } catch {
        console.warn(`  skip (unavailable: ${revision.revisionId})`)
      }
    }

    console.log(`done (${fetched}/${toFetch.length} revisions)`)
  }

  // 4. Save enriched laws.json
  writeFileSync(join(DATA_DIR, 'laws.json'), JSON.stringify(entries, null, 2))
  console.log(`[fetchAll] laws.json saved (${entries.length} laws)`)
  console.log('[fetchAll] completed')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
