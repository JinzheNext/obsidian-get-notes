# HANDOFF

## 项目定位

这是一个 Obsidian 插件，用于把 Get 笔记同步到本地知识库。

当前有两条同步路径：

- `openapi`
  - 面向 Get VIP / 会员
  - 通过官方 OpenAPI 同步
  - 数据更完整、更稳定
- `legacy`
  - 面向无 API Key 的普通用户
  - 通过 Get 网页登录 + 导出 ZIP/HTML 同步
  - 更像兼容导入 / 备份路径

## 当前主仓与 live plugin

- 开发仓库：
  `/Users/a1-6/Documents/jerry_projects/obsidian-get-notes`
- 实际运行插件目录：
  `/Users/a1-6/Documents/jerry_info_system/.obsidian/plugins/obsidian-get-notes`

## 当前阶段

当前已进入 `V5: Cross-Mode Output Quality Alignment and User-Friendly Folder Naming`。

重点不再是“能不能同步”，而是：

- 两种模式的内容语义对齐
- 用户可见目录命名产品化
- Legacy 体验优化
- 跨模式去重 / 迁移设计沉淀

## 已完成能力

### OpenAPI 模式

- `Test connection` 改为稳定的 `note/list?since_id=0`
- 支持增量同步
- 支持 raw cache
- 支持 rebuild from cache
- 支持分类目录输出
- 支持本地音频下载
- 修复了“失败却显示 success”的状态问题
- 修复过历史重复文件问题

### 普通登录模式

- 可完成网页登录
- 可复用网页中的最近一次导出
- 不再强依赖频繁点击 `点击导出`
- 支持下载 3GB 级全量 ZIP
- 解压改用系统级工具：
  - macOS: `ditto -x -k`
  - others: `unzip`
- 已增加阶段化状态设计
- 已增加登录态 / 最近登录 / 最近导出展示
- 已将目录结构向 API 模式靠拢

## 当前目录策略

### 当前用户可见目录

V5 目标目录名：

- `API 模式/`
- `普通登录模式/`

### 旧目录

以下旧目录必须继续保留：

- `openapi/`
- `legacy/`
- `legacy/notes/...`

原因：

- 用于对比样本
- 用于验证新结构是否丢数据
- 用于迁移设计与调试

插件当前不应自动删除这些旧目录。

## 关键产品判断

### 1. API 模式是主数据源

API 模式目前明显优于普通登录模式，尤其在这些方面：

- 原始转写更完整
- 智能总结与正文语义更清晰
- note type 更稳定
- `updated_at` 更可靠
- 更适合长期知识库维护

### 2. 普通登录模式不是 API 模式的等价替代

它应被定位为：

- 无 API Key 的 fallback
- 兼容导入路径
- 备份路径

而不是“和 API 完全一样的主同步源”。

### 3. 跨模式合并不能只看目录

真正问题不是：

- 要不要把 `openapi/` 和 `legacy/` 放同一目录

而是：

- 如何识别两条同步路径产出的“是不是同一条笔记”
- 如何防止误合并
- 如何处理 richer source vs partial source

## 当前最重要的文档

- 主问题记录：
  `/Users/a1-6/Documents/jerry_projects/obsidian-get-notes/docs/DEV_ISSUES_LOG.md`
- 发布清单：
  `/Users/a1-6/Documents/jerry_projects/obsidian-get-notes/docs/RELEASE_CHECKLIST.md`
- 输出对比：
  `/Users/a1-6/Documents/jerry_projects/obsidian-get-notes/docs/OUTPUT_COMPARISON.md`
- OpenAPI -> Legacy 迁移设计：
  `/Users/a1-6/Documents/jerry_projects/obsidian-get-notes/docs/OPENAPI_TO_LEGACY_MIGRATION.md`
- 输出质量对齐：
  `/Users/a1-6/Documents/jerry_projects/obsidian-get-notes/docs/OUTPUT_QUALITY_ALIGNMENT.md`
- 跨模式身份设计：
  `/Users/a1-6/Documents/jerry_projects/obsidian-get-notes/docs/CROSS_MODE_IDENTITY.md`

## 当前高优先级待做

### P0

- 完成 V5 的 API 渲染语义修复
  - `03 纯文本记录`
  - `04 链接同步摘抄`
  - 避免 `智能总结` / `笔记内容` 重复

### P1

- 完成 Legacy 渲染语义修复
  - 对音频 / 会议类，避免把总结伪装成原文
  - 缺原文时显示缺失提示

### P2

- 新同步输出切到：
  - `API 模式/`
  - `普通登录模式/`

### P3

- 继续强化普通登录模式阶段状态反馈
  - 下载 ZIP
  - 校验 ZIP
  - 解压
  - 渲染
  - 写入文件

## 发布规则

每次改动后必须执行：

```bash
npm run check
npm run build
npm run preflight
```

部署到 live plugin 后必须验证：

```bash
wc -c /Users/a1-6/Documents/jerry_info_system/.obsidian/plugins/obsidian-get-notes/main.js
cmp -s /Users/a1-6/Documents/jerry_projects/obsidian-get-notes/main.js /Users/a1-6/Documents/jerry_info_system/.obsidian/plugins/obsidian-get-notes/main.js && echo OK || echo DIFF
```

注意：

- 不要只相信 `cp` 成功
- 曾经发生过 live `main.js` 变成 0 字节的事故

## 重要样本

用于 V5 输出质量判断的关键样本：

- API：
  `/Users/a1-6/Documents/jerry_info_system/00_Inbox/020 GetNotes/01 语音记录/0001-AI使用体验记录与工作流优化设想-1908832548952325264.md`
- Legacy：
  `/Users/a1-6/Documents/jerry_info_system/00_Inbox/020 GetNotes/legacy/01 语音记录/0545-AI使用体验记录与工作流优化设想-394a6191c21df8e149b9485ae347ff03.md`

这个样本已经证明：

- API 中同时有总结与原始转写
- Legacy 当前更接近“总结型导出”

## 下一步建议

优先继续 V5：

1. 修完 API / Legacy renderer 语义差异
2. 完成用户目录名切换
3. 跑一次真实对比
4. 再进入 V6 的 cross-mode dry-run 匹配报告
