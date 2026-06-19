import 'dotenv/config'
import { readFileSync, readdirSync, rmSync, existsSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import path from 'path'
import { execSync } from 'child_process'
import { toMarkdown } from './toMarkdown.js'
import { ensureBranch, commitRevision } from './gitCommit.js'
import { parseFullText } from './parseFullText.js'
import type { LawEntry, LawNode } from './types.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = process.env['DATA_DIR'] ?? join(__dirname, '../../data')
const FULLTEXT_DIR = join(DATA_DIR, 'fulltext')

const REPO_PATH = process.env['LAWMD_REPO_PATH'] ?? '/home/ubuntu/dev/legalize-jp'
const BRANCH = 'main'

async function main() {
  const lawsPath = join(DATA_DIR, 'laws.json')
  if (!existsSync(lawsPath)) {
    console.error('[generateMd] data/laws.json not found. Run fetch:all first.')
    process.exit(1)
  }

  await ensureBranch(REPO_PATH, BRANCH)

  // Copy README and LICENSE to repo root; commit together if either changed
  const staticFiles = ['README.md', 'LICENSE']
  const changedStatic: string[] = []
  for (const filename of staticFiles) {
    const src = join(__dirname, '..', filename)
    const dest = path.join(REPO_PATH, filename)
    if (!existsSync(src)) continue
    const content = readFileSync(src, 'utf-8')
    const existing = existsSync(dest) ? readFileSync(dest, 'utf-8') : null
    if (content !== existing) {
      writeFileSync(dest, content)
      changedStatic.push(filename)
    }
  }
  if (changedStatic.length > 0) {
    execSync(`git -C ${REPO_PATH} add ${changedStatic.join(' ')} && git -C ${REPO_PATH} commit -m "docs: update ${changedStatic.join(', ')}"`)
    console.log(`[generateMd] updated: ${changedStatic.join(', ')}`)
  }

  const laws = JSON.parse(readFileSync(lawsPath, 'utf-8')) as LawEntry[]

  console.log(`[generateMd] ${laws.length} laws to process`)

  // Delete MD files not in catalog (flat jp/ directory)
  const jpDir = path.join(REPO_PATH, 'jp')
  const expectedPaths = new Set(laws.map((l) => path.join('jp', `${l.lawId}.md`)))
  const allMdFiles: string[] = []
  if (existsSync(jpDir)) {
    for (const file of readdirSync(jpDir)) {
      if (file.endsWith('.md')) allMdFiles.push(path.join('jp', file))
    }
  }
  const toDelete = allMdFiles.filter((f) => !expectedPaths.has(f))
  if (toDelete.length > 0) {
    for (const f of toDelete) {
      rmSync(path.join(REPO_PATH, f))
      console.log(`[generateMd] deleted ${f}`)
    }
    execSync(`git -C ${REPO_PATH} add -A && git -C ${REPO_PATH} commit -m "[fix-pipeline] remove files not in catalog"`)
  }

  for (let i = 0; i < laws.length; i++) {
    const law = laws[i]
    const filePath = path.join('jp', `${law.lawId}.md`)

    if (!law.current && law.future.length === 0) {
      console.warn(`[${i + 1}/${laws.length}] ${law.title} — no revisions, skip`)
      continue
    }

    process.stdout.write(`[${i + 1}/${laws.length}] ${law.title} ... `)

    // Commit all revisions in chronological order: past → current
    const allRevisions = [...(law.past ?? []), ...(law.current ? [law.current] : [])]
    let committedCount = 0
    for (const revision of allRevisions) {
      const fulltextPath = join(FULLTEXT_DIR, `${revision.revisionId}.json`)
      if (!existsSync(fulltextPath)) continue

      const root = JSON.parse(readFileSync(fulltextPath, 'utf-8')) as LawNode
      const elements = parseFullText(root)
      const isFirst = committedCount === 0 && !existsSync(path.join(REPO_PATH, filePath))
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
      const commitDate = revision.enforcedAt
      await commitRevision({
        repoPath: REPO_PATH,
        filePath,
        content: md,
        commitType: isFirst ? 'bootstrap' : 'reforma',
        title: law.title,
        authorDate: commitDate,
        sourceId: revision.revisionId,
        normId: law.lawId,
      })
      committedCount++
    }

    console.log('done')
  }

  console.log('[generateMd] completed')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
