import type { LawElementNode } from './types.js'

const RANK_MAP: Record<string, string> = {
  Act: 'act',
  CabinetOrder: 'cabinet_order',
  MinisterialOrdinance: 'ministerial_ordinance',
  Rule: 'rule',
  Constitution: 'constitution',
  ImperialOrder: 'imperial_order',
}

export interface LawMeta {
  lawId: string
  lawNum: string
  lawType: string
  title: string
  titleKana: string | null
  abbrev: string | null
  category: string | null
  promulgationDate: string | null  // Original law promulgation date
  enforcedAt: string
  status: 'in_force' | 'repealed'
}


const HEADING_LEVEL: Record<string, number> = {
  Part: 2,
  Chapter: 3,
  Section: 4,
  Subsection: 5,
  Division: 6,
}

function renderNode(node: LawElementNode, itemDepth: number): string {
  const parts: string[] = []

  switch (node.elementType) {
    case 'MainProvision':
    case 'Preamble': {
      for (const child of node.children) {
        const r = renderNode(child, 0)
        if (r) parts.push(r)
      }
      break
    }

    case 'Part':
    case 'Chapter':
    case 'Section':
    case 'Subsection':
    case 'Division': {
      const hashes = '#'.repeat(HEADING_LEVEL[node.elementType]!)
      const heading = node.title ?? node.elementType
      parts.push(`${hashes} ${heading}`)
      for (const child of node.children) {
        const r = renderNode(child, 0)
        if (r) parts.push(r)
      }
      break
    }

    case 'Article': {
      // Use ArticleTitle (kanji) + ArticleCaption combined from node.title
      // Fallback to Num attribute if title is missing
      const heading = node.title
        ? `**${node.title}**`
        : `**第${(node.num ?? '').replace(/_/g, 'の')}条**`

      // First paragraph text goes on the same line as the heading (separated by fullwidth space)
      const [firstChild, ...restChildren] = node.children
      if (firstChild?.elementType === 'Paragraph') {
        const firstLine = firstChild.text ? `${heading}　${firstChild.text}` : heading
        parts.push(firstLine)
        for (const child of firstChild.children) {
          const r = renderNode(child, 0)
          if (r) parts.push(r)
        }
      } else {
        parts.push(heading)
        if (firstChild) {
          const r = renderNode(firstChild, 0)
          if (r) parts.push(r)
        }
      }
      for (const child of restChildren) {
        const r = renderNode(child, 0)
        if (r) parts.push(r)
      }
      break
    }

    case 'Paragraph': {
      if (node.text) {
        parts.push(node.text)
      }
      for (const child of node.children) {
        const r = renderNode(child, 0)
        if (r) parts.push(r)
      }
      break
    }

    case 'Item':
    case 'Subitem1':
    case 'Subitem2':
    case 'Subitem3':
    case 'Subitem4':
    case 'Subitem5':
    case 'Subitem6':
    case 'Subitem7':
    case 'Subitem8':
    case 'Subitem9':
    case 'Subitem10': {
      const indent = '  '.repeat(itemDepth)
      const itemLines: string[] = []
      if (node.text) {
        const prefix = node.title ? `${node.title}　` : ''
        itemLines.push(`${indent}- ${prefix}${node.text}`)
      }
      for (const child of node.children) {
        const r = renderNode(child, itemDepth + 1)
        if (r) itemLines.push(r)
      }
      if (itemLines.length > 0) parts.push(itemLines.join('\n'))
      break
    }

    case 'SupplProvision': {
      const label = node.num ? `附則（${node.num}）` : '附則'
      parts.push(`## ${label}`)
      for (const child of node.children) {
        const r = renderNode(child, 0)
        if (r) parts.push(r)
      }
      break
    }

    case 'TableStruct': {
      if (node.text) parts.push(node.text)
      break
    }

    default: {
      if (node.title) parts.push(`**${node.title}**`)
      // Suppress text if children will render it
      if (node.text && node.children.length === 0) parts.push(node.text)
      for (const child of node.children) {
        const r = renderNode(child, 0)
        if (r) parts.push(r)
      }
      break
    }
  }

  return parts.join('\n\n')
}

export function toMarkdown(meta: LawMeta, elements: LawElementNode[]): string {
  const rank = RANK_MAP[meta.lawType] ?? 'other'
  const publicationDate = meta.promulgationDate ?? meta.enforcedAt
  const source = `https://laws.e-gov.go.jp/law/${meta.lawId}`

  const extraLines = [
    meta.titleKana ? `  law_title_kana: "${meta.titleKana}"` : null,
    meta.abbrev ? `  abbrev: "${meta.abbrev}"` : null,
    meta.category ? `  category: "${meta.category}"` : null,
    `  law_num: "${meta.lawNum}"`,
    `  law_type: "${meta.lawType}"`,
    `  enforced_at: "${meta.enforcedAt}"`,
  ].filter((l): l is string => l !== null)

  const frontmatterLines = [
    '---',
    `title: "${meta.title}"`,
    `identifier: "${meta.lawId}"`,
    `country: "jp"`,
    `rank: "${rank}"`,
    `publication_date: "${publicationDate}"`,
    `last_updated: "${meta.enforcedAt}"`,
    `status: "${meta.status}"`,
    `source: "${source}"`,
    extraLines.length > 0 ? `extra:` : null,
    ...extraLines,
    '---',
  ]
    .filter((l): l is string => l !== null)
    .join('\n')

  const body = elements
    .map((el) => renderNode(el, 0))
    .filter((s) => s !== '')
    .join('\n\n')

  return `${frontmatterLines}\n\n${body}\n`
}

// ─── Essential (Logseq bullet format) ───────────────────────────────

// Exclude titles that are just article numbers like "第一条" or "第三条の二"
const KANJI_ARTICLE_NUM = /^第[一二三四五六七八九十百千万]+条(の[一二三四五六七八九十百千万]+)*$/

function articleCaption(title: string | null): string | null {
  if (!title) return null
  return KANJI_ARTICLE_NUM.test(title) ? null : title
}

function renderNodeEssential(node: LawElementNode, depth: number): string {
  const indent = '  '.repeat(depth)
  const lines: string[] = []

  switch (node.elementType) {
    case 'MainProvision': {
      for (const child of node.children) {
        lines.push(renderNodeEssential(child, depth))
      }
      break
    }

    case 'Part':
    case 'Chapter':
    case 'Section':
    case 'Subsection':
    case 'Division': {
      const heading = node.title ?? node.elementType
      lines.push(`${indent}- ${heading}`)
      for (const child of node.children) {
        lines.push(renderNodeEssential(child, depth + 1))
      }
      break
    }

    case 'Article': {
      const articleNum = node.title
        ? node.title.replace(/（.*）$/, '')
        : `第${(node.num ?? '').replace(/_/g, 'の')}条`
      const caption = articleCaption(
        node.title ? node.title.replace(/^第[^（]*/, '') || null : null
      )
      const titlePart = caption ? caption : ''
      lines.push(`${indent}- ${articleNum}${titlePart}`)
      for (const child of node.children) {
        lines.push(renderNodeEssential(child, depth + 1))
      }
      break
    }

    case 'Paragraph': {
      if (node.text) {
        lines.push(`${indent}- ${node.text}`)
      }
      for (const child of node.children) {
        lines.push(renderNodeEssential(child, depth + 1))
      }
      break
    }

    case 'Item':
    case 'Subitem1':
    case 'Subitem2':
    case 'Subitem3':
    case 'Subitem4':
    case 'Subitem5':
    case 'Subitem6':
    case 'Subitem7':
    case 'Subitem8':
    case 'Subitem9':
    case 'Subitem10': {
      if (node.text) {
        const prefix = node.title ? `${node.title}　` : (node.num ? `${node.num}　` : '')
        lines.push(`${indent}- ${prefix}${node.text}`)
      }
      for (const child of node.children) {
        lines.push(renderNodeEssential(child, depth + 1))
      }
      break
    }

    case 'SupplProvision': {
      const label = node.num ? `附則（${node.num}）` : '附則'
      lines.push(`${indent}- ${label}`)
      for (const child of node.children) {
        lines.push(renderNodeEssential(child, depth + 1))
      }
      break
    }

    default: {
      if (node.title) {
        lines.push(`${indent}- ${node.title}`)
      }
      if (node.text) {
        lines.push(`${indent}- ${node.text}`)
      }
      for (const child of node.children) {
        lines.push(renderNodeEssential(child, depth + 1))
      }
      break
    }
  }

  return lines.filter((l) => l.trim() !== '-' && l !== '').join('\n')
}

export function toMarkdownEssential(meta: LawMeta, elements: LawElementNode[]): string {
  const frontmatter = [
    '---',
    `title: "${meta.title}"`,
    `identifier: "${meta.lawId}"`,
    `enforced_at: "${meta.enforcedAt}"`,
    `law_num: "${meta.lawNum}"`,
    `law_type: "${meta.lawType}"`,
    '---',
  ].join('\n')

  const body = elements
    .map((el) => renderNodeEssential(el, 0))
    .filter((s) => s !== '')
    .join('\n')

  return `${frontmatter}\n\n${body}\n`
}
