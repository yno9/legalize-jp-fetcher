import { describe, it, expect } from 'vitest';
import { buildPath } from './buildPath.js';
const main = { section: 'main' };
const suppl = { section: 'suppl', amendLawNum: '平成一五年五月三〇日法律第六一号' };
const supplOriginal = { section: 'suppl' };
describe('buildPath', () => {
    describe('セクションルート', () => {
        it('MainProvision → main', () => {
            expect(buildPath('MainProvision', null, 0, '', main)).toBe('main');
        });
        it('SupplProvision with AmendLawNum', () => {
            expect(buildPath('SupplProvision', null, 0, '', suppl)).toBe('suppl/平成一五年五月三〇日法律第六一号');
        });
        it('SupplProvision without AmendLawNum → __original__', () => {
            expect(buildPath('SupplProvision', null, 0, '', supplOriginal)).toBe('suppl/__original__');
        });
        it('Appdx系 → appdx/{orderIndex}', () => {
            expect(buildPath('AppdxTable', null, 2, '', { section: 'appdx', appdxIndex: 2 })).toBe('appdx/2');
        });
    });
    describe('Article', () => {
        it('numを3桁ゼロ埋め', () => {
            expect(buildPath('Article', '3', 0, 'main', main)).toBe('main/a003');
        });
        it('2桁num', () => {
            expect(buildPath('Article', '12', 0, 'main', main)).toBe('main/a012');
        });
        it('3桁num', () => {
            expect(buildPath('Article', '100', 0, 'main', main)).toBe('main/a100');
        });
        it('numなしはorderIndexで代替', () => {
            expect(buildPath('Article', null, 4, 'main', main)).toBe('main/a004');
        });
    });
    describe('Paragraph', () => {
        it('main/a003/p2', () => {
            expect(buildPath('Paragraph', '2', 0, 'main/a003', main)).toBe('main/a003/p2');
        });
        it('numなしはorderIndex+1', () => {
            expect(buildPath('Paragraph', null, 1, 'main/a003', main)).toBe('main/a003/p2');
        });
    });
    describe('Item', () => {
        it('main/a003/p1/i2', () => {
            expect(buildPath('Item', '2', 0, 'main/a003/p1', main)).toBe('main/a003/p1/i2');
        });
    });
    describe('Subitem', () => {
        it('Subitem1 → s1-{num}', () => {
            expect(buildPath('Subitem1', '3', 0, 'main/a003/p1/i2', main)).toBe('main/a003/p1/i2/s1-3');
        });
        it('Subitem2 → s2-{num}', () => {
            expect(buildPath('Subitem2', '1', 0, 'main/a003/p1/i2/s1-3', main)).toBe('main/a003/p1/i2/s1-3/s2-1');
        });
    });
    describe('構造要素', () => {
        it('Chapter → cha{num:02d}', () => {
            expect(buildPath('Chapter', '2', 0, 'main', main)).toBe('main/cha02');
        });
        it('Part → par{num:02d}', () => {
            expect(buildPath('Part', '1', 0, 'main', main)).toBe('main/par01');
        });
        it('Section → sec{num:02d}', () => {
            expect(buildPath('Section', '3', 0, 'main/cha02', main)).toBe('main/cha02/sec03');
        });
    });
    describe('附則内のArticle', () => {
        it('suppl内のArticle', () => {
            expect(buildPath('Article', '1', 0, 'suppl/__original__', supplOriginal)).toBe('suppl/__original__/a001');
        });
    });
});
