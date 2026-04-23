<div align="center">
  <img src="packages/desktop/build/icon.png" alt="Mirdel" width="120" />

  <h1>Mirdel</h1>

  <p>
    <strong>下一代 AI 工作台</strong><br/>
    本地优先 · MIT 协议 · 为桌面而生
  </p>

  <p>
    <a href="https://github.com/mirdel/mirdel/blob/main/LICENSE"><img alt="License: MIT" src="https://img.shields.io/github/license/mirdel/mirdel?color=blue"></a>
    <a href="https://github.com/mirdel/mirdel/releases/latest"><img alt="Latest release" src="https://img.shields.io/github/v/release/mirdel/mirdel?include_prereleases&sort=semver"></a>
    <a href="https://github.com/mirdel/mirdel/releases"><img alt="Downloads" src="https://img.shields.io/github/downloads/mirdel/mirdel/total"></a>
    <a href="https://github.com/mirdel/mirdel/stargazers"><img alt="GitHub stars" src="https://img.shields.io/github/stars/mirdel/mirdel?style=flat"></a>
    <img alt="Node" src="https://img.shields.io/badge/node-%3E%3D24-brightgreen">
    <img alt="Built with Electron" src="https://img.shields.io/badge/built%20with-Electron-47848f">
    <img alt="Platform" src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows-lightgrey">
  </p>

  <p>
    <a href="./README.md">English</a> ·
    <a href="./README.zh-CN.md">简体中文</a>
  </p>

  <p>
    <a href="https://www.mirdel.ai">官网</a> ·
    <a href="https://github.com/mirdel/mirdel/releases">下载</a> ·
    <a href="https://github.com/mirdel/mirdel/issues">反馈</a>
  </p>

  <br/>

  <!-- TODO: 替换为正式产品截图 -->
  <img src="docs/images/hero.png" alt="Mirdel 截图" width="860" />
</div>

<br/>

## Mirdel 是什么？

Mirdel 是一款开源、本地优先的桌面 AI 工作台。它把**对话、知识库、笔记、翻译、图像、视频**等能力聚合到一个原生应用中，后端是一层可插拔的模型抽象，既支持所有主流云厂商，也支持完全在本地运行的模型。

与浏览器端 AI 客户端不同，Mirdel 是真正的桌面应用——你的数据留在你的磁盘上，本地模型由应用统一管理，整个平台通过三个一等公民机制对外扩展：**Applets（轻应用）**、**Skills（技能）** 和 **MCP 服务器**。

- **本地优先**。所有会话、笔记、知识库和配置都存储在本地 SQLite 数据库中（含可选的向量索引）。
- **模型无关**。支持 OpenAI、Anthropic、Google、xAI、阿里云、字节跳动、DeepSeek、智谱、Minimax 等主流厂商，以及任意 OpenAI 兼容端点，外加内置本地模型。
- **可扩展**。将你的工作流打包成 Applet，用 Skill 为智能体注入新的领域知识，用 MCP 接入外部工具。
- **开箱即用**。内置 SearXNG 让你免费获得联网搜索，内置 `llama-server` 让你零配置运行本地模型。

## 核心特性

### 对话，不止于一问一答

- **分支对话**：任何一轮消息都可以分叉出并行分支，配有独立的分支管理器。
- **会话地图**：将整个会话的消息与分支可视化成交互式节点图。
- **临时会话**：不进入会话列表、用完即焚的一次性会话。
- **Quick Ask（快问快答）**：浮层式提问，不触发工具、不落库，但可选使用当前会话作为上下文。
- **会话笔记**：每个会话都有一个内嵌的笔记面板，可一键把 AI 回复追加进笔记。
- **项目与分类**：自定义会话分类，内置 "全部 / 未分类 / 收藏 / 已完成" 四个固定组。
- **Scenarios 场景模板**：把模型、参数、系统提示词、默认知识库、Skill 策略、MCP 策略等打包成可复用的预设。
- **提示词库**：支持搜索、标签、收藏、变量占位符。
- **页内搜索 + 全局搜索**：会话内查找支持大小写 / 全词 / 正则；`Cmd/Ctrl+K` 跨消息、会话、翻译、笔记、知识库联合搜索。
- **后续追问建议**：每次回复后自动生成可点击的建议。
- **分层记忆**：当前上下文 / 会话状态记忆 / 跨会话记忆 / 历史会话记忆（本地 RAG）/ 长期用户偏好。
- **富消息块**：Markdown、代码高亮、LaTeX、Mermaid、思维导图（markmap）、带计时的思考块、工具调用块、来源卡片。
- **Token 与耗时统计**、单条消息的 Debug 面板、可选的回复完成通知。

### 模型 —— 云端与本地

- **一等公民级多厂商支持**：OpenAI、Anthropic、Google、xAI、阿里云（DashScope / 通义）、字节跳动（豆包）、DeepSeek、智谱、Minimax，以及任意 OpenAI 兼容 / Anthropic 兼容 / Google 兼容 的自定义端点。
- **内置本地模型**：通过内置的 `llama-server` 运行时，一键下载、加载 / 卸载、自动检测内存需求。本地服务以 **OpenAI 兼容的 HTTP 接口** 对外暴露，并自动生成 API Key，本机其他应用也可以调用。
- **能力细粒度配置**：输入 / 输出模态、视觉、Function Calling、推理、流式、图像任务、尺寸 / 比例、自定义参数 Schema、思考预设等。
- **Native Search 注入四挡**：`providerOptions` / `tools` / `sdkTools` / `sdkNative`，适配各家协议差异。
- **按用途分配默认模型**：通用、轻任务、翻译、向量、图像生成、图像编辑、视频。
- **全局模型搜索**，跨厂商，多维筛选。
- **一键拉取模型列表**、健康检查、测试端点、自定义 Header 与 provider options。

### 联网搜索，开箱即用

- **内置 SearXNG + 嵌入式 Python 运行时**，聚合 10+ 主流搜索引擎，零成本零配置。
- 自定义搜索服务：可视化配置请求 URL、方法、Header、查询字段、响应路径、内容字段。
- **RAG 或截断** 两种结果处理模式，可配并发抓取、单页超时、结果切块。

### 知识库（本地 RAG）

- 四种内容来源：**纯文本 / 文件 / 目录（递归，可限深）/ 网页 URL**。
- 内置解析器：`.docx`、`.pdf`、`.pptx`、`.xlsx`、Markdown、代码文件。
- 向量索引基于 **SQLite + `sqlite-vec`**。
- Embedding 模型和维度可配，切换时会引导迁移。
- 增量同步，逐条检测变更、逐条刷新。
- 内置**召回测试**面板。

### 笔记

- **双模式编辑器**：Visual（Tiptap 富文本）和 Source（Markdown 源码）。
- AI 助手面板带每条笔记的独立会话历史 —— 写作、改写，并以**差异式编辑提案**的形式由你确认后才落库。
- 列表 / 分组、与来源会话双向跳转、字数统计、时间戳。

### 翻译

- 文本翻译与**整篇文档翻译**（docx / pdf / pptx / xlsx / txt / md）。
- **词典式解析**：发音、词性、释义、同义 / 反义、常用短语、例句、词源、备注。
- 翻译模型独立配置，可以选择比对话更便宜、更快的模型。

### 图像工作台

- 统一 UI 覆盖 DashScope、豆包、Minimax、智谱以及 AI SDK 图像 Provider。
- 支持文生图、图生图、图像编辑、Inpaint（遮罩）、扩图、超分、上色、风格化（全图 / 局部）、去水印等。
- 尺寸 / 比例 / 两者共存三种模式，负向提示词、Prompt 扩写、Seed 复现。
- 一键**复用参数**、**作为编辑输入**、**再次生成**。
- 自定义参数 Schema 持久化到模型级配置。

### 视频工作台

- 智谱 + AI SDK video 提供方。
- 分辨率、时长、帧率、Seed、参考图、负向提示词、provider options。
- 模型级开关：Prompt 扩写、单镜/多镜、生成音频、相机固定、Service Tier、Draft 模式、Quality 模式、人物生成策略。

### Applets —— 把你的工作流写成代码

- 小巧、带类型的运行时 `@mirdel/applet-core`，提供 `defineApplet`、`createEngine` 以及基于 Schema 的 UI DSL。
- 每个 Applet 跑在独立子进程里，配有进程管理器。
- 应用内 Monaco 文件树编辑器，带自动保存与二进制只读保护。
- 支持自定义 Logo，支持独立窗口打开。
- 内置 Playground 与示例 Applet。

### Skills —— 为智能体注入过程性知识

- 完全兼容 Claude **Agent Skills** 规范（`SKILL.md` + frontmatter + scripts / references / assets）。
- **内置 5 个技能**：`docx`、`pdf`、`pptx`、`xlsx`、`skill-creator`。
- 首次启动会同步到 `userData/skills/.system`；用户技能位于 `userData/skills`。
- **通过对话自动创建 Skill**（由 `skill-creator` 驱动）。
- 每条消息可覆盖 Skill 策略：`auto` / `manual` / `off`。

### MCP（Model Context Protocol）客户端

- 基于 `@modelcontextprotocol/sdk` 与 `@ai-sdk/mcp` 的完整 MCP 客户端。
- 支持三种传输方式：**stdio**、**Streamable HTTP**、**SSE**。
- **内置服务器**：`filesystem`、`shell`（始终可用）。
- 懒加载管理器，逐服务启停，可视化查看 Tools / Prompts / Resources 与运行时日志、Use Cases。
- 每条消息可覆盖 MCP 策略：`auto` / `manual` / `off`。

### 工具安全

- 内置 **Shell 命令白名单** 和 **MCP 工具白名单**。
- 敏感工具调用需人工审批，支持显式拒绝语义。

### 流畅应对海量数据

- **全站虚拟滚动**：基于 `@tanstack/vue-virtual`，消息列表、会话列表、目录导航和通用大列表都只渲染可视区域。上千个会话、上万条消息依然顺滑。
- **流式 Markdown 渲染**：AI 回复通过 `vue-stream-markdown` 以增量方式渲染，长回复过程中也不会出现整屏重排卡顿。
- **索引化搜索**：消息、会话、笔记、翻译、历史记忆的全文搜索全部走 SQLite FTS5 索引，历史再多搜索依然秒级响应。
- **大对象浅响应**：知识库、笔记等大对象树使用 `shallowRef` / `markRaw`，避免深度响应追踪带来的额外开销。

### 系统与隐私

- 三语 i18n：English、简体中文、繁體中文。默认跟随系统。
- 主题：跟随系统 / 深色 / 浅色。
- 系统托盘、开机自启、关闭最小化到托盘。
- 代理：系统代理 / 自定义代理（带 bypass 规则）/ 直连。
- **一键导出 / 导入** 整个应用数据为 ZIP，导入时自动创建安全备份。
- API Key 等敏感字段静态加密存储。
- 图片预览、网页预览、Applet 运行均为独立窗口。
- 内置 **Edge TTS**，一键打开官方 AI SDK DevTools 辅助调试。

## 界面预览

> 以下为占位图，正式发布前会替换为真实截图。

<table>
  <tr>
    <td><img src="docs/images/screenshot-chat.png" alt="对话" /></td>
    <td><img src="docs/images/screenshot-session-map.png" alt="会话地图" /></td>
  </tr>
  <tr>
    <td><img src="docs/images/screenshot-knowledge.png" alt="知识库" /></td>
    <td><img src="docs/images/screenshot-applet.png" alt="Applets" /></td>
  </tr>
</table>

## 下载

Mirdel 通过 GitHub Releases 分发安装包，按平台选择：

- **macOS（Apple Silicon）** —— `Mirdel-*-arm64.dmg`
- **macOS（Intel）** —— `Mirdel-*-x64.dmg`
- **Windows（x64）** —— `Mirdel-*-setup.exe`（NSIS 安装器）或 `Mirdel-*-portable.exe`（免安装）

最新版本：[github.com/mirdel/mirdel/releases/latest](https://github.com/mirdel/mirdel/releases/latest)

官网 [mirdel.ai](https://www.mirdel.ai) 上线后，页面上的下载按钮同样会指向这些产物。

### 首次使用

1. 启动 Mirdel。
2. 配置至少一个模型 —— 可以在 **设置 → 模型服务** 里填入某个云厂商的 API Key，或下载一个本地模型。
3. 开始对话。

## 开发

### 环境要求

- **Node.js** `>=24 <25`（见 [`.nvmrc`](./.nvmrc)）
- **pnpm** `9.15.0`（见 `package.json` 中的 `packageManager`）
- 构建桌面产物需要 macOS 13+ 或 Windows 10/11

### 快速开始

```bash
git clone https://github.com/mirdel/mirdel.git
cd mirdel

pnpm install

pnpm dev
```

`pnpm dev` 会以 Electron + Vite dev 模式运行 `@mirdel/desktop` 包。

### 常用命令

在仓库根目录执行：

```bash
pnpm build                 # 构建 renderer + main 产物
pnpm preview               # 预览未打包的构建产物
pnpm release:local         # 本地打一个 dmg（macOS arm64）做测试
pnpm release               # 按平台矩阵进行完整发布构建

pnpm test                  # 运行所有包的测试
pnpm test:desktop          # @mirdel/desktop 的全部测试
pnpm test:desktop:data     # 仅数据层测试
pnpm test:desktop:store    # Pinia store 测试
pnpm test:desktop:service  # 主进程 service 测试
pnpm test:desktop:router   # IPC router 测试

pnpm applet:playground     # 启动 Applet 开发 Playground
```

正式发布版本由 GitHub Actions 三路平台矩阵（macOS arm64、macOS x64、Windows x64）构建，可通过 `workflow_dispatch` 手动触发，或推送 `v*` tag 自动触发。详见 [`.github/workflows/desktop-release-matrix.yml`](./.github/workflows/desktop-release-matrix.yml)。

## 贡献

欢迎提交 Issue、Pull Request、想法与 Bug 反馈。

- Bug 与需求：[github.com/mirdel/mirdel/issues](https://github.com/mirdel/mirdel/issues)
- 发 PR 前请先跑 `pnpm lint` 和 `pnpm test`。
- 项目级约定（pnpm、monorepo、Vue 单文件组织、组件库使用规范等）见 [`AGENTS.md`](./AGENTS.md)。

## 开源协议

Mirdel 基于 [MIT License](./LICENSE) 开源。

第三方组件及其协议见 [`packages/desktop/THIRD_PARTY_NOTICES.md`](./packages/desktop/THIRD_PARTY_NOTICES.md)。

---

<div align="center">
  <sub>© Mirdel Team · 基于 MIT License 开源</sub>
</div>
