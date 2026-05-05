# V3 Dual Sync Mode MVP Manual Test Report

Date: 2026-05-05

## Scope

This report covers the V3 MVP work for:

- sync mode selection
- dual sync routing
- unified sync result summary
- separate output folders
- minimal legacy compatibility integration

## OpenAPI Mode

Status: validated in live Obsidian vault before V3 integration

Observed results:

- `Test connection` succeeds with valid credentials
- latest note sync works
- counters for added / updated / skipped matched the live vault result
- duplicate historical files were cleaned separately
- rebuild from cache remained available for OpenAPI mode only

Output folder:

- `00_Inbox/020 GetNotes/openapi/`

## Legacy Export Mode

Status: validated through real export flow and parser smoke test before V3 integration

Observed results:

- current Get export page could be opened
- export task could be created and tracked
- ZIP download could be triggered successfully
- real exported ZIP contained note HTML files
- sample HTML notes could be parsed into Markdown

Integrated plugin status:

- V3 plugin build passes
- legacy runtime dependency is installed in the live plugin folder
- final in-app Obsidian UI smoke test is still recommended

Output folder:

- `00_Inbox/020 GetNotes/legacy/`

## Build Validation

- `npm run check` passed
- `npm run build` passed

## Known Limitations

- Legacy mode remains experimental and depends on Get web page stability
- Legacy mode does not promise precise incremental counters like OpenAPI mode
- OpenAPI and legacy state are intentionally not unified in V3
- A final in-app manual legacy sync smoke test is still recommended before broader use
