# Obsidian Get Notes

[English](./README.en.md)

一个 Obsidian 桌面插件，用来通过 Get 官方 OpenAPI 将笔记同步到你的 Vault。

## 功能特性

- 使用 `API Key` 和 `Client ID` 连接 Get 官方 OpenAPI
- 支持首次全量同步，以及基于 `noteId` 和 `updated_at` 的增量同步
- 笔记被编辑后自动重新同步，但不会重命名已有 Markdown 文件
- 将笔记写入当前 Vault 的指定目录
- 按固定类型分类写入：
  - `01 语音记录`
  - `02 多人会议`
  - `03 纯文本记录`
  - `04 链接同步摘抄`
- 将音频下载到 `{targetFolder}/_assets/audio/`
- 私有保存 raw 缓存和同步状态，不污染 Vault
- 支持启动自动同步、定时同步和手动同步

## 安装

### 手动安装

1. 从最新 GitHub Release 下载 `main.js`、`manifest.json` 和 `styles.css`
2. 在你的 Vault 下创建插件目录：
   `.obsidian/plugins/obsidian-get-notes`
3. 将这三个文件放入该目录
4. 重启 Obsidian，并在社区插件页面启用插件

## 配置

1. 打开插件设置
2. 填写 `API Key` 和 `Client ID`
3. 确认同步目标目录，默认是 `00_Inbox/020 GetNotes`
4. 点击 `Test connection`
5. 点击 `Sync now`

Get OpenAPI 申请入口：
[https://www.biji.com/openapi?tab=keys](https://www.biji.com/openapi?tab=keys)

## 行为说明

- 插件只会把最终 Markdown 写入 Vault
- 原始 JSON 缓存和同步状态保存在插件私有数据区
- 默认不会修改或删除用户自己的文件，例如 `index.md`
- 插件只管理自己的分类目录和 `_assets/audio`
- 默认保留中文文件名，优先保证在 Obsidian 中浏览和检索的直观性

## 开发

```bash
npm install
npm run check
npm run build
```

更多说明见 [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)。
