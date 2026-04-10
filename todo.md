## Mirdel TODO（以 Cherry Studio 为参照的核心必做拆解）

> 范围声明：本 TODO 刻意 **不包含** 翻译、会话（Agent/Session）、小程序、Code Tools、笔记。
> 目标：先把"基础问答闭环"做扎实：**模型管理 → 输入 → 流式渲染 → Markdown/引用 → 持久化与稳定性**。

---

## Part 0｜项目骨架与工程底座（必须先做）

- [x] **确定技术栈与目录结构**：
  - Electron（main/preload/renderer）
  - Vue3
  - 组件库：@nuxt/ui（v4版本，完全支持在Vue3下使用）
  - Vercel ai sdk
  - ~~keytar~~：已改为 SQLite + AES-256-CBC 加密存储 API Key
  - 本地数据库：better-sqlite3
  - appData/data/：附件 & 大文本快照（按 hash 分目录）
  - npm工具：pnpm
  - pnpm monorepo 架构
- [x] **搭建 Main / Preload / Renderer 通道**：IPC 桥接、权限边界（renderer 不直接碰 fs/child_process）
- [x] **AI 请求通道约束（必须落实）**：
  - renderer **不直接**发模型请求、不接触任何 API Key（API Key 永远只在 main 进程）
  - renderer → preload（暴露最小 API）→ IPC → main 发起请求（Vercel AI SDK / fetch）→ 以事件/流式 chunk 回传 renderer
  - main 侧统一做：超时、abort、错误归一化（给 UI）
- [x] **统一日志体系**：main/renderer 都能按模块打日志、可开关级别、可导出（使用 electron-log 库）
- [x] **配置管理**：app settings 的读写、版本迁移（最小做：schema version + migrate）
- [x] **错误兜底**：renderer ErrorBoundary + main 进程崩溃捕获 + 统一错误弹 toast/通知
- [x] **Native 依赖构建/打包策略（better-sqlite3 + keytar）**：
  - 明确 Electron 版本/ABI 与 Node 版本要求
  - 本地开发：依赖安装后自动 rebuild（或 postinstall）
  - 打包：跨平台构建（mac/win/linux）、arm64/x64 产物、CI 配置
  - 常见报错排查：缺编译工具链、ABI 不匹配、签名/Notarize（如需要）

交付标准：
- ✅ 能启动一个空壳 App：左侧/顶栏任一布局可用；有一个"Chat"页面占位；日志可用；配置可保存。

---

## Part 1｜模型与 Provider 管理（基础能力核心）

- [x] **Provider 抽象**：统一字段（id/name/type/baseUrl/apiKey/enabled/models）
- [x] **Provider 列表 UI**：新增/编辑/删除/启用禁用（最小可用即可）
- [x] **Model 列表与选择**：一个 Provider 下维护 models；支持设定默认聊天模型
- [x] **连通性/健康检查**：一键测试（例如拉一个 models 或 chat completion 的最小请求），把错误信息可视化
- [x] **安全存储**：apiKey 本地加密/系统 Keychain（最低限度：不要明文到日志；不要随意导出）

交付标准：
- ✅ 用户能配置至少 1 个 Provider + 1 个 Model，并在 Chat 页面选择"当前使用模型"。

---
## Part 2｜基础对话数据模型与持久化（先做"单对话线程"即可）

- [x] **数据模型**：Message（role、createdAt、status、modelRef 等）+ Session（会话管理）
- [x] **本地持久化**：保存消息与会话；启动后可恢复
- [x] **消息状态机**：pending/streaming/success/error（与 UI 显示联动）
- [x] **队列与并发控制（最小）**：同一条"生成任务"避免重复触发；支持 abort

交付标准：
- ✅ 发送一次消息、关闭 App、重新打开：历史记录仍在；消息状态正确。

---

## Part 3｜输入框（Inputbar）与发送流程（能用 + 不坑）

- [x] **输入框组件**：多行输入、Enter 发送、发送中禁用/降级策略
- [ ] **附件（最小版）**：先支持图片/文本两类（可先仅做"显示 + 传递给模型"）
- [ ] **Token 预估（可选但建议）**：展示粗略 token 数、超长提示
- [ ] **发送前校验**：未配置模型/Provider 时给明确引导（跳转到 Provider 设置）
- [x] **中止按钮**：生成中可点击 stop（调用 abort controller）

交付标准：
- ✅ 完整"提问→生成→中止→再次提问"闭环跑通，不丢状态。

---

## Part 4｜流式渲染与消息块（Cherry 风格的"块级 UI"）

- [x] **流式协议适配**：对接至少 1 个 Provider 的 streaming（使用 Vercel AI SDK）
- [x] **块级渲染（最小集合）**：
  - [x] MAIN_TEXT（主文本 - Markdown 渲染）
  - [x] ERROR（错误块）
  - [ ] CITATION（引用块，先支持一种来源结构）
- [x] **节流更新**：流式文本增量更新要节流，避免频繁 re-render
- [ ] **消息操作（最小）**：复制、重新生成（regenerate）、删除本条（先不做"消息组/分支"）
- [ ] **引用展示**：引用编号、来源列表、点击打开链接（先用系统浏览器打开）

交付标准：
- ✅ 流式输出体验顺滑；错误可见。

---

## Part 5｜Markdown 全支持（对齐 Cherry 的"强渲染"体验）

- [x] **Markdown 渲染管线**：GFM（表格/任务列表/代码块）+ Mermaid 图表 + KaTeX 数学公式
- [x] **代码块体验**：语法高亮（使用 markstream-vue 内置的 Shiki）
- [x] **流式优化**：使用 markstream-vue 实现增量渲染，支持未完成块解析，无跳变
- [ ] **代码块增强**：复制按钮、长代码折叠/展开（markstream-vue 部分内置）
- [x] **安全策略**：对 HTML/链接做净化与白名单（markstream-vue 内置安全机制）
- [ ] **资源渲染**：图片显示、链接预览（可选）

交付标准：
- ✅ 常见 Markdown（列表/表格/代码/引用）显示正确；渲染安全可控。
- ✅ 流式渲染无跳变，未完成语法也能正确显示样式。

---

## Part 6｜基础设置与"可用性工程"（让它像一个产品）

- [x] **设置页骨架**：Provider/Model 配置
- [ ] **外观设置**：主题/字体至少一项
- [ ] **数据管理**：清空聊天记录
- [ ] **全局搜索（先做 chat 内搜索即可）**：在当前聊天记录里搜关键词并跳转
- [ ] **导出（最小）**：导出当前聊天为 Markdown
- [ ] **性能基线**：长对话虚拟列表/分页加载（先做到不崩）
- [ ] **稳定性回归**：断网/Key 无效/Provider 500/流中断/abort 的 UI 与状态一致

交付标准：
- 🚧 可以日常使用做基础问答；出现异常也不会"卡死/假成功"；数据可清空与导出。

---

## 后续（暂不纳入本阶段）

- 消息分支（任意消息后继续）
- 复杂问题（问答树/阶段小结/最终总结）
- 生成式 UI
- 多人群聊（多用户、多 Agent）
- MCP 深度生态（Marketplace/资源/Prompt 等）
- AI 浏览器（任意网站访问/自动化）
