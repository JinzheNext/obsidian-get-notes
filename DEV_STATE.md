# DEV_STATE

## Branch / Repo

- Repo:
  `/Users/a1-6/Documents/jerry_projects/obsidian-get-notes`
- Live plugin:
  `/Users/a1-6/Documents/jerry_info_system/.obsidian/plugins/obsidian-get-notes`

## Current Objective

Continue V5:

- fix output semantics
- improve user-facing folder naming
- preserve old comparison outputs
- prepare cross-mode identity / dedup design

## What Is Stable

### OpenAPI

- basic sync works
- connection test works
- raw cache works
- rebuild works
- category folders work

### Legacy

- login works
- recent-export reuse works
- >2 GiB ZIP handling works with system unzip
- stage-aware status model exists
- old comparison output is preserved

## What Is Not Fully Done

- API renderer still needs final type-aware cleanup
- Legacy renderer still needs stricter “summary vs original content” separation
- user-facing new folders need final end-to-end validation
- status text needs one more real-world UX pass

## Current Folder Policy

### Keep

- `openapi/`
- `legacy/`
- `legacy/notes/...`

### New target naming

- `API 模式/`
- `普通登录模式/`

No automatic deletion.
No automatic merge.
No overwrite across modes.

## Product Decisions Locked

- API mode is preferred when data conflicts
- legacy is fallback / compatibility path
- title is only a candidate match signal
- title alone is not enough for strong identity
- merge must be dry-run first in a later version

## Files To Check First Before Continuing

- `/Users/a1-6/Documents/jerry_projects/obsidian-get-notes/src/render/MarkdownRenderer.ts`
- `/Users/a1-6/Documents/jerry_projects/obsidian-get-notes/src/legacy/render.ts`
- `/Users/a1-6/Documents/jerry_projects/obsidian-get-notes/src/utils/modePaths.ts`
- `/Users/a1-6/Documents/jerry_projects/obsidian-get-notes/docs/DEV_ISSUES_LOG.md`
- `/Users/a1-6/Documents/jerry_projects/obsidian-get-notes/docs/OUTPUT_QUALITY_ALIGNMENT.md`
- `/Users/a1-6/Documents/jerry_projects/obsidian-get-notes/docs/CROSS_MODE_IDENTITY.md`

## Known Runtime Reality

- Legacy sync can spend a long time only downloading ZIP
- before ZIP finishes, user may see “sync in progress” but no folder changes
- this is expected for large full exports
- UX must explain current stage clearly

## Handoff Rule

Whenever new findings appear:

1. update
   `/Users/a1-6/Documents/jerry_projects/obsidian-get-notes/docs/DEV_ISSUES_LOG.md`
2. if it changes product direction, also update:
   - `OUTPUT_COMPARISON.md`
   - `OPENAPI_TO_LEGACY_MIGRATION.md`
   - `OUTPUT_QUALITY_ALIGNMENT.md`
   - `CROSS_MODE_IDENTITY.md`

## Pre-Release Rule

Always run:

```bash
npm run check
npm run build
npm run preflight
```

Then verify live plugin bundle equality:

```bash
wc -c /Users/a1-6/Documents/jerry_info_system/.obsidian/plugins/obsidian-get-notes/main.js
cmp -s /Users/a1-6/Documents/jerry_projects/obsidian-get-notes/main.js /Users/a1-6/Documents/jerry_info_system/.obsidian/plugins/obsidian-get-notes/main.js && echo OK || echo DIFF
```
