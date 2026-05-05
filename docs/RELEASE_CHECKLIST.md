# Release Checklist

每次发布新版本前，必须完成以下检查，避免再次出现“插件可以编译，但在 Obsidian 中无法加载”的问题。

## 1. 构建检查

按顺序执行：

```bash
npm run check
npm run build
npm run preflight
```

必须全部通过。

## 2. 关键规则

- `playwright` 只能在普通登录模式真正触发时按插件目录懒加载。
- 禁止在主 bundle 顶层静态 `import "playwright"` 或 `require("playwright")`。
- 任何依赖浏览器、二进制、外部缓存目录的模块，都不能在插件 `onload()` 阶段执行。
- 插件加载阶段只能依赖 Obsidian API、轻量工具函数和本地状态读写。

## 3. 普通登录模式专项检查

- 插件目录内已安装 `node_modules/playwright`
- 登录按钮点击后能打开浏览器
- 创建导出任务失败时，能回退到最近一次可下载导出
- 普通登录链路异常不会导致整个插件加载失败

## 4. 回归验证

- API 模式可正常打开设置页
- 普通登录模式可正常打开设置页
- 插件启用时不会出现“插件加载失败”
- 状态栏可正常显示

## 5. 部署到 live plugin 后必须核对

- 重新覆盖 live plugin 的 `main.js` 后，必须马上检查目标文件大小不能为 `0`
- 必须比较源码构建产物与 live plugin 目标文件是否一致
- 只有在目标文件大小正常、内容一致后，才允许让用户重启 Obsidian 验证
- 如果 `cp` 出现异常结果，优先改用脚本方式直接写入目标文件内容，而不是继续依赖同一条复制命令

推荐命令：

```bash
wc -c /Users/a1-6/Documents/jerry_info_system/.obsidian/plugins/obsidian-get-notes/main.js
ls -l /Users/a1-6/Documents/jerry_info_system/.obsidian/plugins/obsidian-get-notes/main.js
cmp -s /Users/a1-6/Documents/jerry_projects/obsidian-get-notes/main.js /Users/a1-6/Documents/jerry_info_system/.obsidian/plugins/obsidian-get-notes/main.js && echo OK || echo DIFF
```

## 6. 本次事故结论

根因：

- 把 `playwright` 恢复成了顶层静态依赖
- 导致主 bundle 在插件加载阶段就尝试解析重模块
- 在 Obsidian 的运行环境中，这会间歇性触发插件加载失败
- 某次部署后 live plugin 的 `main.js` 被覆盖成了空文件，如果不做文件大小核对，Obsidian 会直接报插件加载失败

以后禁止再次引入同类改动，除非先更新 `preflight-check.mjs` 并证明不会破坏插件加载。
