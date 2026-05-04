# Obsidian Get Notes

[简体中文](./README.md)

An Obsidian desktop plugin that syncs notes from Get official OpenAPI into your vault.

## Features

- Sync notes from Get official OpenAPI using `API Key` and `Client ID`
- First-time full sync plus incremental sync by `noteId` and `updated_at`
- Re-sync edited notes without renaming existing Markdown files
- Write clean Markdown into your vault
- Classify notes into fixed folders:
  - `01 语音记录`
  - `02 多人会议`
  - `03 纯文本记录`
  - `04 链接同步摘抄`
- Download audio into `{targetFolder}/_assets/audio/`
- Private raw cache and sync state stored inside plugin data
- Startup auto-sync, interval auto-sync, and manual sync

## Installation

### Manual install

1. Download `main.js`, `manifest.json`, and `styles.css` from the latest GitHub Release.
2. Create a folder named `obsidian-get-notes` inside your vault:
   `.obsidian/plugins/obsidian-get-notes`
3. Put those three files into the folder.
4. Reload Obsidian and enable the plugin.

## Setup

1. Open plugin settings.
2. Fill in your `API Key` and `Client ID`.
3. Confirm the target folder. Default is `00_Inbox/020 GetNotes`.
4. Click `Test connection`.
5. Click `Sync now`.

Get OpenAPI keys:
[https://www.biji.com/openapi?tab=keys](https://www.biji.com/openapi?tab=keys)

## Behavior

- The plugin writes Markdown into the vault.
- The plugin does not expose raw JSON into the vault.
- Private raw cache and sync state are stored in the plugin data area.
- Existing user files like `index.md` are not modified or deleted.
- The plugin only manages its own category folders and `_assets/audio`.
- Chinese filenames are preserved by default for better readability inside Obsidian.

## Development

```bash
npm install
npm run check
npm run build
```

See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for details.
