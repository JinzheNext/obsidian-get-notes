# Changelog

## Unreleased

## 0.2.0

- Added V5 unified output pipeline based on `CanonicalNote`
- Unified `API 模式` and `普通登录模式` into the same final folder structure:
  - `01 语音记录`
  - `02 多人会议`
  - `03 纯文本记录`
  - `04 链接同步摘抄`
  - `99 其他`
  - `_assets`
- Added `deleted` sync protection:
  - user-deleted notes are no longer auto-restored
  - unchanged notes no longer rewrite Markdown or attachments
- Added `schemaVersion = 2` sync state keyed by `canonicalId`
- Added dry-run migration report:
  - `.obsidian/plugins/obsidian-get-notes/reports/migration-report.json`
- Improved Legacy import:
  - explicit `data-json` decode entry with safe fallback
  - HTML fallback no longer pretends summary text is full transcript
  - can enrich Legacy imports from local API raw cache when both sources exist
- Improved title matching robustness across HTML entity variants
- Replaced old frontmatter-heavy note rendering with a fixed user-facing Markdown layout
- Improved README and user guide for public release

## 0.1.0

- Initial release
- Sync Get notes from official OpenAPI
- Incremental sync by `noteId` and `updated_at`
- Private raw cache and sync state
- Fixed Obsidian folder classification
- Startup sync, interval sync, and manual sync
