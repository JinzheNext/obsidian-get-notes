# Cross-Mode Identity

这个文档描述 API 模式与普通登录模式之间，未来如何做跨模式身份识别与去重。

## 现状

当前输出仍然分开：

```text
{targetFolder}/API 模式/
{targetFolder}/普通登录模式/
```

旧目录：

```text
{targetFolder}/openapi/
{targetFolder}/legacy/
```

也会继续保留作比较样本，不自动删除。

## 为什么现在不能直接合并

因为“同一个目录”不是简单目录问题，而是身份识别问题。

风险包括：

- API 有稳定 `noteId`
- Legacy 的导出 id 可能不是同一个体系
- 标题可能变化
- 不同笔记可能重名
- 音频和附件路径不同
- Legacy 可能缺少部分原文字段

## 标题的作用

标题是一个很好的候选匹配信号，但不能单独作为强匹配依据。

### 可以做候选

- 同标题
- 同类型
- 时间接近

### 不能直接当唯一主键

因为会有：

- 同名不同笔记
- 自动生成标题
- 标题被修改

## 匹配信号

未来建议使用：

- `noteId`（如果跨模式能稳定拿到）
- 标题
- 创建时间
- 更新时间
- note type
- 源 URL
- content hash
- summary hash
- transcript prefix hash
- audio fingerprint
- attachment names

## 匹配置信度

### Strong

未来可以自动复用已有 API 文件：

- 同官方 `noteId`
- 同标题 + 同创建时间 + 同类型 + 同内容 hash
- 同源 URL + 同标题 + 同类型
- 同音频指纹 + 同创建时间

### Medium

只生成 dry-run 报告，不自动合并：

- 同标题 + 同创建时间
- 同标题 + 内容高度相似
- 同源 URL

### Weak

不自动合并：

- 只有标题相同
- 只有时间接近
- 只有内容接近

### None

直接视为不同笔记。

## 冲突优先级

未来如果 API 与普通登录模式识别为同一条笔记：

- 默认以 API 模式为主
- 普通登录模式只补充 API 缺失的字段
- 不允许用普通登录模式去覆盖更丰富的 API 内容

## 推荐 rollout

1. `separate_by_mode`
   - 当前阶段
2. `dry_run_compare`
   - 先出比较报告
3. `auto_merge_strong_matches`
   - 仅自动合并强匹配
4. `manual_review_medium_matches`
   - 中等匹配人工确认

## 当前 V5 结论

- 先不自动合并
- 先保留双目录
- 先提升渲染质量
- 先把标题当候选匹配信号，而不是唯一主键
