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
