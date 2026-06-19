// Path key generation logic
// Examples: main/a003/p2/i1, suppl/__original__/a001

export type PathContext = {
  section: 'main' | 'suppl' | 'appdx'
  amendLawNum?: string // AmendLawNum from SupplProvision; defaults to __original__
  appdxIndex?: number  // orderIndex within appdx section
}

const ARTICLE_TYPES = new Set(['Article', 'SupplProvisionAppdxTable', 'SupplProvisionAppdxStyle'])
const PARA_TYPES = new Set(['Paragraph'])
const ITEM_TYPES = new Set(['Item'])
const SUBITEM_PATTERN = /^Subitem(\d+)$/

export function buildPath(
  elementType: string,
  num: string | null,
  orderIndex: number,
  parentPath: string,
  ctx: PathContext,
): string {
  // Root-level sections
  if (elementType === 'MainProvision') return 'main'
  if (elementType === 'SupplProvision') {
    const key = ctx.amendLawNum ?? '__original__'
    return `suppl/${key}`
  }
  if (elementType.startsWith('Appdx')) {
    return `appdx/${orderIndex}`
  }

  // Elements within main/suppl provisions
  if (elementType === 'Article') {
    const n = num ? num.padStart(3, '0') : String(orderIndex).padStart(3, '0')
    return `${parentPath}/a${n}`
  }
  if (elementType === 'Paragraph') {
    const n = num ?? String(orderIndex + 1)
    return `${parentPath}/p${n}`
  }
  if (elementType === 'Item') {
    const n = num ?? String(orderIndex + 1)
    return `${parentPath}/i${n}`
  }
  const subitemMatch = elementType.match(SUBITEM_PATTERN)
  if (subitemMatch) {
    const level = subitemMatch[1]
    const n = num ?? String(orderIndex + 1)
    return `${parentPath}/s${level}-${n}`
  }

  // Structural elements: Chapter, Part, Section, etc.
  if (['Part', 'Chapter', 'Section', 'Subsection', 'Division'].includes(elementType)) {
    const tag = elementType.slice(0, 3).toLowerCase()
    const n = num ? num.padStart(2, '0') : String(orderIndex).padStart(2, '0')
    return `${parentPath}/${tag}${n}`
  }

  // Fallback for other elements (TableStruct, etc.)
  return `${parentPath}/${elementType.toLowerCase()}_${orderIndex}`
}
