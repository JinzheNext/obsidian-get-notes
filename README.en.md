# Obsidian Get Notes

[简体中文](./README.md)

[![GitHub release](https://img.shields.io/github/v/release/Jerry-Shan/obsidian-get-notes?label=release)](https://github.com/Jerry-Shan/obsidian-get-notes/releases)
[![Obsidian](https://img.shields.io/badge/Obsidian-1.6.0%2B-7C3AED)](https://obsidian.md)
[![License](https://img.shields.io/github/license/Jerry-Shan/obsidian-get-notes)](./LICENSE)

An Obsidian desktop plugin for syncing **Get Notes** into your vault.

It supports two sync entry points:

- `API Mode`
  Best for users with Get OpenAPI access. This mode usually provides richer and more complete content.
- `Normal Login Mode`
  Best for users without an API key. This mode syncs through the official Get web export flow and is better suited for low-frequency sync, import, or backup scenarios.

No matter which mode you use, the plugin writes into **one unified folder structure** instead of creating two separate knowledge bases.

---

## Why it is useful

- Two sync modes, one final folder structure
- Unified Markdown rendering and asset organization
- Manual sync, startup auto-sync, and interval auto-sync
- Delete protection: notes you remove manually will not be recreated automatically
- Idempotent sync: unchanged notes and assets are not rewritten repeatedly
- Normal Login Mode supports large ZIP downloads, progress updates, and staged status messages
- Dry-run migration report for moving from older folder layouts
- Raw cache, sync state, and migration reports stay inside plugin data instead of polluting your notes folder

---

## Feature overview

### API Mode

- Sync Get OpenAPI with `API Key` + `Client ID`
- Full first sync, then incremental sync
- Audio and meeting notes are usually more complete than in Normal Login Mode
- Local raw cache support
- Rebuild from cache support

### Normal Login Mode

- No API key required
- Syncs through the official Get web login and export flow
- Reuses the latest export whenever possible to reduce rate-limit friction
- Supports very large ZIP downloads and system-level unzip
- Shows staged progress and download progress
- Uses local API raw cache as enrichment when available

---

## Mode comparison

| Dimension | API Mode | Normal Login Mode |
| --- | --- | --- |
| Best for | Users with OpenAPI access | Users without API access |
| Data completeness | Higher | Limited by official export content |
| Sync method | API fetch | Web export ZIP |
| Speed | Faster | First sync may take longer |
| Best frequency | Frequent daily sync | Low-frequency sync / import / backup |
| Recommendation | Primary choice | Compatible fallback |

Quick recommendation:

- If you can use the API, prefer `API Mode`
- If you cannot, you can still start directly with `Normal Login Mode`

---

## Output structure

Default target folder:

```text
00_Inbox/020 GetNotes/
  01 Voice Notes/
  02 Meetings/
  03 Text Notes/
  04 Link Clips/
  99 Others/
  _assets/
    audio/
    images/
    files/
```

The actual folder names remain the Chinese names used by the plugin:

- `01 语音记录`
- `02 多人会议`
- `03 纯文本记录`
- `04 链接同步摘抄`
- `99 其他`
- `_assets`

---

## Screenshots

### Getting API credentials

![Get OpenAPI create page](./docs/assets/readme/api-openapi-create.png)

![Get OpenAPI key example](./docs/assets/readme/api-keys-example.png)

### Normal Login download progress

![Normal Login download progress](./docs/assets/readme/legacy-download-progress.png)

---

## Installation

### Requirements

- `Obsidian 1.6.0` or newer
- A local desktop vault
- `Playwright`
  Required only for `Normal Login Mode`
- `Node.js`
  Needed only if you want to build from source

### Recommended: let an Agent configure it for you

If you already use Codex, Claude, Qoder, OpenClaw, or another coding agent, the easiest path is to let the agent help you:

- install or update the plugin files
- install `Playwright`
- deploy the plugin into your Obsidian vault
- verify that the plugin loads correctly

This is the smoothest option, especially for first-time setup of `Normal Login Mode`.

### Option 1: install from GitHub Release

Best for most users.

1. Download from the latest [GitHub Release](https://github.com/Jerry-Shan/obsidian-get-notes/releases):
   - `main.js`
   - `manifest.json`
   - `styles.css`
2. Create the plugin folder in your vault:
   `.obsidian/plugins/obsidian-get-notes`
3. Put those three files into the folder
4. Reload Obsidian
5. Enable `Get Notes`

If you want to use `Normal Login Mode`, install Playwright too:

```bash
npx playwright@1.43.1 install
```

Notes:

- `Normal Login Mode` depends on Playwright for web login and export automation
- Without Playwright, `Normal Login Mode` will not work
- `API Mode` does not depend on Playwright

### Option 2: build from source

Best for developers or users who want to customize the plugin.

1. Clone the repository

```bash
git clone https://github.com/Jerry-Shan/obsidian-get-notes.git
cd obsidian-get-notes
```

2. Install dependencies

```bash
npm install
```

3. Install Playwright if you plan to use Normal Login Mode

```bash
npx playwright@1.43.1 install
```

4. Build the plugin

```bash
npm run build
```

5. Copy these files into your vault plugin directory:

- `main.js`
- `manifest.json`
- `styles.css`

Target directory:

```text
.obsidian/plugins/obsidian-get-notes/
```

6. Reload Obsidian and enable `Get Notes`

---

## Quick start

### Option A: you have API credentials

1. Open plugin settings
2. Choose `API Mode`
3. Fill in `API Key`
4. Fill in `Client ID`
5. Click `Test connection`
6. Click `Sync now`

Get OpenAPI keys:
[https://www.biji.com/openapi?tab=keys](https://www.biji.com/openapi?tab=keys)

### Option B: you do not have API credentials

1. Open plugin settings
2. Choose `Normal Login Mode`
3. Click `Open Normal Login`
4. Complete login in the browser
5. Return to Obsidian and click `Sync now`

The first sync in Normal Login Mode may download a very large full export ZIP. Be patient. This mode is more suitable for low-frequency sync, import, or backup usage.

---

## Sync behavior

### What the plugin does

- Converts Get notes into Markdown
- Writes files into fixed category folders
- Stores audio, images, and files inside `_assets`
- Maintains private raw cache, sync state, and migration reports

### What the plugin does not do

- It does not dump raw API JSON into your notes folder
- It does not restore notes you deleted manually
- It does not arbitrarily modify your unrelated vault files
- It does not keep separate final folders for API Mode and Normal Login Mode

---

## Known limitations

### 1. Normal Login Mode is not guaranteed to be as complete as API Mode

This is the most important limitation.

The reason is not only in the plugin. The HTML / ZIP content exported by Get itself may be less complete than what the API provides, especially for:

- audio notes
- meeting notes

In some cases, Normal Login Mode captures something closer to a summarized text instead of the most complete original body.

### 2. Normal Login Mode is closer to a snapshot import

It depends on:

- web login
- export tasks
- large ZIP download
- local unzip and rebuild

So it is better suited for:

- low-frequency sync
- compatibility import
- backup import

It should not be treated as a full equivalent of high-frequency API sync.

### 3. Normal Login Mode still depends on Get web structure

If Get changes its website flow later, this mode may need maintenance.

### 4. Legacy `data-json` still has room for improvement

Normal Login Mode is already usable and stable, but there is still room to improve content completeness for some note types.

---

## Usage recommendations

### If you have API access

Use `API Mode` as your long-term primary sync method.

### If you do not have API access

You can still start directly with `Normal Login Mode`.

### If you start with Normal Login Mode now and switch to API later

That is supported.

The plugin is designed to keep both modes aligned to one final folder structure instead of splitting them into separate knowledge bases.

---

## FAQ

### Why is Normal Login Mode slower?

Because it often needs to:

1. wait for the export task
2. download a large ZIP
3. unzip the archive
4. parse the export content
5. rebuild Markdown and assets

This is a characteristic of the sync method itself, not simply the plugin being stuck.

### Why does the folder not change immediately?

That does not always mean it is frozen.

Normal Login Mode often finishes the large ZIP download first, and only then starts writing files. The plugin now tries to show clearer stage messages and download progress.

### If I manually delete a synced note, will it come back?

No.

The plugin treats that as a user deletion and will not automatically restore it later.

### Will cache files keep growing forever?

Not without limits.

The ZIP uses a fixed cache path, and the plugin periodically cleans up stale temp folders, screenshots, and old ZIP artifacts. API raw cache stays in plugin-private storage and is useful for rebuild and enrichment.

### Will the plugin mess up my vault?

No.

It only manages the Markdown files, assets, and plugin-private state generated by this plugin.

---

## Documentation

- User guide: [docs/USER_GUIDE.zh-CN.md](docs/USER_GUIDE.zh-CN.md)
- Changelog: [CHANGELOG.md](CHANGELOG.md)
- Development notes: [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)

---

## Development

```bash
npm install
npm run check
npm run build
npm run preflight
```

See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for more details.

---

## Feedback and contribution

If you find a bug or want to improve the plugin, feel free to:

- open an [Issue](https://github.com/Jerry-Shan/obsidian-get-notes/issues)
- submit a Pull Request
- share real-world feedback about sync quality, folder structure, and user experience

The goal of this plugin is not just to "work somehow", but to become a reliable long-term sync solution for Get Notes users.

---

## Acknowledgements

Thanks to [Obsidian](https://obsidian.md) for providing a powerful knowledge management platform.  
Thanks to Get Notes for providing a great note-taking service.  
Thanks to similar projects for inspiration, especially [get-to-obsidian](https://github.com/geekhuashan/get-to-obsidian).  
Thanks to all contributors and users for the support and feedback.
