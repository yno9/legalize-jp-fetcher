import 'dotenv/config'
import { readFileSync, readdirSync, existsSync, rmSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import path from 'path'
import { execSync } from 'child_process'
import { commitRevision, ensureBranch } from './gitCommit.js'
import type { LawEntry } from './types.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = process.env['DATA_DIR'] ?? join(__dirname, '../../data')
const MD_DIR = join(DATA_DIR, 'md')
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

async function main() {
  const lawsPath = join(DATA_DIR, 'laws.json')
  if (!existsSync(lawsPath)) {
    console.error('[commit:md] data/laws.json not found.')
    process.exit(1)
  }

  await ensureBranch(REPO_PATH, BRANCH)

  console.log('[commit:md] reading committed Source-Ids from git history...')
  const committed = allCommittedSourceIds(REPO_PATH)
  console.log(`[commit:md] ${committed.size} revisions already committed`)

  const laws = JSON.parse(readFileSync(lawsPath, 'utf-8')) as LawEntry[]
  console.log(`[commit:md] ${laws.length} laws to process`)

  // Remove MD files in repo not in catalog
  const jpDir = path.join(REPO_PATH, 'jp')
  if (existsSync(jpDir)) {
    const expectedIds = new Set(laws.map((l) => `${l.lawId}.md`))
    for (const file of readdirSync(jpDir)) {
      if (file.endsWith('.md') && !expectedIds.has(file)) {
        rmSync(path.join(jpDir, file))
        execSync(`git -C ${REPO_PATH} add -A && git -C ${REPO_PATH} commit -m "[fix-pipeline] remove files not in catalog"`)
        console.log(`[commit:md] removed ${file}`)
      }
    }
  }

  let commitCount = 0

  for (let i = 0; i < laws.length; i++) {
    const law = laws[i]!
    const filePath = path.join('jp', `${law.lawId}.md`)
    const lawMdDir = join(MD_DIR, law.lawId)

    if (!law.current && law.future.length === 0) continue

    const allRevisions = [...(law.past ?? []), ...(law.current ? [law.current] : [])]
    const newRevisions = allRevisions.filter((r) => !committed.has(r.revisionId))

    if (newRevisions.length === 0) continue

    const isFirstEver = !committed.has(allRevisions[0]!.revisionId) && !existsSync(path.join(REPO_PATH, filePath))

    process.stdout.write(`[${i + 1}/${laws.length}] ${law.title}: ${newRevisions.length} revision(s) ... `)

    let lawCommitCount = 0
    for (const revision of newRevisions) {
      const mdPath = join(lawMdDir, `${revision.revisionId}.md`)
      if (!existsSync(mdPath)) {
        console.warn(`  skip (MD not generated: ${revision.revisionId})`)
        continue
      }

      const content = readFileSync(mdPath, 'utf-8')
      const isFirst = isFirstEver && lawCommitCount === 0

      await commitRevision({
        repoPath: REPO_PATH,
        filePath,
        content,
        commitType: isFirst ? 'bootstrap' : 'reforma',
        title: law.title,
        authorDate: revision.enforcedAt,
        sourceId: revision.revisionId,
        normId: law.lawId,
      })

      committed.add(revision.revisionId)
      commitCount++
      lawCommitCount++
    }

    console.log('done')
  }

  console.log(`[commit:md] completed: ${commitCount} revisions committed`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
