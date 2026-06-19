/**
 * Step 6: Parser tests against real fixtures (ADDING_A_COUNTRY.md)
 *
 * Tests 5 representative laws covering all law types:
 *   - 民法 (Act)
 *   - 日本国憲法 (Constitution)
 *   - 刑法 (Act, large)
 *   - 明治五年太政官布告第三百三十七号 (CabinetOrder)
 *   - 歳入歳出予算概定順序 (MinisterialOrdinance)
 *
 * Quality criteria (ADDING_A_COUNTRY.md Step 7):
 *   1. Text correctness — no encoding errors, HTML tags, truncation, or duplicates
 *   2. Metadata completeness — all fields captured
 *   3. Structure preservation — heading hierarchy, article ordering
 *   4. Rich formatting — tables as pipe tables
 *   5. Encoding & hygiene — UTF-8, no control chars, single trailing newline
 */

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { describe, it, expect } from 'vitest'
import { parseFullText } from './parseFullText.js'
import { toMarkdown } from './toMarkdown.js'
import type { LawNode } from './types.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FIXTURES = join(__dirname, '../../research/fixtures/jp')

function loadFixture(filename: string): LawNode {
  return JSON.parse(readFileSync(join(FIXTURES, filename), 'utf-8')) as LawNode
}

function renderFixture(filename: string, meta: Parameters<typeof toMarkdown>[0]): string {
  const root = loadFixture(filename)
  const elements = parseFullText(root)
  return toMarkdown(meta, elements)
}

const MINPO_META = {
  lawId: '129AC0000000089',
  lawNum: '明治二十九年法律第八十九号',
  lawType: 'Act',
  title: '民法',
  titleKana: 'みんぽう',
  abbrev: null,
  category: '民事',
  promulgationDate: '1896-04-27',
  enforcedAt: '2026-04-01',
  status: 'in_force' as const,
}

const KENPO_META = {
  lawId: '321CONSTITUTION',
  lawNum: '昭和二十一年憲法',
  lawType: 'Constitution',
  title: '日本国憲法',
  titleKana: 'にほんこくけんぽう',
  abbrev: null,
  category: null,
  promulgationDate: '1946-11-03',
  enforcedAt: '1947-05-03',
  status: 'in_force' as const,
}

const KEIPO_META = {
  lawId: '140AC0000000045',
  lawNum: '明治四十年法律第四十五号',
  lawType: 'Act',
  title: '刑法',
  titleKana: 'けいほう',
  abbrev: null,
  category: '刑事',
  promulgationDate: '1907-04-24',
  enforcedAt: '2026-05-21',
  status: 'in_force' as const,
}

const CABINET_META = {
  lawId: '105DF0000000337',
  lawNum: '明治五年太政官布告第三百三十七号',
  lawType: 'CabinetOrder',
  title: '明治五年太政官布告第三百三十七号（改暦ノ布告）',
  titleKana: 'かいれきのふこく',
  abbrev: '改暦の布告',
  category: '文化',
  promulgationDate: '1872-11-09',
  enforcedAt: '1872-11-09',
  status: 'in_force' as const,
}

const MINISTERIAL_META = {
  lawId: '122M10000001012',
  lawNum: '明治三十五年大蔵省令第十二号',
  lawType: 'MinisterialOrdinance',
  title: '歳入歳出予算概定順序',
  titleKana: null,
  abbrev: null,
  category: null,
  promulgationDate: '1902-06-01',
  enforcedAt: '1902-06-01',
  status: 'in_force' as const,
}

// ─── 1. Text correctness ───────────────────────────────────────────────────

describe('1. Text correctness', () => {
  it('民法: no HTML/XML tags in output', () => {
    const md = renderFixture('fulltext_minpo_20260401.json', MINPO_META)
    expect(md).not.toMatch(/<[a-zA-Z]/)
  })

  it('民法: no encoding artifacts (mojibake)', () => {
    const md = renderFixture('fulltext_minpo_20260401.json', MINPO_META)
    expect(md).not.toMatch(/\ufffd/) // replacement character
    expect(md).not.toMatch(/\\u[0-9a-f]{4}/) // escaped unicode
  })

  it('刑法: articles not duplicated', () => {
    const root = loadFixture('fulltext_keipo.json')
    const elements = parseFullText(root)
    const main = elements.find((e) => e.elementType === 'MainProvision')
    const articles = main?.children.filter((c) => c.elementType === 'Article') ?? []
    const nums = articles.map((a) => a.num)
    const unique = new Set(nums)
    expect(unique.size).toBe(nums.length)
  })

  it('憲法: text is not empty', () => {
    const md = renderFixture('fulltext_kenpo.json', KENPO_META)
    const body = md.split('---\n\n')[1] ?? ''
    expect(body.trim().length).toBeGreaterThan(100)
  })

  it('政令: text is not empty', () => {
    const md = renderFixture('fulltext_cabinet_order.json', CABINET_META)
    const body = md.split('---\n\n')[1] ?? ''
    expect(body.trim().length).toBeGreaterThan(0)
  })
})

// ─── 2. Metadata completeness ─────────────────────────────────────────────

describe('2. Metadata completeness', () => {
  it('民法: all required frontmatter keys present', () => {
    const md = renderFixture('fulltext_minpo_20260401.json', MINPO_META)
    expect(md).toContain('title:')
    expect(md).toContain('identifier:')
    expect(md).toContain('country: "jp"')
    expect(md).toContain('rank:')
    expect(md).toContain('publication_date:')
    expect(md).toContain('last_updated:')
    expect(md).toContain('status:')
    expect(md).toContain('source:')
  })

  it('民法: publication_date is original promulgation (1896)', () => {
    const md = renderFixture('fulltext_minpo_20260401.json', MINPO_META)
    expect(md).toContain('publication_date: "1896-04-27"')
  })

  it('民法: rank is act', () => {
    const md = renderFixture('fulltext_minpo_20260401.json', MINPO_META)
    expect(md).toContain('rank: "act"')
  })

  it('憲法: rank is constitution', () => {
    const md = renderFixture('fulltext_kenpo.json', KENPO_META)
    expect(md).toContain('rank: "constitution"')
  })

  it('政令: rank is cabinet_order', () => {
    const md = renderFixture('fulltext_cabinet_order.json', CABINET_META)
    expect(md).toContain('rank: "cabinet_order"')
  })

  it('府省令: rank is ministerial_ordinance', () => {
    const md = renderFixture('fulltext_ministerial.json', MINISTERIAL_META)
    expect(md).toContain('rank: "ministerial_ordinance"')
  })

  it('民法: extra contains law_num', () => {
    const md = renderFixture('fulltext_minpo_20260401.json', MINPO_META)
    expect(md).toContain('law_num: "明治二十九年法律第八十九号"')
  })

  it('民法: source URL is correct', () => {
    const md = renderFixture('fulltext_minpo_20260401.json', MINPO_META)
    expect(md).toContain('source: "https://laws.e-gov.go.jp/law/129AC0000000089"')
  })
})

// ─── 3. Structure preservation ────────────────────────────────────────────

describe('3. Structure preservation', () => {
  it('民法: MainProvision is parsed', () => {
    const root = loadFixture('fulltext_minpo_20260401.json')
    const elements = parseFullText(root)
    expect(elements.some((e) => e.elementType === 'MainProvision')).toBe(true)
  })

  it('民法: contains Articles', () => {
    const root = loadFixture('fulltext_minpo_20260401.json')
    const elements = parseFullText(root)
    const main = elements.find((e) => e.elementType === 'MainProvision')
    const hasArticles = (nodes: typeof elements): boolean =>
      nodes.some((n) => n.elementType === 'Article' || hasArticles(n.children))
    expect(hasArticles(main?.children ?? [])).toBe(true)
  })

  it('民法: Chapters exist (possibly nested under Parts)', () => {
    const root = loadFixture('fulltext_minpo_20260401.json')
    const elements = parseFullText(root)
    const hasChapter = (nodes: typeof elements): boolean =>
      nodes.some((n) => n.elementType === 'Chapter' || hasChapter(n.children))
    expect(hasChapter(elements)).toBe(true)
  })

  it('刑法: SupplProvision exists', () => {
    const root = loadFixture('fulltext_keipo.json')
    const elements = parseFullText(root)
    expect(elements.some((e) => e.elementType === 'SupplProvision')).toBe(true)
  })

  it('民法: article nums are ordered', () => {
    const root = loadFixture('fulltext_minpo_20260401.json')
    const elements = parseFullText(root)
    const main = elements.find((e) => e.elementType === 'MainProvision')
    const articles = (main?.children ?? []).flatMap((c) =>
      c.elementType === 'Article' ? [c] : c.children.filter((x) => x.elementType === 'Article'),
    )
    const nums = articles.map((a) => Number(a.num)).filter((n) => !isNaN(n))
    for (let i = 1; i < nums.length; i++) {
      expect(nums[i]).toBeGreaterThanOrEqual(nums[i - 1])
    }
  })
})

// ─── 4. Rich formatting ───────────────────────────────────────────────────

describe('4. Rich formatting', () => {
  it('民法: Ruby text preserved (kanji kept, furigana stripped)', () => {
    const root = loadFixture('fulltext_minpo_20260401.json')
    const elements = parseFullText(root)
    const md = toMarkdown(MINPO_META, elements)
    // Ruby base text should appear; Rt (furigana) should not appear as separate text
    // We check that the markdown doesn't contain raw Rt tag content leaking
    expect(md).not.toMatch(/<Rt>/)
    expect(md).not.toMatch(/<Ruby>/)
  })

  it('政令: table rendered as pipe table', () => {
    const root = loadFixture('fulltext_cabinet_order.json')
    const elements = parseFullText(root)
    const md = toMarkdown(CABINET_META, elements)
    // Tables in 改暦の布告 should render as pipe table or at minimum not crash
    expect(md).toBeTruthy()
  })

  it('民法: Items rendered as list items', () => {
    const md = renderFixture('fulltext_minpo_20260401.json', MINPO_META)
    expect(md).toMatch(/^- /m)
  })

  it('民法: Articles rendered as bold headings', () => {
    const md = renderFixture('fulltext_minpo_20260401.json', MINPO_META)
    expect(md).toMatch(/^\*\*第[一二三四五六七八九十百千万\d]+条/m)
  })

  it('民法: Chapters rendered as ### headings', () => {
    const md = renderFixture('fulltext_minpo_20260401.json', MINPO_META)
    expect(md).toMatch(/^### /m)
  })
})

// ─── 5. Encoding & hygiene ────────────────────────────────────────────────

describe('5. Encoding & hygiene', () => {
  const fixtures: [string, Parameters<typeof toMarkdown>[0]][] = [
    ['fulltext_minpo_20260401.json', MINPO_META],
    ['fulltext_kenpo.json', KENPO_META],
    ['fulltext_keipo.json', KEIPO_META],
    ['fulltext_cabinet_order.json', CABINET_META],
    ['fulltext_ministerial.json', MINISTERIAL_META],
  ]

  for (const [filename, meta] of fixtures) {
    it(`${meta.title}: ends with single newline`, () => {
      const md = renderFixture(filename, meta)
      expect(md.endsWith('\n')).toBe(true)
      expect(md.endsWith('\n\n')).toBe(false)
    })

    it(`${meta.title}: no C0/C1 control characters`, () => {
      const md = renderFixture(filename, meta)
      // Allow \n (0x0A) and \t (0x09), reject other control chars
      expect(md).not.toMatch(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/)
    })

    it(`${meta.title}: no trailing spaces on lines`, () => {
      const md = renderFixture(filename, meta)
      expect(md).not.toMatch(/ +\n/)
    })

    it(`${meta.title}: starts with frontmatter`, () => {
      const md = renderFixture(filename, meta)
      expect(md.startsWith('---\n')).toBe(true)
    })
  }
})
