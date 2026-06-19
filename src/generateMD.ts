import 'dotenv/config'
import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import path from 'path'
import { toMarkdown, toMarkdownEssential } from './convertMD.js'
import { parseFullText } from './parseJSON.js'
import type { LawEntry, LawNode } from './types.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = process.env['DATA_DIR'] ?? join(__dirname, '../data')
const JSON_DIR = join(DATA_DIR, 'json')
const MD_MODE = process.env['MD_MODE'] ?? 'full'  // 'full' | 'essential'
const MD_DIR = join(DATA_DIR, 'md', MD_MODE)
const CATALOG_PATH = join(DATA_DIR, 'catalog.json')
const LAWS_FILE = process.env['LAWS_FILE'] ?? 'laws.json'

async function main() {
  const lawsPath = join(DATA_DIR, LAWS_FILE)
  if (!existsSync(lawsPath)) {
    console.error(`[generate:md] ${LAWS_FILE} not found. Run fetch:json first.`)
    process.exit(1)
  }

  mkdirSync(MD_DIR, { recursive: true })

  let laws = JSON.parse(readFileSync(lawsPath, 'utf-8')) as LawEntry[]

  if (MD_MODE === 'essential' && existsSync(CATALOG_PATH)) {
    const catalog = JSON.parse(readFileSync(CATALOG_PATH, 'utf-8')) as { lawId: string }[]
    const catalogIds = new Set(catalog.map((c) => c.lawId))
    laws = laws.filter((l) => catalogIds.has(l.lawId))
  }

  console.log(`[generate:md] ${laws.length} laws to process (mode: ${MD_MODE})`)

  let generated = 0
  let skipped = 0

  for (let i = 0; i < laws.length; i++) {
    const law = laws[i]!

    if (!law.current && law.future.length === 0) continue

    const allRevisions = [
      ...(law.past ?? []),
      ...(law.current ? [law.current] : []),
      ...law.future,
    ]
    const lawMdDir = join(MD_DIR, law.lawId)

    for (const revision of allRevisions) {
      const destPath = join(lawMdDir, `${revision.revisionId}.md`)
      if (existsSync(destPath)) {
        skipped++
        continue
      }

      const jsonPath = join(JSON_DIR, `${revision.revisionId}.json`)
      if (!existsSync(jsonPath)) continue

      const root = JSON.parse(readFileSync(jsonPath, 'utf-8')) as LawNode
      const elements = parseFullText(root)
      const meta = {
        lawId: law.lawId,
        lawNum: law.lawNum,
        lawType: law.lawType,
        title: law.title,
        titleKana: law.titleKana,
        abbrev: law.abbrev,
        category: law.category,
        promulgationDate: law.promulgationDate ?? null,
        enforcedAt: revision.enforcedAt,
        status: 'in_force' as const,
      }
      const md = MD_MODE === 'essential'
        ? toMarkdownEssential(meta, elements)
        : toMarkdown(meta, elements)

      mkdirSync(lawMdDir, { recursive: true })
      writeFileSync(destPath, md, 'utf-8')
      generated++
    }

    if ((i + 1) % 500 === 0) {
      console.log(`[generate:md] ${i + 1}/${laws.length} laws processed (${generated} generated, ${skipped} skipped)`)
    }
  }

  console.log(`[generate:md] completed: ${generated} generated, ${skipped} skipped`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
