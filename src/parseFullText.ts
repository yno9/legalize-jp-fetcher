import type { LawNode, LawElementNode } from './types.js'
import { buildPath, type PathContext } from './buildPath.js'

// Recursively extract text, excluding Rt (ruby annotation) nodes
function extractText(node: LawNode | string): string {
  if (typeof node === 'string') return node
  if (node.tag === 'Rt') return ''
  return node.children.map(extractText).join('')
}

// Find direct children with a given tag
function findChildren(node: LawNode, tag: string): LawNode[] {
  return node.children.filter(
    (c): c is LawNode => typeof c !== 'string' && c.tag === tag,
  )
}

// Stop recursion at these tags to avoid mixing item sentences into parent text
const SENTENCE_BOUNDARY_TAGS = new Set([
  'Item', 'Subitem1', 'Subitem2', 'Subitem3', 'Subitem4', 'Subitem5',
  'Subitem6', 'Subitem7', 'Subitem8', 'Subitem9', 'Subitem10',
])

// Collect Sentence nodes, stopping at SENTENCE_BOUNDARY_TAGS
function collectSentences(node: LawNode): LawNode[] {
  const result: LawNode[] = []
  for (const child of node.children) {
    if (typeof child === 'string') continue
    if (SENTENCE_BOUNDARY_TAGS.has(child.tag)) continue
    if (child.tag === 'Sentence') {
      result.push(child)
    } else {
      result.push(...collectSentences(child))
    }
  }
  return result
}

// Concatenate all Sentence text within a node
function extractSentences(node: LawNode): string | null {
  const sentences = collectSentences(node)
  if (sentences.length === 0) return null
  return sentences.map(extractText).join('')
}

// Build a Markdown pipe table from a TableStruct node
function buildPipeTable(tableStruct: LawNode): string {
  const table = tableStruct.children.find(
    (c): c is LawNode => typeof c !== 'string' && c.tag === 'Table',
  )
  if (!table) return extractText(tableStruct).trim()

  const rows = table.children.filter(
    (c): c is LawNode => typeof c !== 'string' && c.tag === 'TableRow',
  )
  if (rows.length === 0) return ''

  const tableData = rows.map((row) =>
    row.children
      .filter((c): c is LawNode => typeof c !== 'string' && c.tag === 'TableColumn')
      .map((col) => extractText(col).replace(/\|/g, '\\|').replace(/\n/g, ' ').trim()),
  )

  const maxCols = Math.max(...tableData.map((r) => r.length))
  if (maxCols === 0) return ''

  const padRow = (row: string[]) => {
    while (row.length < maxCols) row.push('')
    return '| ' + row.join(' | ') + ' |'
  }
  const separator = '| ' + Array(maxCols).fill('---').join(' | ') + ' |'

  return [padRow(tableData[0] ?? []), separator, ...tableData.slice(1).map(padRow)].join('\n')
}

// Tags to skip during parsing:
// - TOC: table of contents (can be derived)
// - PageNum: page numbers
// - LawNum/LawTitle: duplicated in laws.json
// - *Title/*Caption/*Label: extracted into parent node's title field
// - *Num: extracted into parent node's num field
// - *Sentence/Column: extracted via collectSentences into parent's text field
// - Ruby/Rt: ruby annotations
// - Table/TableRow/TableColumn: handled by buildPipeTable inside TableStruct
const SKIP_TAGS = new Set([
  'TOC', 'PageNum',
  'LawNum', 'LawTitle',
  // Title tags
  'PartTitle', 'ChapterTitle', 'SectionTitle', 'SubsectionTitle', 'DivisionTitle',
  'ArticleTitle', 'ArticleCaption', 'ParagraphCaption', 'SupplProvisionLabel',
  'AppdxTableTitle', 'AppdxStyleTitle', 'AppdxFigTitle', 'AppdxNoteTitle',
  'AppdxFormatTitle', 'AppdxTitle',
  'SupplProvisionAppdxTableTitle', 'SupplProvisionAppdxStyleTitle',
  'RemarksLabel', 'FigStructTitle', 'TableStructTitle', 'NoteStructTitle',
  'StyleStructTitle', 'FormatStructTitle',
  // Num tags
  'ParagraphNum', 'ItemTitle', 'Subitem1Title', 'Subitem2Title', 'Subitem3Title',
  'Subitem4Title', 'Subitem5Title', 'Subitem6Title', 'Subitem7Title',
  'Subitem8Title', 'Subitem9Title', 'Subitem10Title',
  // Sentence wrapper tags
  'ParagraphSentence', 'ItemSentence', 'Subitem1Sentence', 'Subitem2Sentence',
  'Subitem3Sentence', 'Subitem4Sentence', 'Subitem5Sentence', 'Subitem6Sentence',
  'Subitem7Sentence', 'Subitem8Sentence', 'Subitem9Sentence', 'Subitem10Sentence',
  'Column', 'Sentence',
  // Ruby annotations
  'Ruby', 'Rt',
  // Table internals: handled as pipe table inside TableStruct
  'Table', 'TableRow', 'TableColumn',
])

function parseNode(
  node: LawNode,
  parentPath: string,
  orderIndex: number,
  ctx: PathContext,
): LawElementNode | null {
  if (SKIP_TAGS.has(node.tag)) return null

  const num = node.attr['Num'] ?? null

  // Propagate AmendLawNum from SupplProvision into context
  let childCtx = ctx
  if (node.tag === 'SupplProvision') {
    childCtx = {
      section: 'suppl',
      amendLawNum: node.attr['AmendLawNum'],
    }
  } else if (node.tag === 'MainProvision') {
    childCtx = { section: 'main' }
  } else if (node.tag.startsWith('Appdx')) {
    childCtx = { section: 'appdx', appdxIndex: orderIndex }
  }

  const path = buildPath(node.tag, num, orderIndex, parentPath, childCtx)

  // TableStruct: render as pipe table, no children
  if (node.tag === 'TableStruct') {
    const tableText = buildPipeTable(node)
    return { elementType: 'TableStruct', num: null, title: null, text: tableText, orderIndex, path, children: [] }
  }

  // title extraction
  let title: string | null
  if (node.tag === 'Article') {
    // Combine ArticleTitle (kanji num, e.g. "第十条") + ArticleCaption (e.g. "（目的）")
    const articleTitleText = findChildren(node, 'ArticleTitle').map(extractText).join('')
    const captionText = findChildren(node, 'ArticleCaption').map(extractText).join('')
    title = (articleTitleText + captionText) || null
  } else {
    const titleTag = `${node.tag}Title`
    const titleNode =
      findChildren(node, 'ArticleCaption')[0] ??
      findChildren(node, titleTag)[0] ??
      findChildren(node, 'ArticleTitle')[0] ??
      findChildren(node, 'ParagraphCaption')[0]
    title = titleNode ? extractText(titleNode) : null
  }

  // text: for Paragraph, prepend bold full-width paragraph number if present
  // Normal paragraphs: ParagraphNum tag contains full-width digit (e.g. "２")
  // OldNum="true" paragraphs: ParagraphNum is empty; convert Num attr to full-width
  const paragraphNumNode = node.tag === 'Paragraph' ? findChildren(node, 'ParagraphNum')[0] : undefined
  const paragraphNumText = (() => {
    if (node.tag !== 'Paragraph') return null
    const raw = paragraphNumNode ? extractText(paragraphNumNode).trim() : ''
    if (raw) return raw
    if (node.attr['OldNum'] === 'true') {
      const n = parseInt(node.attr['Num'] ?? '', 10)
      if (n >= 1 && n <= 20) return String.fromCodePoint(0x245f + n) // ①=0x2460
    }
    return null
  })()
  const sentenceText = extractSentences(node)
  const text = paragraphNumText
    ? `**${paragraphNumText}**　${sentenceText ?? ''}`.trimEnd() || null
    : sentenceText

  // Recursively parse children
  const children: LawElementNode[] = []
  let childOrder = 0
  for (const child of node.children) {
    if (typeof child === 'string') continue
    const parsed = parseNode(child, path, childOrder, childCtx)
    if (parsed) {
      children.push(parsed)
      childOrder++
    }
  }

  return { elementType: node.tag, num, title, text, orderIndex, path, children }
}

export function parseFullText(root: LawNode): LawElementNode[] {
  // root is the Law tag; process contents of LawBody
  const lawBody = root.children.find(
    (c): c is LawNode => typeof c !== 'string' && c.tag === 'LawBody',
  )
  if (!lawBody) return []

  const result: LawElementNode[] = []
  let orderIndex = 0
  const ctx: PathContext = { section: 'main' }

  for (const child of lawBody.children) {
    if (typeof child === 'string') continue
    const parsed = parseNode(child, '', orderIndex, ctx)
    if (parsed) {
      result.push(parsed)
      orderIndex++
    }
  }

  return result
}
