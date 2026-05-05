# Output Comparison

这个文档用于解释为什么 `openapi/` 和 `legacy/` 当前仍然分开，以及如何手动比较两种导出结果。

## 当前策略

当前仍然保留两套输出目录：

```text
{targetFolder}/openapi/
{targetFolder}/legacy/
```

原因：

- 方便比较 OpenAPI 与普通登录模式的产出质量
- 避免不同同步路径在身份未完全打通之前互相覆盖
- 避免错误地把同标题不同笔记、同笔记不同标题混成一份
- 方便定位 Markdown、附件、字段保真度上的差异

## 为什么旧 `legacy/notes/...` 先不删

现有的旧版 `legacy/notes/...` 目录在 V4 里会刻意保留。

原因：

- 它是历史对照样本
- 可以验证新的分类目录结构是否丢内容
- 可以帮助定位普通登录模式的旧逻辑与新逻辑差异

V4 不会自动清理这些旧目录。

后续如果要清理，应该走显式动作，例如：

- 生成 cleanup report
- 归档旧 legacy 输出
- 用户确认后再手动删除

## 如何比较两种输出

推荐选择一批代表性笔记，在下面这些维度逐项对比：

| Dimension | OpenAPI Output | Legacy Output | Notes |
|---|---|---|---|
| Title |  |  |  |
| Created time |  |  |  |
| Updated time |  |  |  |
| Note type |  |  |  |
| Tags |  |  |  |
| Summary |  |  |  |
| Transcript/body |  |  |  |
| Audio file |  |  |  |
| Attachments |  |  |  |
| Source URL |  |  |  |
| HTML residue |  |  |  |
| Markdown readability |  |  |  |

## 建议优先比较的样本

- 纯文本笔记
- 音频笔记
- 长音频笔记
- 多人会议
- 链接摘抄
- 带图片/附件的笔记
- 编辑过的笔记

## 什么时候可以考虑删旧 legacy 输出

至少要满足下面条件后，再讨论清理：

1. 新的普通登录模式目录结构已经稳定
2. 与 OpenAPI 的输出差异已经完成对比
3. 已经有明确的迁移/去重策略
4. 用户确认不再需要旧的对照样本

在此之前，不建议自动删除。
