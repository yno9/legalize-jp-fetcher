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
const JSON_DIR = join(DATA_DIR, 'json')
const MD_DIR = join(DATA_DIR, 'md')
const REVISIONS_DIR = join(DATA_DIR, 'revisions')
const REPO_PATH = process.env['LAWMD_REPO_PATH'] ?? '/home/ubuntu/dev/legalize-jp'
const BRANCH = 'main'

/** Build the full set of Source-Ids already committed across the entire repo */
function allCommittedSourceIds(repoPath: string): Set<string> {
  const ids = new Set<string>()
  try {
    const log = execSync(`git -C ${repoPath} log --format=%B`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      maxBuffer: 512 * 1024 * 1024,
    })
    for (const match of log.matchAll(/^Source-Id: (.+)$/gm)) {
      ids.add(match[1]!.trim())
    }
  } catch {
    // empty repo
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
  mkdirSync(JSON_DIR, { recursive: true })
  mkdirSync(MD_DIR, { recursive: true })
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

  // 3. Read all committed Source-Ids once
  console.log('[daily] reading committed Source-Ids from git history...')
  const committed = allCommittedSourceIds(REPO_PATH)
  console.log(`[daily] ${committed.size} revisions already committed`)

  const updatedEntries: LawEntry[] = []
  let newRevisionCount = 0

  for (let i = 0; i < laws.length; i++) {
    const law = laws[i]!
    const filePath = path.join('jp', `${law.lawId}.md`)
    const lawMdDir = join(MD_DIR, law.lawId)

    // 4. Fetch revisions (always, to detect new ones)
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

    // 5. Find revisions not yet committed
    const allRevisions = [...past, ...(current ? [current] : [])]
    const newRevisions = allRevisions.filter((r) => !committed.has(r.revisionId))

    if (newRevisions.length === 0) continue

    process.stdout.write(`[${i + 1}/${laws.length}] ${law.title}: ${newRevisions.length} new revision(s) ... `)

    const isFirstEver = !existsSync(path.join(REPO_PATH, filePath))

    // 6. Fetch JSON, generate MD, commit
    let lawCommitCount = 0
    for (const revision of newRevisions) {
      const jsonPath = join(JSON_DIR, `${revision.revisionId}.json`)
      if (!existsSync(jsonPath)) {
        try {
          const root = await ds.fetchFullText(revision.revisionId)
          writeFileSync(jsonPath, JSON.stringify(root, null, 2))
        } catch {
          console.warn(`  skip (fulltext unavailable: ${revision.revisionId})`)
          continue
        }
      }

      const root = JSON.parse(readFileSync(jsonPath, 'utf-8')) as LawNode
      const elements = parseFullText(root)
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

      // Write to data/md/
      mkdirSync(lawMdDir, { recursive: true })
      writeFileSync(join(lawMdDir, `${revision.revisionId}.md`), md, 'utf-8')

      // Commit
      const isFirst = isFirstEver && lawCommitCount === 0
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

      committed.add(revision.revisionId)
      newRevisionCount++
      lawCommitCount++
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
