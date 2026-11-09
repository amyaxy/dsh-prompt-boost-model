# dsh-prompt-boost

> DSH 提示词增强插件 —— 在输入框把草稿改写为精准提示词，**并可在设置中选择由哪个模型完成改写**。

## 它做什么

参照 WorkBuddy 的增强提示词体验，独立实现的一套轻量插件：

| 位置 | 行为 |
| --- | --- |
| 输入框右侧「增强」按钮 | 把当前草稿改写为结构化提示词，先预览，确认后才回填 |
| 快捷键 `Ctrl + Alt + B` | 同上 |
| 设置 → 增强提示词 | 勾选启用、**选择增强所用模型（分组下拉框）**、温度、输出上限、超时、自定义指令 |

改写结果只在你确认后才会替换草稿，且保留「撤销」入口，原始草稿不会丢失。

## 为什么模型选择是下拉框

这是本插件与参考实现最主要的差异。参考实现只把 `provider` / `model` 表示为两个自由文本输入框，用户必须自己拼出模型 id；填错只会在真正调用时得到一个晦涩的上游错误。

本插件在设置页渲染真实的 `<optgroup>` / `<option>` 列表，数据来自宿主当前的模型注册表：

```
DeepSeek Account
  DeepSeek-V4.1-Flash (deepseek-flash)
  DeepSeek-V4-Pro (deepseek-v4-pro)
Trae 企业版
  DeepSeek-V4.1-Flash-1017 (DeepSeek-V4.1-Flash-1017)
...
```

- 分组 = 提供商，选项 = 该提供商当前可用的模型；
- 选项文本同时显示友好名与模型 id，因为不同提供商会用同一个友好名指向不同路由；
- 列表由宿主实时聚合 `llm.listProviders()` 与 `llm.listConfigurableProviders()`，**尚未配置但可激活**的提供商会一并出现在列表中；
- 选择「跟随默认模型」时不锁定路由，改由宿主默认模型兜底。

## 路由优先级

1. 本插件设置里选定的 `provider` / `model`；
2. 宿主默认模型（`agentDefaultModel`）。

## 安装

```
dsh plugin install <此目录的绝对路径>
```

安装后刷新页面即可；`cordis.patch.yml` 会插入一条 `dsh-prompt-boost` 条目。

## 存储

设置在 `<DSH_HOME>/prompt-boost/settings.json`：

```json
{
  "enabled": true,
  "provider": "trae-enterprise",
  "model": "DeepSeek-V4.1-Flash-1017",
  "temperature": 0.3,
  "maxOutputTokens": 4096,
  "timeoutMs": 60000,
  "systemPrompt": ""
}
```

写入是「临时文件 + rename」的原子替换，并串行化，因此崩溃或并发保存都不会产生截断文件；读取时逐字段校验，损坏的文件会退回默认值而不是让插件失效。这个文件是插件的私有偏好，不是宿主配置，所以不进 `settings.describe()` 的表单体系。

## 安全边界

增强接口会消耗模型额度，因此只在同机同源的页面上可用：

- socket 对端必须是 loopback；
- `Host` 头必须是 `localhost` / `127.0.0.1` / `::1`（防 DNS rebinding）；
- 出现任何代理转发头一律拒绝；
- 浏览器 `Origin` 必须与 `Host` 同端口（防同机其它本地服务盗用额度）；
- 请求体有字节上限，模型输出受 `timeoutMs` 约束。

## 设计约束（为什么代码长这样）

本地链接安装的包**无法**解析 `@deepseek-ai/*` 与 `react`，所以：

- **宿主端零第三方 import，只用 `node:` 内置模块。** 一个 `import z from '@deepseek-ai/schemastery'` 就会让 Loader 求值失败，并把整个 Web 启动一起拖垮。
- 因此不导出 `Config`；配置校验手写，设置页由浏览器端自绘（对下拉框来说本来就更合适）。
- 不依赖 `settings` 服务：`describe()` 投影的是 Config schema，没有 schema 的包可能根本不出现，写它等于依赖一个本包无法声明的实现细节。
- `export const inject = []`：`inject` 中任何一项长期不满足会让条目停留在 pending，DSH 同样视为启动失败。所有服务按需 `ctx.get` 并在缺失时降级。
- 消息用纯对象 `{ role: 'user', content: [{ type: 'text', text }] }`（合法的 `RequestUserInput`），不走 `createUserMessage`；输出直接读 `text-delta` 分块，不走 `BlockAssembler`。

`apply` 永不抛出，每个可选接线步骤单独 try/catch 并只打印一行告警——单个功能缺失不应导致整页白屏。

## 诊断

模型「没有返回文本」时不再只报这一句。`finish` 分块会带出真实原因：

- 适配器报告失败 → 原样透出（例如 API key 无效、余额不足）；
- 推理模型把输出预算全花在思考上 → 提示调高输出上限或换非推理模型；
- 撞上输出上限 / 模型想调工具 / 被中止 → 各自给出可操作的提示。

## 结构

```
package.json          # dsh.bundle.patch + dsh.client
cordis.patch.yml      # 一条 insert 行同时挂载宿主端与浏览器端
lib/index.js          # 宿主端：路由、模型目录、增强调用、设置存储
lib/client.js         # 浏览器端：设置页、输入框按钮、预览浮层、i18n
```

中英文案已内置，`label` 用 thunk，切换语言即时生效。

[![](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness)
