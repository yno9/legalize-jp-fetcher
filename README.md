# legalize-jp-fetcher

Fetcher pipeline for [legalize-jp](https://github.com/yno9/legalize-jp) — converts Japanese legislation from the [e-Gov API v2](https://laws.e-gov.go.jp/api/) into Markdown and commits it to the country repo.

## Overview

- **Source**: e-Gov 法令API v2 (`https://laws.e-gov.go.jp/api/2`)
- **Output**: [yno9/legalize-jp](https://github.com/yno9/legalize-jp)
- **Runtime**: Node.js 20 + TypeScript (tsx)

## Structure

```
src/
  fetchAll.ts       # Download all laws and revisions from e-Gov API
  generateMd.ts     # Generate Markdown from cached JSON → commit to legalize-jp
  daily.ts          # Incremental daily update
  parseFullText.ts  # Parse e-Gov JSON law tree into structured elements
  toMarkdown.ts     # Render structured elements to Markdown
  buildPath.ts      # Build element paths (main/a001/p1 etc.)
  gitCommit.ts      # Git commit helpers
  EGovDataSource.ts # e-Gov API client with rate limiting
  types.ts          # TypeScript types

data/
  laws.json         # Law catalog (from /laws endpoint)
  revisions/        # Per-law revision lists
  fulltext/         # Full-text JSON per revision (cached)
```

## Usage

```bash
npm install

# 1. Fetch all laws and revisions (run once for bootstrap)
npm run fetch:all

# 2. Generate Markdown and commit to legalize-jp
LAWMD_REPO_PATH=/path/to/legalize-jp npm run generate:md

# 3. Daily incremental update
LAWMD_REPO_PATH=/path/to/legalize-jp npm run daily
```

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `LAWMD_REPO_PATH` | `../../legalize-jp` | Path to the legalize-jp output repo |
| `DATA_DIR` | `./data` | Path to the data cache directory |
# RESEARCH-JP — Japan (e-Gov)

## 0.1 Official Source

**e-Gov 法令 API v2**
- Base URL: `https://laws.e-gov.go.jp/api/2`
- Operated by: Ministry of Internal Affairs and Communications (総務省)
- License: Government Standard Terms of Use (政府標準利用規約), compatible with CC BY
- Rate limit: 5 requests/second (observed; not officially documented)
- Format: JSON (standardized 法令XML converted to JSON)
- Auth: None required
- robots.txt: No crawl restrictions on the API endpoints
- Historical versions: Available via `/law_revisions/{law_id}` — each revision has
  a full XML snapshot fetchable at `/law_file/json/{law_revision_id}`. Note: the
  API only exposes revisions from approximately 2016 onwards; older pre-digitization
  snapshots are not served.

## 0.2 Fixtures

5 representative laws saved to `research/fixtures/jp/`:

| File | Law | law_id | Type | Revisions in API |
|---|---|---|---|---|
| `fulltext_minpo_20260401.json` + `revisions_minpo.json` | 民法 | `129AC0000000089` | Act | 33 |
| `fulltext_kenpo.json` + `revisions_kenpo.json` | 日本国憲法 | `321CONSTITUTION` | Constitution | 1 |
| `fulltext_keipo.json` + `revisions_keipo.json` | 刑法 | `140AC0000000045` | Act | 16 |
| `fulltext_cabinet_order.json` + `revisions_cabinet_order.json` | 明治五年太政官布告第三百三十七号 | `105DF0000000337` | CabinetOrder | 1 |
| `fulltext_ministerial.json` + `revisions_ministerial.json` | 歳入歳出予算概定順序 | `122M10000001012` | MinisterialOrdinance | 1 |

Note: fixtures are stored in `research/fixtures/jp/` (not `engine/tests/fixtures/jp/`)
because this is an independent TypeScript pipeline, not the legalize-pipeline Python engine.

## 0.3 Metadata Inventory

### `GET /laws` — per-law fields

| Source field | Type | Example | Captured as | Notes |
|---|---|---|---|---|
| `law_info.law_id` | string | `"129AC0000000089"` | `lawId` | Primary identifier |
| `law_info.law_num` | string | `"明治二十九年法律第八十九号"` | `lawNum` | Full law number |
| `law_info.law_num_era` | string\|null | `"Meiji"` | `lawNumEra` | Era name in English |
| `law_info.law_num_year` | int\|null | `29` | `lawNumYear` | Year within era |
| `law_info.law_num_type` | string\|null | `"Act"` | `lawNumType` | Same as law_type |
| `law_info.law_num_num` | string\|null | `"89"` | `lawNumNum` | Numeric part of law number |
| `law_info.law_type` | string | `"Act"` | `lawType` | `Act`, `CabinetOrder`, `MinisterialOrdinance`, `Rule`, `Constitution` |
| `law_info.promulgation_date` | date\|null | `"1896-04-27"` | `promulgationDate` | Original promulgation date |
| `revision_info.law_title` | string | `"民法"` | `title` | Current title |
| `revision_info.law_title_kana` | string\|null | `"みんぽう"` | `titleKana` | Reading in hiragana |
| `revision_info.abbrev` | string\|null | `"改暦の布告"` | `abbrev` | Abbreviation |
| `revision_info.category` | string\|null | `"民事"` | `category` | Legal category |
| `revision_info.updated` | datetime\|null | `"2024-02-15T10:24:49+09:00"` | `updatedAt` | Last catalog update |
| `revision_info.repeal_status` | string | `"None"` | `repealStatus` | `None`, `Repealed`, etc. |
| `revision_info.repeal_date` | date\|null | `null` | `repealDate` | Date of repeal |
| `revision_info.remain_in_force` | boolean | `false` | `remainInForce` | Remain-in-force flag |
| `revision_info.mission` | string\|null | `"New"` | `mission` | Law status label |
| `revision_info.current_revision_status` | string\|null | `"CurrentEnforced"` | `currentRevisionStatus` | `CurrentEnforced`, `PreviousEnforced`, `UnEnforced` |

### `GET /law_revisions/{law_id}` — per-revision fields

| Source field | Type | Example | Captured as | Notes |
|---|---|---|---|---|
| `revisions[].law_revision_id` | string | `"129AC0000000089_20260401_506AC0000000033"` | `revisionId` | Format: `{law_id}_{YYYYMMDD}_{amendment_law_id}` |
| `revisions[].amendment_promulgate_date` | date\|null | `"2024-05-24"` | `promulgatedAt` | Promulgation date of amending law |
| `revisions[].amendment_enforcement_date` | date | `"2026-04-01"` | `enforcedAt` | Effective date → used as `GIT_AUTHOR_DATE` |
| `revisions[].amendment_scheduled_enforcement_date` | date\|null | `null` | `scheduledEnforcedAt` | Scheduled enforcement date |
| `revisions[].amendment_enforcement_comment` | string\|null | `null` | `enforcementComment` | Enforcement notes |
| `revisions[].amendment_law_id` | string\|null | `"506AC0000000033"` | `amendmentLawId` | null for original |
| `revisions[].amendment_law_num` | string\|null | `"令和六年法律第三十三号"` | `amendmentLawNum` | |
| `revisions[].amendment_law_title` | string\|null | `"..."` | `amendmentLawName` | |
| `revisions[].amendment_law_title_kana` | string\|null | `""` | `amendmentLawNameKana` | |
| `revisions[].amendment_type` | string\|null | `"1"` | `amendmentType` | Amendment type code |

## 0.4 Formatting Inventory

From actual inspection of all 5 fulltext fixtures (tag frequencies and structure):

| Construct | e-Gov tag | Count (fixtures) | Legalize output |
|---|---|---|---|
| Law title | `LawTitle` | 6 | Omit (in frontmatter) |
| Part (編) | `Part` / `PartTitle` | 7 | `##` heading |
| Chapter (章) | `Chapter` / `ChapterTitle` | 105 | `###` heading |
| Section (節) | `Section` / `SectionTitle` | 85 | `####` heading |
| Subsection (款) | `Subsection` / `SubsectionTitle` | 53 | `#####` heading |
| Division (目) | `Division` / `DivisionTitle` | 10 | `######` heading |
| Article (条) | `Article` / `ArticleTitle` | 1,845 | `**{ArticleTitle}**` e.g. `**第十条**`; ArticleTitle (kanji) + ArticleCaption combined |
| Article caption | `ArticleCaption` | 1,250 | Appended to ArticleTitle: `**第十条（caption）**` |
| Paragraph (項) | `Paragraph` / `ParagraphSentence` | 3,013 | First paragraph inline after article heading (full-width space); num≥2 prefixed with `**２**　` (bold full-width digit); OldNum="true" paragraphs use `**②**　` (circled number) |
| Paragraph caption | `ParagraphCaption` | 33 | Used as article/node title |
| Sentence | `Sentence` | 4,316 | Inline text (concatenated) |
| Item (号) | `Item` / `ItemTitle` | 505 | `- {ItemTitle}　text` e.g. `- 一　text` (kanji from ItemTitle) |
| Subitem1–10 | `Subitem1`–`Subitem10` | 6+ | Indented `- ` list |
| Article range | `ArticleRange` | 202 | Inline text |
| Column | `Column` | 154 | Inline text (vertical writing mode ignored) |
| Table | `TableStruct` / `Table` / `TableRow` / `TableColumn` | 19 rows | Markdown pipe table |
| Appendix table | `AppdxTable` / `AppdxTableTitle` | 2 | Title as bold, table as pipe table |
| Appendix note | `AppdxNote` / `NoteStruct` / `Note` | 1 | Render children |
| Supplementary provision | `SupplProvision` / `SupplProvisionLabel` | 103 | `## 附則（...）` |
| Ruby (furigana) | `Ruby` / `Rt` | 42 | Strip `Rt`, keep base kanji |
| Remarks | `Remarks` / `RemarksLabel` | 2 | Render children |
| Enact statement | `EnactStatement` | 9 | Plain text |
| Preamble | `Preamble` | 1 | Render children (no own text) |
| TOC | `TOC` | 2 | **Omit** (derivable from structure) |

**Notes:**
- No bold/italic inline markup (`<Strong>`/`<Em>`) found in fixtures
- No hyperlinks (laws reference other laws by text only)
- No mathematical formulas or images found in fixtures
- `Column` with `WritingMode=vertical` → render as inline text
- `TableColumn` has border attributes (`BorderTop` etc.) → ignored for pipe table
- Tables nested inside list contexts (e.g. `AppdxTable` children) render pipe tables
  as block-level text; indentation may cause Markdown parser to not render as table
  in some contexts (known limitation, acceptable for this source)

## 0.5 Version History Spike — GATE: PASS

See `research/fixtures/jp/version-spike.txt` for full evidence.

**Source:** `GET /law_revisions/129AC0000000089` (民法)

- Total revisions returned: **33**
- Past + current (as of 2026-06-18): **31**
- Future: **2** (enforcedAt 2027-12-05, 2028-06-13)
- Earliest available: `2016-10-13`
- Latest current: `2026-04-01`
- Effective date per revision: ✅ (`amendment_enforcement_date`)
- Full text per revision: ✅ (`GET /law_file/json/{law_revision_id}`)

**Known limitation:** The API only exposes revisions from approximately 2016
onwards. Pre-2016 snapshots of 民法 (originally promulgated 1896) are not
available. This applies to all laws — the historical depth is limited to the
API's digitization coverage. No alternative source exists for older snapshots.
Documented here; single-depth-limited ship is acceptable given no alternative.

## 0.6 Scope Estimate

| Metric | Value |
|---|---|
| Total active laws (repeal_status=None) | 8,993 (as of 2026-06-18) |
| Estimated average revisions per law | 5–10 |
| Estimated total revision fetch calls | 45,000–90,000 |
| Fetch rate limit | 5 req/s (observed) |
| Estimated bootstrap fetch time | 3–5 hours |
| Fulltext JSON size (avg) | ~200 KB per revision |
| Estimated total storage | ~10–20 GB for full corpus |

Rate limit strategy: throttle to 5 req/s with retry on failure (exponential backoff,
3 attempts). Large laws (民法, 刑法) may have up to 33 revisions each.

## 0.7 Multi-format Coverage — N/A

**Single-format source. §0.7 N/A.**

e-Gov API v2 serves all law content in one format: standardized 法令XML converted
to JSON via `/law_file/json/{revision_id}`. No PDF, DOCX, DOC, or HTML alternatives
are served through the API.

**Edge case — XML unavailability for old revisions:** Some historical revisions may
return HTTP 404 (no XML snapshot available). The fetcher skips these with a warning.
The fraction of skipped revisions will be measured during bootstrap. No fallback
format exists.

## 0.8 Rank Mapping

| `law_type` | `rank` in frontmatter |
|---|---|
| `Constitution` | `"constitution"` |
| `Act` | `"act"` |
| `CabinetOrder` | `"cabinet_order"` |
| `MinisterialOrdinance` | `"ministerial_ordinance"` |
| `Rule` | `"rule"` |
| (other) | `"other"` |

## 0.9 Key Implementation Notes

- **`law_revision_id` format**: `{law_id}_{enforcedAt YYYYMMDD}_{amendmentLawId}`
  e.g. `129AC0000000089_20260401_506AC0000000033`. Original revision has
  `amendment_law_id = null` and `amendmentLawId = 000000000000000`.
- **GIT_AUTHOR_DATE**: use `amendment_enforcement_date` (enforcedAt), not promulgation date.
- **Future revisions**: `enforcedAt > today` → stored in `laws.json` but not committed yet.
- **ArticleTitle + ArticleCaption**: For Article nodes, `ArticleTitle` (e.g. "第十条")
  and `ArticleCaption` (e.g. "（目的）") are combined into the heading: `**第十条（目的）**`.
  If only `ArticleTitle` is present, it is used directly. Fallback to `Num` attribute
  (Arabic) only when `ArticleTitle` is absent.
- **OldNum paragraphs**: `Paragraph` nodes with `OldNum="true"` have an empty
  `ParagraphNum` tag; the circled number (②③…) is generated from the `Num` attribute
  (e.g. `Num="2"` → `②`).
- **Preamble**: no own text at the container level — render children only to avoid duplication.
- **TableStruct**: converted to Markdown pipe table at parse time; returned as leaf node.

## Status

- [x] 0.1 Official source identified (e-Gov API v2)
- [x] 0.2 5 representative fixtures saved
- [x] 0.3 Metadata inventory complete (all API fields captured)
- [x] 0.4 Formatting inventory complete (all tags verified from fixtures)
- [x] 0.5 Version history spike PASSED (民法: 33 revisions, oldest available 2016-10-13)
- [x] 0.6 Scope estimated (8,993 laws, ~3–5h bootstrap)
- [x] 0.7 Multi-format: N/A (single-format source, documented)
- [x] Steps 1–7: Independent TypeScript pipeline implemented and tested (78 tests passing)
- [ ] Step 9: Bootstrap + push to GitHub
