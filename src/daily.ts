import 'dotenv/config'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import path from 'path'
import { execSync } from 'child_process'
import { EGovDataSource } from './datasource/EGovDataSource.js'
import { toMarkdown } from './toMarkdown.js'
import { commitRevision, ensureBranch } from './gitCommit.js'
import { parseFullText } from './parseFullText.js'
import type { LawEntry, LawNode, RevisionEntry, RevisionSummary } from './types.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = process.env['DATA_DIR'] ?? join(__dirname, '../../data')
const FULLTEXT_DIR = join(DATA_DIR, 'fulltext')
const REVISIONS_DIR = join(DATA_DIR, 'revisions')
const REPO_PATH = process.env['LAWMD_REPO_PATH'] ?? '/home/ubuntu/dev/legalize-jp'
const BRANCH = 'main'

/** Return the set of Source-Id values already committed for this law file */
function committedSourceIds(repoPath: string, filePath: string): Set<string> {
  const ids = new Set<string>()
  try {
    const log = execSync(`git -C ${repoPath} log --format=%B -- ${filePath}`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    for (const match of log.matchAll(/^Source-Id: (.+)$/gm)) {
      ids.add(match[1]!.trim())
    }
  } catch {
    // file not yet tracked
  }
  return ids
}

const toEntry = (r: RevisionSummary): RevisionEntry => ({
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

async function main() {
  mkdirSync(FULLTEXT_DIR, { recursive: true })
  mkdirSync(REVISIONS_DIR, { recursive: true })

  const ds = new EGovDataSource()

  // 1. Fetch current law list
  console.log('[daily] fetching law list...')
  const laws = await ds.fetchLaws()
  console.log(`[daily] ${laws.length} laws from API`)

  const today = new Date().toISOString().slice(0, 10)

  // 2. Load existing laws.json if present
  const lawsPath = join(DATA_DIR, 'laws.json')
  const existingLaws: Map<string, LawEntry> = new Map()
  if (existsSync(lawsPath)) {
    const existing = JSON.parse(readFileSync(lawsPath, 'utf-8')) as LawEntry[]
    for (const l of existing) existingLaws.set(l.lawId, l)
  }

  await ensureBranch(REPO_PATH, BRANCH)

  const updatedEntries: LawEntry[] = []
  let newRevisionCount = 0

  for (let i = 0; i < laws.length; i++) {
    const law = laws[i]!
    const filePath = path.join('jp', `${law.lawId}.md`)

    // 3. Fetch revisions (always, to detect new ones)
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

    const entry: LawEntry = {
      ...law,
      past: past.map(toEntry),
      current: current ? toEntry(current) : null,
      future: futures.map(toEntry),
    }
    updatedEntries.push(entry)

    // 4. Find revisions not yet committed to the repo
    const committed = committedSourceIds(REPO_PATH, filePath)
    const allRevisions = [...past, ...(current ? [current] : [])]
    const newRevisions = allRevisions.filter((r) => !committed.has(r.revisionId))

    if (newRevisions.length === 0) continue

    process.stdout.write(`[${i + 1}/${laws.length}] ${law.title}: ${newRevisions.length} new revision(s) ... `)

    // 5. Fetch fulltexts for new revisions only
    for (const revision of newRevisions) {
      const dest = join(FULLTEXT_DIR, `${revision.revisionId}.json`)
      if (!existsSync(dest)) {
        try {
          const root = await ds.fetchFullText(revision.revisionId)
          writeFileSync(dest, JSON.stringify(root, null, 2))
        } catch {
          console.warn(`  skip fulltext (unavailable: ${revision.revisionId})`)
          continue
        }
      }

      // 6. Commit the new revision
      const fulltextPath = join(FULLTEXT_DIR, `${revision.revisionId}.json`)
      if (!existsSync(fulltextPath)) continue

      const root = JSON.parse(readFileSync(fulltextPath, 'utf-8')) as LawNode
      const elements = parseFullText(root)
      const isFirst = committed.size === 0 && newRevisions.indexOf(revision) === 0
      const md = toMarkdown(
        {
          lawId: law.lawId,
          lawNum: law.lawNum,
          lawType: law.lawType,
          title: law.title,
          titleKana: law.titleKana,
          abbrev: law.abbrev,
          category: law.category,
          promulgationDate: law.promulgationDate ?? null,
          enforcedAt: revision.enforcedAt,
          status: 'in_force',
        },
        elements,
      )

      await commitRevision({
        repoPath: REPO_PATH,
        filePath,
        content: md,
        commitType: isFirst ? 'bootstrap' : 'reforma',
        title: law.title,
        authorDate: revision.enforcedAt,
        sourceId: revision.revisionId,
        normId: law.lawId,
      })
      newRevisionCount++
    }

    console.log('done')
  }

  // 7. Update laws.json
  writeFileSync(lawsPath, JSON.stringify(updatedEntries, null, 2))
  console.log(`[daily] laws.json updated (${updatedEntries.length} laws)`)
  console.log(`[daily] ${newRevisionCount} new revision(s) committed`)
  console.log('[daily] completed')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
