# OpenAPI to Legacy Migration Design

这个文档描述一个真实用户场景：

- 用户最开始有 Get VIP / API 权限
- 用户通过 OpenAPI 模式把笔记同步进 Obsidian
- 一段时间后不再续费，失去 API 能力
- 用户切换到普通登录模式继续同步
- 用户不希望同一批笔记重复生成两份

## 当前 V4 行为

当前版本不会自动合并 OpenAPI 与 Legacy 输出。

行为如下：

- 输出仍然按模式分开
- 不自动删除旧目录
- 不自动覆盖另一条同步路径的文件
- 对比仍然以人工验证为主

这意味着当前目录仍然是：

```text
{targetFolder}/openapi/
{targetFolder}/legacy/
```

## 为什么现在还不能直接合并

因为“是否是同一条笔记”不是一个简单目录问题，而是身份识别问题。

主要风险包括：

- OpenAPI 有稳定 `noteId`，Legacy 可能没有同样强的身份字段
- 同一笔记可能标题变化
- 同标题可能是不同笔记
- Legacy 可能是全量快照，而不是可靠增量
- 音频、附件、本地文件名在两条路径下不同
- 不小心误判会造成错误覆盖或重复文件

## 未来希望达到的行为

长期希望做到：

- OpenAPI 和 Legacy 只是两种同步来源
- 本地文件身份由“笔记本身”决定，而不是由“同步模式”决定
- 对于强匹配的同一条笔记，只保留一份 Markdown

## 匹配信号

未来可用于跨模式匹配的信号包括：

1. 官方 `noteId`（如果 Legacy 导出中能稳定拿到）
2. 创建时间 / 录音时间
3. 更新时间
4. 标题
5. 笔记类型
6. 内容哈希
7. 正文前缀哈希
8. 音频指纹或音频元数据
9. 链接类笔记的源 URL
10. 附件元数据

## 匹配置信度

建议未来定义四档：

- `strong`
- `medium`
- `weak`
- `none`

### Strong Match

可以自动更新已有 OpenAPI 文件。

示例：

- 同一官方 `noteId`
- 同一源 URL + 同一创建时间 + 高相似内容哈希
- 同一音频指纹 + 同一创建时间

### Medium Match

先出 dry-run 报告，不自动覆盖。

示例：

- 同标题 + 同创建时间 + 内容相似
- 同标题 + 同源 URL

### Weak Match

不自动合并。

示例：

- 只有标题相同
- 只有时间接近
- 只有内容相似

### No Match

创建新文件。

## 推荐的未来 rollout

不要一步到位做“统一目录自动合并”。

推荐分阶段：

1. `separate_by_mode`
   - 继续 `openapi/` 与 `legacy/` 分开
2. `unified_with_dry_run`
   - 先生成匹配报告，不自动覆盖
3. `unified_auto_strong_matches_only`
   - 只对强匹配自动复用已有文件
4. `user_confirmed_medium_matches`
   - 中等匹配由用户确认

## 风险列表

- false positive merge：不同笔记被错误合并
- false negative duplicate：同一笔记未识别，生成两份
- Obsidian 内部链接失效
- 标题改名导致路径变化
- 用户手工编辑过 Markdown
- Legacy 导出不完整或导出的是旧快照

## 当前建议

V4 只做：

- 保留分模式目录
- 改善普通登录模式体验
- 保留对比样本
- 沉淀迁移设计

不要在 V4 直接做自动合并。
