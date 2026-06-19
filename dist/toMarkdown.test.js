import { describe, it, expect } from 'vitest';
import { toMarkdown } from './toMarkdown.js';
const baseMeta = {
    lawId: '129AC0000000089',
    lawNum: '明治二十九年法律第八十九号',
    lawType: 'Act',
    title: '民法',
    titleKana: 'みんぽう',
    category: '民事',
    promulgationDate: '1896-04-27',
    enforcedAt: '2024-04-01',
    status: 'in_force',
};
function el(elementType, overrides = {}, children = []) {
    return {
        elementType,
        num: null,
        title: null,
        text: null,
        orderIndex: 0,
        path: '',
        children,
        ...overrides,
    };
}
describe('toMarkdown', () => {
    describe('フロントマター', () => {
        it('YAMLフロントマター形式', () => {
            const md = toMarkdown(baseMeta, []);
            expect(md).toContain('---');
            expect(md).toContain('identifier: "129AC0000000089"');
            expect(md).not.toContain('::');
        });
    });
    describe('条文レンダリング', () => {
        it('Articleのタイトルあり → 第N条（タイトル）', () => {
            const article = el('Article', { num: '1', title: '目的' }, [
                el('Paragraph', { num: '1', text: 'この法律は〜' }),
            ]);
            const md = toMarkdown(baseMeta, [el('MainProvision', {}, [article])]);
            expect(md).toContain('**第1条（目的）**');
        });
        it('Article num に _ → のに変換', () => {
            const article = el('Article', { num: '605_2' });
            const md = toMarkdown(baseMeta, [el('MainProvision', {}, [article])]);
            expect(md).toContain('**第605の2条**');
        });
        it('Articleのタイトルが漢数字条番号のみ → タイトルなし扱い', () => {
            const article = el('Article', { num: '1', title: '第一条' });
            const md = toMarkdown(baseMeta, [el('MainProvision', {}, [article])]);
            expect(md).toContain('**第1条**');
            expect(md).not.toContain('（第一条）');
        });
        it('Articleのタイトルなし → 第N条', () => {
            const article = el('Article', { num: '2' });
            const md = toMarkdown(baseMeta, [el('MainProvision', {}, [article])]);
            expect(md).toContain('**第2条**');
            expect(md).not.toContain('（）');
        });
        it('Paragraph: 第1項は番号なし、第2項以降は番号あり', () => {
            const para1 = el('Paragraph', { num: '1', text: '本文テキスト' });
            const para2 = el('Paragraph', { num: '2', text: '第2項テキスト' });
            const article = el('Article', { num: '1' }, [para1, para2]);
            const md = toMarkdown(baseMeta, [el('MainProvision', {}, [article])]);
            expect(md).toContain('本文テキスト');
            expect(md).toContain('2　第2項テキスト');
            expect(md).not.toContain('1　');
        });
        it('Chapter titleあり', () => {
            const chapter = el('Chapter', { title: '総則' });
            const md = toMarkdown(baseMeta, [el('MainProvision', {}, [chapter])]);
            expect(md).toContain('### 総則');
        });
        it('SupplProvision → 附則', () => {
            const suppl = el('SupplProvision', {});
            const md = toMarkdown(baseMeta, [suppl]);
            expect(md).toContain('## 附則');
        });
    });
});
