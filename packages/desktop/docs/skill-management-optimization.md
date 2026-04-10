# 技能管理「通用可见」优化方案

## 一、现状与问题

### 1.1 当前数据模型与展示

- **SkillDetail** 只包含三类路径数组：
  - `scriptPaths`：来自 `scripts/` 目录（递归）
  - `referencePaths`：来自 `references/` 或 `reference/` 目录（递归）
  - `assetPaths`：来自 `assets/` 目录（递归）
- 前端三个 Tab：「说明」（SKILL.md body）、「脚本」、「引用」、「资源」，仅展示上述三类；**技能目录下其它文件一律不可见**。

### 1.2 实际技能目录中的「漏网」情况（builtin-skills 抽样）

| 技能 | 当前能看到 | 当前看不到 | 说明 |
|------|------------|------------|------|
| **pptx** | scripts/* | 根目录 `editing.md`、`pptxgenjs.md` | 根目录文档，SKILL.md 里直接引用 |
| **pdf** | scripts/* | 根目录 `forms.md`、`reference.md`（单文件） | 仅扫描了 reference/**目录**，未考虑 reference.md 单文件 |
| **theme-factory** | （无） | 整个 `themes/*.md`、`theme-showcase.pdf` | 无 scripts/references/assets，整技能「空」 |
| **algorithmic-art** | （无） | `templates/` 下 generator_template.js、viewer.html | 用的是 templates/ 而非 scripts/ |
| **docx** | scripts/* | 无其它目录 | 结构合规，无漏 |
| **skill-creator** | scripts/*, references/* | 无 | 结构合规 |
| **mcp-builder** | scripts/*, reference/* | 无 | 结构合规 |

归纳：

1. **根目录下的文档/单文件**：如 `editing.md`、`pptxgenjs.md`、`forms.md`、`reference.md` 等，不在任何子目录内，**全部看不到**。
2. **非约定目录**：如 `themes/`、`templates/` 等，既不是 scripts/references/assets，**整目录不可见**。
3. **单文件引用**：当前只认 `reference/`、`references/` 目录；若技能只有根目录的 `reference.md`，**不会出现在「引用」里**。

因此，若要做**通用技能管理**，必须让「技能目录下所有需要被看到的文件」都有入口，而不是只依赖 scripts/references/assets 三个固定目录。

---

## 二、设计目标

- **可见性**：技能目录内凡是对用户有意义的文件，都应能在 UI 中看到并打开查看（文本用现有 Modal，二进制可考虑仅展示「非文本」提示或后续扩展）。
- **兼容现有约定**：保留「脚本 / 引用 / 资源」的语义分类，便于按用途浏览。
- **扩展性**：支持不同来源的技能（anthropics、自建、后续规范），不强制所有技能都具备 scripts/references/assets 结构。

---

## 三、优化方案（推荐：三分类 + 兜底「全部文件」）

### 3.1 思路

- **保留**现有三个 Tab：脚本、引用、资源，数据来源不变（仍只扫 scripts/、references/、reference/、assets/）。
- **新增**一个「全部文件」Tab（或命名为「文件」）：展示**整个技能目录下除少数忽略项外的全部文件**，作为兜底，保证「没有文件看不到」。

这样：

- 符合约定的技能：脚本/引用/资源 Tab 继续按语义展示；若还有根目录或其它目录文件，会在「全部文件」里出现。
- 不符合约定的技能（如 theme-factory、algorithmic-art）：至少能在「全部文件」里看到 themes/、templates/ 等。

### 3.2 后端（main）

**1）SkillDetail 增加字段**

- 在 `@shared` 的 `SkillDetail` 中增加：
  - `allFilePaths?: string[]`  
  - 表示技能目录下「可展示」的**相对路径**列表（递归，统一用 `/` 的相对路径）。

**2）getSkillDetail 中生成 allFilePaths**

- 在 `skillData.ts` 中：
  - 新增内部函数，例如 `listAllRelativeFiles(skillDir: string): string[]`：
    - 递归遍历 `skillDir` 下所有文件；
    - 排除：`SKILL.md`（已在说明里）、可选排除 `LICENSE.txt`、`README.md` 等（可按产品决定）；
    - 返回相对路径数组，如 `['editing.md', 'pptxgenjs.md', 'scripts/add_slide.py', ...]`。
  - 在 `getSkillDetail` 里调用 `listAllRelativeFiles(skillDir)`，赋值给 `detail.allFilePaths`（可为空数组，不省略）。

**3）路径安全与二进制**

- `readSkillFile` 已做路径校验，allFilePaths 中的路径若都相对且无 `..`，读取时继续用现有逻辑即可。
- 二进制文件（.pdf、.ttf 等）：当前 `readSkillFile` 用 UTF-8 读会乱码或报错；可保持现状，前端对读取失败或空内容显示「非文本文件」或「无法预览」，不阻塞「全部文件」列表的展示。

### 3.3 前端（renderer）

**1）Tab 与数据**

- Tab 列表增加一项：`{ value: 'all', label: '全部文件 (N)', icon: '...' }`，N 为 `detail.allFilePaths?.length ?? 0`。
- 展示逻辑：对 `detail.allFilePaths ?? []` 使用现有的 `pathsToTree(..., false)`（**不** strip 首段），得到一棵「全部文件」树；点击节点仍用现有 Modal + `readFile(skillId, path)`。

**2）空状态**

- 若某技能目录下没有任何文件（仅 SKILL.md 等已排除），allFilePaths 为空，Tab 显示「全部文件 (0)」，内容区用 UEmpty 或「暂无文件」即可。

### 3.4 可选细化（不必须）

- **排除列表可配置**：如从配置或常量读取要排除的文件名/模式（如 `['SKILL.md', 'LICENSE.txt', 'README.md']`），便于后续扩展。
- **单文件 reference.md**：若希望根目录的 `reference.md` 也出现在「引用」里，可在 `getSkillDetail` 中单独判断：若存在 `reference.md` 且 referencePaths 为空，则将 `['reference.md']` 并入 referencePaths（或单独一个 `rootReferencePath`）。这样「引用」Tab 与「全部文件」都不漏。

---

## 四、方案对比（简述）

| 方案 | 做法 | 优点 | 缺点 |
|------|------|------|------|
| **A. 仅加「其它文件」** | 新增 Tab，只列出「不在 scripts/references/assets 中的文件」 | 改动小，语义清晰 | 需维护「其它」与「三类」的差集逻辑 |
| **B. 全部文件树（替代三分类）** | 只保留一个「文件」Tab，树展示全部 | 实现简单，绝不漏文件 | 失去脚本/引用/资源的分类，不符合现有约定 |
| **C. 三分类 + 全部文件（推荐）** | 保留脚本/引用/资源，再增加「全部文件」Tab | 既有分类又保证通用可见；实现清晰 | 多一个 Tab，全部文件与三类有重复展示（可接受） |

推荐 **C**：用户既可按用途看脚本/引用/资源，又能在「全部文件」里看到根目录文档、themes/、templates/、reference.md 等，实现「通用技能管理下没有该看到的文件看不到」的目标。

---

## 五、实施顺序建议

1. **shared**：在 `SkillDetail` 上增加 `allFilePaths?: string[]`。
2. **main**：实现 `listAllRelativeFiles(skillDir)` 及排除规则，在 `getSkillDetail` 中填充 `allFilePaths`。
3. **renderer**：新增「全部文件」Tab，用 `pathsToTree(detail.allFilePaths ?? [], false)` 渲染树，复用现有 Modal 与 `readFile`。
4. （可选）支持根目录 `reference.md` 纳入「引用」Tab，避免引用类单文件被误以为缺失。

按上述顺序做即可在不破坏现有行为的前提下，补齐「有文件看不到」的问题；若你确认采用 C 方案，再按此方案改代码即可。
