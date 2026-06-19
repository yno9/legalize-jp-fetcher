const RANK_MAP = {
    Act: 'act',
    CabinetOrder: 'cabinet_order',
    MinisterialOrdinance: 'ministerial_ordinance',
    Rule: 'rule',
    Constitution: 'constitution',
    ImperialOrder: 'imperial_order',
};
// Exclude titles that are just article numbers like "第一条" or "第三条の二"
const KANJI_ARTICLE_NUM = /^第[一二三四五六七八九十百千万]+条(の[一二三四五六七八九十百千万]+)*$/;
function articleTitle(title) {
    if (!title)
        return null;
    return KANJI_ARTICLE_NUM.test(title) ? null : title;
}
const HEADING_LEVEL = {
    Part: 2,
    Chapter: 3,
    Section: 4,
    Subsection: 5,
    Division: 6,
};
function renderNode(node, itemDepth) {
    const parts = [];
    switch (node.elementType) {
        case 'MainProvision':
        case 'Preamble': {
            for (const child of node.children) {
                const r = renderNode(child, 0);
                if (r)
                    parts.push(r);
            }
            break;
        }
        case 'Part':
        case 'Chapter':
        case 'Section':
        case 'Subsection':
        case 'Division': {
            const hashes = '#'.repeat(HEADING_LEVEL[node.elementType]);
            const heading = node.title ?? node.elementType;
            parts.push(`${hashes} ${heading}`);
            for (const child of node.children) {
                const r = renderNode(child, 0);
                if (r)
                    parts.push(r);
            }
            break;
        }
        case 'Article': {
            const articleNum = (node.num ?? '').replace(/_/g, 'の');
            const rawTitle = articleTitle(node.title);
            // ArticleCaption already includes （）; other titles need wrapping
            const titlePart = rawTitle
                ? (rawTitle.startsWith('（') && rawTitle.endsWith('）') ? rawTitle : `（${rawTitle}）`)
                : '';
            parts.push(`**第${articleNum}条${titlePart}**`);
            for (const child of node.children) {
                const r = renderNode(child, 0);
                if (r)
                    parts.push(r);
            }
            break;
        }
        case 'Paragraph': {
            if (node.text) {
                const numPrefix = node.num && node.num !== '1' ? `${node.num}　` : '';
                parts.push(`${numPrefix}${node.text}`);
            }
            for (const child of node.children) {
                const r = renderNode(child, 0);
                if (r)
                    parts.push(r);
            }
            break;
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
            const indent = '  '.repeat(itemDepth);
            const itemLines = [];
            if (node.text) {
                const prefix = node.num ? `${node.num}　` : '';
                itemLines.push(`${indent}- ${prefix}${node.text}`);
            }
            for (const child of node.children) {
                const r = renderNode(child, itemDepth + 1);
                if (r)
                    itemLines.push(r);
            }
            if (itemLines.length > 0)
                parts.push(itemLines.join('\n'));
            break;
        }
        case 'SupplProvision': {
            const label = node.num ? `附則（${node.num}）` : '附則';
            parts.push(`## ${label}`);
            for (const child of node.children) {
                const r = renderNode(child, 0);
                if (r)
                    parts.push(r);
            }
            break;
        }
        case 'TableStruct': {
            if (node.text)
                parts.push(node.text);
            break;
        }
        default: {
            if (node.title)
                parts.push(`**${node.title}**`);
            // Suppress text if children will render it
            if (node.text && node.children.length === 0)
                parts.push(node.text);
            for (const child of node.children) {
                const r = renderNode(child, 0);
                if (r)
                    parts.push(r);
            }
            break;
        }
    }
    return parts.join('\n\n');
}
export function toMarkdown(meta, elements) {
    const rank = RANK_MAP[meta.lawType] ?? 'other';
    const publicationDate = meta.promulgationDate ?? meta.enforcedAt;
    const source = `https://laws.e-gov.go.jp/law/${meta.lawId}`;
    const extraLines = [
        meta.titleKana ? `  law_title_kana: "${meta.titleKana}"` : null,
        meta.category ? `  category: "${meta.category}"` : null,
        `  law_num: "${meta.lawNum}"`,
        `  law_type: "${meta.lawType}"`,
        `  enforced_at: "${meta.enforcedAt}"`,
    ].filter((l) => l !== null);
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
        .filter((l) => l !== null)
        .join('\n');
    const body = elements
        .map((el) => renderNode(el, 0))
        .filter((s) => s !== '')
        .join('\n\n');
    return `${frontmatterLines}\n\n${body}\n`;
}
