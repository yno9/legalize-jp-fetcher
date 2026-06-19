import 'dotenv/config';
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { EGovDataSource } from './datasource/EGovDataSource.js';
const __dirname = dirname(fileURLToPath(import.meta.url));
const catalog = new Set(JSON.parse(readFileSync(join(__dirname, 'catalog.json'), 'utf-8')).map((e) => e.lawId));
const DATA_DIR = process.env['DATA_DIR'] ?? join(__dirname, '../../data');
const FULLTEXT_DIR = join(DATA_DIR, 'fulltext');
const REVISIONS_DIR = join(DATA_DIR, 'revisions');
async function main() {
    mkdirSync(FULLTEXT_DIR, { recursive: true });
    mkdirSync(REVISIONS_DIR, { recursive: true });
    const ds = new EGovDataSource();
    // 1. Fetch law list
    console.log('[fetchAll] fetching law list...');
    const laws = await ds.fetchLaws();
    const filtered = laws.filter((l) => catalog.has(l.lawId));
    console.log(`[fetchAll] ${filtered.length} laws fetched`);
    const today = new Date().toISOString().slice(0, 10);
    const entries = [];
    for (let i = 0; i < filtered.length; i++) {
        const law = filtered[i];
        process.stdout.write(`[${i + 1}/${filtered.length}] ${law.title} ... `);
        // 2. Fetch and save revision list
        const revisions = await ds.fetchRevisions(law.lawId);
        writeFileSync(join(REVISIONS_DIR, `${law.lawId}.json`), JSON.stringify(revisions, null, 2));
        const current = revisions
            .filter((r) => r.enforcedAt <= today)
            .sort((a, b) => b.enforcedAt.localeCompare(a.enforcedAt))[0] ?? null;
        const futures = revisions.filter((r) => r.enforcedAt > today)
            .sort((a, b) => a.enforcedAt.localeCompare(b.enforcedAt));
        entries.push({
            ...law,
            current: current ? { revisionId: current.revisionId, enforcedAt: current.enforcedAt, promulgatedAt: current.promulgatedAt ?? null } : null,
            future: futures.map((r) => ({ revisionId: r.revisionId, enforcedAt: r.enforcedAt, promulgatedAt: r.promulgatedAt ?? null })),
        });
        // 3. Fetch and save fulltext (skip if already cached)
        const toFetch = [...(current ? [current] : []), ...futures];
        let fetched = 0;
        for (const revision of toFetch) {
            const dest = join(FULLTEXT_DIR, `${revision.revisionId}.json`);
            if (existsSync(dest)) {
                fetched++;
                continue;
            }
            try {
                const root = await ds.fetchFullText(revision.revisionId);
                writeFileSync(dest, JSON.stringify(root, null, 2));
                fetched++;
            }
            catch {
                console.warn(`  skip (unavailable: ${revision.revisionId})`);
            }
        }
        console.log(`done (${fetched}/${toFetch.length} revisions)`);
    }
    // 4. Save enriched laws.json
    writeFileSync(join(DATA_DIR, 'laws.json'), JSON.stringify(entries, null, 2));
    console.log(`[fetchAll] laws.json saved (${entries.length} laws)`);
    console.log('[fetchAll] completed');
}
main().catch((e) => {
    console.error(e);
    process.exit(1);
});
