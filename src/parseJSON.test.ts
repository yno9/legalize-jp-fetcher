import { describe, it, expect } from 'vitest'
import { parseFullText } from './parseJSON.js'
import type { LawNode } from './types.js'

// Helper to construct minimal LawNode trees for testing
function node(tag: string, attr: Record<string, string> = {}, children: (LawNode | string)[] = []): LawNode {
  return { tag, attr, children }
}

// Minimal law tree with one article and one paragraph
function simpleLaw(): LawNode {
  return node('Law', { Lang: 'ja' }, [
    node('LawNum', {}, ['令和元年法律第一号']),
    node('LawBody', {}, [
      node('LawTitle', {}, ['テスト法']),
      node('MainProvision', {}, [
        node('Article', { Num: '1' }, [
          node('ArticleTitle', {}, ['目的']),
          node('Paragraph', { Num: '1' }, [
            node('ParagraphNum', {}, []),
            node('ParagraphSentence', {}, [
              node('Sentence', {}, ['この法律はテストのための法律である。']),
            ]),
          ]),
        ]),
      ]),
    ]),
  ])
}

describe('parseFullText', () => {
  it('LawBodyがない場合は空配列', () => {
    const result = parseFullText(node('Law', {}, []))
    expect(result).toEqual([])
  })

  it('MainProvisionを返す', () => {
    const result = parseFullText(simpleLaw())
    expect(result).toHaveLength(1)
    expect(result[0].elementType).toBe('MainProvision')
    expect(result[0].path).toBe('main')
  })

  it('Article のpathが main/a001', () => {
    const result = parseFullText(simpleLaw())
    const article = result[0].children[0]
    expect(article.elementType).toBe('Article')
    expect(article.path).toBe('main/a001')
    expect(article.num).toBe('1')
  })

  it('ArticleTitle が title に入る', () => {
    const result = parseFullText(simpleLaw())
    const article = result[0].children[0]
    expect(article.title).toBe('目的')
  })

  it('Paragraph のpathが main/a001/p1', () => {
    const result = parseFullText(simpleLaw())
    const para = result[0].children[0].children[0]
    expect(para.elementType).toBe('Paragraph')
    expect(para.path).toBe('main/a001/p1')
  })

  it('Sentence のテキストが text に入る', () => {
    const result = parseFullText(simpleLaw())
    const para = result[0].children[0].children[0]
    expect(para.text).toBe('この法律はテストのための法律である。')
  })

  it('TOCはスキップされる', () => {
    const law = node('Law', {}, [
      node('LawBody', {}, [
        node('TOC', {}, [node('TOCLabel', {}, ['目次'])]),
        node('MainProvision', {}, []),
      ]),
    ])
    const result = parseFullText(law)
    expect(result).toHaveLength(1)
    expect(result[0].elementType).toBe('MainProvision')
  })

  it('SupplProvision のpathにAmendLawNumが入る', () => {
    const law = node('Law', {}, [
      node('LawBody', {}, [
        node('MainProvision', {}, []),
        node('SupplProvision', { AmendLawNum: '平成一五年五月三〇日法律第六一号' }, [
          node('Article', { Num: '1' }, [
            node('Paragraph', { Num: '1' }, [
              node('ParagraphSentence', {}, [node('Sentence', {}, ['附則条文'])]),
            ]),
          ]),
        ]),
      ]),
    ])
    const result = parseFullText(law)
    const suppl = result[1]
    expect(suppl.elementType).toBe('SupplProvision')
    expect(suppl.path).toBe('suppl/平成一五年五月三〇日法律第六一号')

    const article = suppl.children[0]
    expect(article.path).toBe('suppl/平成一五年五月三〇日法律第六一号/a001')
  })

  it('ChapterTitle が title に入る', () => {
    const law = node('Law', {}, [
      node('LawBody', {}, [
        node('MainProvision', {}, [
          node('Chapter', { Num: '1' }, [
            node('ChapterTitle', {}, ['総則']),
          ]),
        ]),
      ]),
    ])
    const result = parseFullText(law)
    const chapter = result[0].children[0]
    expect(chapter.elementType).toBe('Chapter')
    expect(chapter.title).toBe('総則')
  })

  it('AmendLawNumなしのSupplProvision → __original__', () => {
    const law = node('Law', {}, [
      node('LawBody', {}, [
        node('SupplProvision', {}, []),
      ]),
    ])
    const result = parseFullText(law)
    expect(result[0].path).toBe('suppl/__original__')
  })
})
