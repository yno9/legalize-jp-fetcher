import 'dotenv/config'
import { readFileSync, readdirSync, existsSync, rmSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import path from 'path'
import { execSync } from 'child_process'
import { commitRevision, ensureBranch, createFuturePR } from './gitCommit.js'
import type { LawEntry } from './types.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = process.env['DATA_DIR'] ?? join(__dirname, '../data')
const CATALOG_PATH = join(DATA_DIR, 'catalog.json')
const LAWS_FILE = process.env['LAWS_FILE'] ?? 'laws.json'

/**
 * COMMIT_MODE:
 *   single (default) — legalize style: main branch only, flat jp/{lawId}.md
 *   branch           — branch style: current + future/YYYYMMDD branches
 */
const COMMIT_MODE = process.env['COMMIT_MODE'] ?? 'single'
const MD_MODE = COMMIT_MODE === 'branch' ? 'essential' : 'full'
const MD_DIR = join(DATA_DIR, 'md', MD_MODE)
const REPO_PATH = COMMIT_MODE === 'branch'
  ? (process.env['LAWCODE_REPO_PATH'] ?? '/home/ubuntu/dev/lawcode-jp')
  : (process.env['LAWMD_REPO_PATH'] ?? '/home/ubuntu/dev/legalize-jp')

/** Build the full set of Source-Ids already committed across the entire repo (all branches) */
function allCommittedSourceIds(repoPath: string): Set<string> {
  const ids = new Set<string>()
  try {
    const log = execSync(`git -C ${repoPath} log --all --format=%B`, {
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

async function commitSingle(laws: LawEntry[], committed: Set<string>): Promise<number> {
  const BRANCH = 'main'
  await ensureBranch(REPO_PATH, BRANCH)

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
        process.stdout.write(`skip(no MD) `)
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

  return commitCount
}

async function commitBranch(laws: LawEntry[], committed: Set<string>): Promise<number> {
  // Ensure `current` branch exists
  await ensureBranch(REPO_PATH, 'current')

  let commitCount = 0

  for (let i = 0; i < laws.length; i++) {
    const law = laws[i]!
    const lawMdDir = join(MD_DIR, law.lawId)
    const filePath = path.join('jp', `${law.lawId}.md`)

    if (!law.current && law.future.length === 0) continue

    process.stdout.write(`[${i + 1}/${laws.length}] ${law.title} ... `)

    // ── current branch: latest in-force revision ──────────────────────────
    if (law.current && !committed.has(law.current.revisionId)) {
      const mdPath = join(lawMdDir, `${law.current.revisionId}.md`)
      if (existsSync(mdPath)) {
        await ensureBranch(REPO_PATH, 'current')
        const allRevisions = [...(law.past ?? []), law.current]
        const isFirst = !existsSync(path.join(REPO_PATH, filePath))
        await commitRevision({
          repoPath: REPO_PATH,
          filePath,
          content: readFileSync(mdPath, 'utf-8'),
          commitType: isFirst ? 'bootstrap' : 'reforma',
          title: law.title,
          authorDate: law.current.enforcedAt,
          sourceId: law.current.revisionId,
          normId: law.lawId,
        })
        committed.add(law.current.revisionId)
        commitCount++
      }
    }

    // ── future/* branches: one branch per unique enforcement date ─────────
    for (const revision of law.future) {
      if (committed.has(revision.revisionId)) continue

      const mdPath = join(lawMdDir, `${revision.revisionId}.md`)
      if (!existsSync(mdPath)) continue

      // Branch name: future/{title}/{YYYY-MM-DD}
      const branchName = `future/${law.title}/${revision.enforcedAt}`

      await createFuturePR(
        REPO_PATH,
        'current',
        branchName,
        filePath,
        readFileSync(mdPath, 'utf-8'),
        `[reforma] ${law.title}`,
        revision.enforcedAt,
        revision.enforcedAt,
      )

      committed.add(revision.revisionId)
      commitCount++
    }

    console.log('done')
  }

  return commitCount
}

async function main() {
  const lawsPath = join(DATA_DIR, LAWS_FILE)
  if (!existsSync(lawsPath)) {
    console.error(`[commit:md] ${LAWS_FILE} not found.`)
    process.exit(1)
  }

  console.log(`[commit:md] mode=${COMMIT_MODE} md=${MD_MODE} repo=${REPO_PATH}`)
  console.log('[commit:md] reading committed Source-Ids from git history...')
  const committed = allCommittedSourceIds(REPO_PATH)
  console.log(`[commit:md] ${committed.size} revisions already committed`)

  let laws = JSON.parse(readFileSync(lawsPath, 'utf-8')) as LawEntry[]

  if (COMMIT_MODE === 'branch' && existsSync(CATALOG_PATH)) {
    const catalog = JSON.parse(readFileSync(CATALOG_PATH, 'utf-8')) as { lawId: string }[]
    const catalogIds = new Set(catalog.map((c) => c.lawId))
    laws = laws.filter((l) => catalogIds.has(l.lawId))
  }

  console.log(`[commit:md] ${laws.length} laws to process`)

  const commitCount = COMMIT_MODE === 'branch'
    ? await commitBranch(laws, committed)
    : await commitSingle(laws, committed)

  console.log(`[commit:md] completed: ${commitCount} revisions committed`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
