# 技能使用：设计与建议

本文档针对「技能的使用」做全面设计建议，不直接改代码。先对齐现状，再给出系统工具、路由策略、执行流程和业内做法的建议。

---

## 一、现状简要

- **对话链路**：用户发消息 → `chat:send` → `executeChatCore` → 取 scenario（systemPrompt、temperature 等）、聚合 MCP 工具（agent 模式用会话选的 serverIds，chat 模式只用白名单如 `system::web_search`）→ `streamText`。
- **技能侧**：技能库已具备 list/getDetail/readFile；SkillDetail 含 scriptPaths、referencePaths、assetPaths、otherFilePaths；SKILL.md 的 body 可作为「技能说明/提示词」注入。
- **缺口**：尚未有「选技能」与「按技能注入提示词 + 技能专属工具」的逻辑；MCP 与技能目前独立。

---

## 二、系统级工具建议（与技能配套）

技能被选中后，模型需要「能跑脚本、能读技能内文件」的能力，建议在 main 里实现**系统级工具**（与现有 `system::web_search` 等并列），仅在「当前会话/本轮选了某技能」时挂到该轮请求的 tools 上。

### 2.1 运行脚本（run_script）

- **作用**：在技能目录下执行脚本（.py / .js），把 stdout/stderr 等结果返回给模型，便于「按技能文档操作」。
- **参数建议**：`script_path`（相对技能根，如 `scripts/xxx.py`）、`args`（可选，数组或字符串，由技能约定）。
- **实现要点**：
  - 工作目录固定为该技能的根目录；禁止 `..` 与绝对路径穿越，只允许技能内路径。
  - 超时（如 60s）、子进程隔离；可选：默认禁止网络（或由配置/技能声明放开）。
  - .py：用当前环境的 `python` 或 `python3` 执行；.js：用 `node` 执行。
- **命名**：例如 `system::skill_run_script`，与现有 `system::*` 一致。

### 2.2 读取技能内文件（read_skill_file）

- **是否需要**：**建议需要**。  
  - 技能里除了 SKILL.md body 已注入外，还有 references/、根目录文档（如 editing.md、pptxgenjs.md）等，不可能也不应全部塞进 system；用「按需读取」更省 token、更清晰。
- **作用**：按相对路径读当前技能下的文件内容（文本），供模型在需要时拉取。
- **参数**：`relative_path`（相对技能根）。
- **实现**：复用现有 `readSkillFile(skillId, relativePath)`，路径校验已有；若为二进制可返回「非文本文件」或占位，不阻塞列表展示。
- **命名**：例如 `system::skill_read_file`。

### 2.3 列出技能内文件（list_skill_files）

- **作用**：返回当前技能下**拍平后的全部文件相对路径**（scripts + references + assets + other 合并为一维数组），供大模型据此决定要读哪些文件，再调用 `read_skill_file`。
- **返回格式**：例如 `["scripts/add_slide.py", "editing.md", "pptxgenjs.md", "themes/arctic-frost.md", ...]`，即与 getSkillDetail 中的 scriptPaths/referencePaths/assetPaths/otherFilePaths 合并后的完整列表。
- **实现**：有 skillId 时从 getSkillDetail 取四类 paths，合并去重（若需要）后返回；无 category 参数，保持简单。

---

## 三、路由（Router）：是否使用技能、选哪个

思路：**用户发送 user 消息后，先做一次轻量「路由」**，再决定是否注入技能、注入哪个，以及是否挂技能工具。

### 3.1 路由时机与输入输出

- **时机**：在真正调用主模型 `streamText` 之前执行；即：用户消息已落库/已展示 → 调用路由 → 得到 `skill_id | null` → 再走现有 `executeChatCore` 的「构建 system + 聚合 tools + streamText」。
- **输入**：
  - 当前 user 消息内容（纯文本或简短摘要，控制 token）；
  - 可选：最近 1 轮对话摘要（避免「上一句在聊 PDF，下一句没提 PDF」就丢技能）。
  - **已安装技能列表的简要信息**：`{ id, name, description }[]`，不包含 body、paths，以控制 router 的 prompt 长度。
- **输出**：**单个 `skill_id` 或 `null`**。  
  - `skill_id`：本轮使用该技能（注入其 SKILL.md body + 挂 run_script / read_skill_file / list_skill_files）。  
  - `null`：不走技能，走「之前逻辑」（仅 scenario + 现有 MCP/系统工具）。

### 3.4 路由用的 description 从哪来？（无表、不重复存）

- **结论**：不建新表；name/description 来自**现有技能列表逻辑**——即读每个技能目录下的 SKILL.md，用 gray-matter 解析 **frontmatter** 得到 `name`、`description`。
- **现有实现**：`listSkills()` 已做这件事：扫描 `.system` 与 `public` 下带 SKILL.md 的子目录，对每个目录调用 `parseSkillMd(skillMdPath)`，得到 `{ name, description, bodyMarkdown }`，并返回 `SkillItem[]`（id, name, description, isBuiltin）。所以 **description 已经存在**于 list 的返回里，只是没有持久化到 DB。
- **路由时怎么拿**：在 main 里做路由时，**直接调一次 `listSkills()`**，从返回的数组中取 `{ id, name, description }` 作为 router 的「技能简要列表」即可。技能数量通常不大（十到几十），每次路由读 N 个 SKILL.md 并解析 frontmatter 的成本可接受；若后续要优化，再考虑由前端把已加载的 skill 列表随请求传给 main，避免重复解析。

### 3.2 路由时是否带 MCP tools？

- **建议：不带。**  
  - 路由的目标只有一件事：「根据用户意图，在已安装技能里选一个或都不选」。  
  - 若把 MCP 工具列表也塞进 router 的请求里，会拉长 prompt、增加成本，且容易干扰「选技能」这一单一决策。  
  - MCP 工具应保留在「执行阶段」：在确定 skill_id 或 null 之后，和主模型一起给（agent 模式照常带用户选的 MCP；chat 模式照常白名单）。

### 3.3 单技能 vs 多技能

- **建议：一次路由只选 0 或 1 个技能（单技能）。**  
  - 多技能同时注入会导致多套「身份/工作流」混在同一段 system 里（例如「你是 PDF 专家」+「你是 DOCX 专家」），容易指令冲突、行为不可控。  
  - 若未来要支持「多技能协作」，更稳妥的方式是：编排层（或chef 模型）先拆子任务，再对每个子任务做单技能路由，而不是在一轮里塞多个技能提示词。  
  - **本期**：只做**自动路由**，不做「用户显式选技能」的 UI；「本会话用某技能」留待后续再详细讨论与实现。

---

## 四、执行阶段：有技能 vs 无技能

在现有 `executeChatCore` 之前（或在其开头）已有「路由结果」：`skill_id | null`。后续分两支。

### 4.1 有技能（skill_id 存在）

- **System 注入**：  
  - 在现有「基础 system（scenario.systemPrompt + 记忆等）」之后，**追加一条 system 消息**，内容为：该技能的 **SKILL.md body**（即 `bodyMarkdown`）。  
  - 可加一句简短前缀，如「当前启用技能：xxx。以下为技能说明与操作指引：」，便于模型区分「场景配置」与「技能说明」。
- **Tools**：  
  - **系统工具**：在现有 `buildSystemTools` 之外，增加技能专属工具（见上）：  
    - `system::skill_run_script`（执行当前技能下脚本）；  
    - `system::skill_read_file`（读当前技能下文件）；  
    - `system::skill_list_files`（返回当前技能下拍平后的全部文件路径，供模型选择要读哪些）。  
  - 这三个工具在执行时都需要「当前技能 id」：由 executeChat 入参传入本轮的 `skillId`（来自路由结果）。  
  - **MCP**：v1 与现有逻辑一致——agent 模式照常带会话选择的 MCP；chat 模式照常只带白名单。不强制「技能声明用哪些 MCP」；后续若要做「技能声明 MCP」，再在聚合时按 skill 过滤即可。

### 4.2 无技能（skill_id 为 null）

- **行为与当前完全一致**：不追加技能 system，不挂 run_script / read_skill_file；仅 scenario + 记忆 + 现有 MCP/系统工具。  
- 即「找不到合适技能就走原逻辑」，无需额外分支。

---

## 五、业内常见做法（简要对照）

- **Anthropic Codex / Agent Skills**：技能 = 提示词 + 资源 + 工具；通常**一次一个技能/模式**；工具包含 MCP 或内置（如执行脚本）；路由多为「用户显式选技能」或单独 classifier。
- **OpenAI Assistants**：无「技能」抽象，但可通过切换 instructions + 绑定的 tools 模拟「按任务切模式」；也是一次一套 instructions + tools。
- **MCP**：工具按 server 组织；很多实现是「按任务/会话选择启用哪些 server」，和「选一个技能」在概念上类似——都是缩小工具与上下文的范围。
- **多技能**：多数产品采用「单模式/单技能」避免冲突；多技能多为「编排 + 多步、每步单技能」而非「一条 system 里塞多个技能」。

与上面一致：**路由只选 0/1 个技能、router 不带 MCP、执行阶段再挂技能工具 + 现有 MCP**，是稳妥且易实现的方案。

---

## 六、建议汇总与可选扩展

### 6.1 建议结论

| 点 | 建议 |
|----|------|
| 系统工具 | 实现 `system::skill_run_script`（py/js）、`system::skill_read_file`、`system::skill_list_files`（返回拍平后的全部文件路径，供模型选择要读哪些）。 |
| 路由输入 | 当前 user 消息 + 已安装技能的 `{ id, name, description }[]`。 |
| 路由输出 | 单个 `skill_id \| null`，**不**带 MCP tools。 |
| 单/多技能 | **一次只选 0 或 1 个技能**，避免多套提示词打架。 |
| 无技能时 | 完全走现有逻辑，不注入技能、不挂技能工具。 |
| 有技能时 | 追加 SKILL.md body 到 system；挂 run_script、read_skill_file、list_skill_files（作用域为当前技能）；MCP 与现有一致（v1 不按技能过滤）。 |

### 6.2 可选与后续

- **路由频率**：每条 user 消息都路由一次 vs 会话级「绑定一个技能直到用户说换」：前者灵活，后者省 router 调用。可先做「每条都路由」，再按需加「本会话锁定技能」的选项。
- **技能声明 MCP**：若 SKILL.md 或 manifest 声明「uses: server-a, server-b」，执行时只启用这些 MCP，可减少干扰、提升可复现性；可作为 v2。
- **用户显式选技能**：本期不做；后续在 UI 上允许用户指定「本会话用某技能」时，可不走 router 或 router 仅作兜底。
- **Router 模型**：用更小/更快的模型做路由，主模型做生成，以控制延迟与成本。

---

## 七、实施顺序建议（供后续落地参考）

1. **定义并实现技能系统工具**：`skill_run_script`、`skill_read_file`、`skill_list_files`（返回拍平后的全部文件路径），在 main 中实现，执行时通过入参 `skillId` 解析技能目录与路径。
2. **实现路由**：在 executeChat 前一步，main 内调 `listSkills()` 拿 `{ id, name, description }[]`，与 user 消息一起喂给轻量 router 模型，输出 skill_id | null；router 不带 MCP。
3. **改造 executeChatCore**：入参增加 `skillId?: string`（来自路由结果）；若有 skillId，则追加技能 system、挂三个技能系统工具；否则不变。
4. **前端**：本期不增加「选择技能」UI，仅自动路由；后续再做「本会话指定技能」等。
5. **可选**：技能声明 MCP、会话级锁定技能等，按需迭代。

以上为「技能使用」的全面设计与建议，可直接作为实现规格使用，且不涉及直接改代码，仅输出方案与建议。
