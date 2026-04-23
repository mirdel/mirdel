<div align="center">
  <img src="packages/desktop/build/icon.png" alt="Mirdel" width="120" />

  <h1>Mirdel</h1>

  <p>
    <strong>Next-generation AI workspace</strong><br/>
    Local-first · MIT-licensed · Built for your desktop
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
    <a href="https://www.mirdel.ai">Website</a> ·
    <a href="https://github.com/mirdel/mirdel/releases">Downloads</a> ·
    <a href="https://github.com/mirdel/mirdel/issues">Feedback</a>
  </p>

  <br/>

  <!-- TODO: replace with an actual product screenshot -->
  <img src="docs/images/hero.png" alt="Mirdel screenshot" width="860" />
</div>

<br/>

## What is Mirdel?

Mirdel is an open-source, local-first AI workspace for your desktop. It brings conversations, knowledge, notes, translation, images and videos into a single native app, backed by a pluggable model layer that supports every mainstream cloud provider and fully on-device local models.

Unlike browser-based AI clients, Mirdel runs as a true desktop application: your data stays on your disk, your local models are managed for you, and the whole platform is extensible through three first-class primitives — **Applets**, **Skills** and **MCP servers**.

- **Local-first.** All chats, notes, knowledge and settings live in a local SQLite database with optional vector index.
- **Model-agnostic.** OpenAI, Anthropic, Google, xAI, Alibaba, ByteDance, DeepSeek, Zhipu, Minimax, any OpenAI-compatible endpoint, plus built-in local models.
- **Extensible.** Ship your own workflows as Applets, teach the agent new domains with Skills, connect external tools via MCP.
- **Batteries included.** A bundled SearXNG gives you free web search out of the box. A bundled `llama-server` runtime lets you run local models with zero setup.

## Key Features

### Conversations that go beyond one-shot chat

- **Branch conversations** — fork any turn into parallel branches and manage them from a dedicated Branch Manager.
- **Session Map** — visualize the full conversation tree (turns + branches) as an interactive node graph.
- **Temporary Session** — throwaway conversations that never hit the session list.
- **Quick Ask** — a floating overlay for one-off questions that can optionally read the current session as context, without triggering tools or being persisted.
- **Session Notes** — a note surface attached to every session; append AI replies with one click.
- **Projects & categories** — organize sessions into custom categories, with built-in All / Uncategorized / Starred / Completed groups.
- **Scenarios** — reusable presets of model, parameters, system prompt, default knowledge bases, skill policy and MCP policy.
- **Prompt library** — searchable, tagged, favoritable prompts with variable placeholders.
- **In-page and global search** — find text inside a conversation (case / whole word / regex), or search across messages, sessions, translations, notes and knowledge with `Cmd/Ctrl+K`.
- **Suggestions** — clickable follow-up suggestions are generated after each reply.
- **Layered memory** — current context, session-state memory, cross-session memory, historical memory (local RAG), and long-term user preferences.
- **Rich message blocks** — Markdown, code with syntax highlighting, LaTeX, Mermaid, Mind Map (markmap), thinking blocks with timing, tool-call blocks, source cards.
- **Token and timing stats**, per-message debug panel, and optional reply-complete notifications.

### AI models — cloud and local

- **First-class multi-provider support**: OpenAI, Anthropic, Google, xAI, Alibaba (DashScope / Qwen), ByteDance (Doubao), DeepSeek, Zhipu, Minimax, and any OpenAI-compatible / Anthropic-compatible / Google-compatible custom endpoint.
- **Bundled local models** via an embedded `llama-server` runtime — download, memory-load/unload and RAM requirements are handled for you. The local service is exposed as an OpenAI-compatible HTTP endpoint with an auto-generated API key, so other apps on your machine can call it too.
- **Capability-aware model configuration**: input / output modalities, vision, function calling, reasoning, streaming, image tasks, aspect ratios / sizes / custom parameter schemas, thinking presets, etc.
- **Native search injection** with four fine-grained modes (`providerOptions` / `tools` / `sdkTools` / `sdkNative`) to match each provider's protocol.
- **Per-purpose default models** for chat, light tasks, translation, embeddings, image generation, image editing and video.
- **Global model search** across all providers with rich filtering.
- **One-click model fetching**, health checks, test endpoints, custom headers and provider options.

### Web search, built in

- **Bundled SearXNG** with an embedded Python runtime — aggregates 10+ mainstream search engines, works offline-from-cloud and requires zero configuration.
- Pluggable custom search services: point-and-click mapping of request URL, method, headers, query field, response path and content field.
- **RAG-or-truncate** result processing, configurable concurrent page fetching, per-page timeouts and result chunking.

### Knowledge base with local RAG

- Four content sources: **text / file / directory (recursive) / URL**.
- Built-in parsers for `.docx`, `.pdf`, `.pptx`, `.xlsx`, Markdown and code files.
- Vector index backed by **SQLite + `sqlite-vec`**.
- Configurable embedding model and dimension, with guided migration when you change them.
- Incremental sync with per-item change detection and chunk-level refresh.
- Built-in **recall test** panel.

### Notes

- Dual-mode editor: **visual** (Tiptap) and **source** (Markdown).
- AI assistant panel with its own session history per note — write, rewrite, and **diff-style edit proposals** that you explicitly accept.
- Lists & groups, linked-session jump-back, word count, timestamps.

### Translation

- Text translation and **whole-document translation** (docx / pdf / pptx / xlsx / txt / md).
- **Dictionary-style breakdowns**: pronunciations, parts of speech, senses, synonyms, antonyms, common phrases, examples, etymology, notes.
- Independent translation model, so it can be cheaper/faster than your chat model.

### Image workspace

- Unified UI over DashScope, Doubao, Minimax, Zhipu and the AI SDK image providers.
- Text-to-image, image-to-image, image editing, inpaint (mask), outpaint, super-resolution, colorization, stylization (full / local), watermark removal.
- Size / aspect-ratio / both modes, negative prompts, prompt expansion, seed-based reproduction.
- **Reuse parameters**, **use this result as edit input**, **generate again** with one click.
- Custom parameter schemas persisted at the model level.

### Video workspace

- Zhipu + AI SDK video providers.
- Resolution, duration, FPS, seed, reference images, negative prompt, provider options.
- Model-aware toggles: prompt expansion, single/multi shot, generate audio, camera-fixed, service tier, draft mode, quality mode, person-generation policy.

### Applets — your workflows as code

- A small, typed runtime (`@mirdel/applet-core`) with `defineApplet` + `createEngine` and a schema-based UI DSL.
- Each applet runs in an isolated subprocess with its own process manager.
- In-app file tree editor (Monaco) for authoring applets, with auto-save and binary-safe reads.
- Ship your own logo; open applets in standalone windows.
- Built-in playground and example applets.

### Skills — procedural knowledge for the agent

- Fully compatible with the Claude **Agent Skills** format (`SKILL.md` + frontmatter + scripts / references / assets).
- **Five built-in skills** out of the box: `docx`, `pdf`, `pptx`, `xlsx`, `skill-creator`.
- Synced to `userData/skills/.system` on first launch; user skills live under `userData/skills`.
- **Create new skills through chat** via the `skill-creator` skill.
- Per-message skill policy: `auto` / `manual` / `off`.

### MCP (Model Context Protocol) client

- Full MCP client implementation on top of `@modelcontextprotocol/sdk` and `@ai-sdk/mcp`.
- Three transports supported: **stdio**, **Streamable HTTP**, **SSE**.
- **Built-in servers**: `filesystem`, `shell` (always available).
- Lazy manager with per-server enable / disable, capability inspection (tools / prompts / resources), runtime logs and `use cases`.
- Per-message MCP policy: `auto` / `manual` / `off`.

### Tool safety

- Built-in **allowlist** for shell commands and MCP tools.
- Human-in-the-loop approval for sensitive tool calls, with explicit reject semantics.

### Performance at scale

- **Virtualized lists everywhere** — powered by `@tanstack/vue-virtual`, messages, sessions, table of contents and long lists only render what's in view. Thousands of sessions and tens of thousands of messages stay smooth to scroll.
- **Streaming markdown rendering** — AI replies are rendered incrementally via `vue-stream-markdown`, so long answers never cause layout jank.
- **Indexed search** — all text search (messages, sessions, notes, translations, historical memory) is backed by SQLite FTS5, so search stays instant even on a large history.
- **Shallow reactivity for heavy objects** — knowledge base and note trees use `shallowRef` / `markRaw` to avoid deep reactive tracking on large data.

### System & privacy

- Three languages: English, 简体中文, 繁體中文. Follow-system is the default.
- Theme: follow system / dark / light.
- System tray, launch-at-login, minimize-to-tray-on-close.
- Proxy: system / custom (with bypass rules) / direct.
- **One-click export / import** of your entire app data as a ZIP archive, with automatic safety backups on import.
- Sensitive fields (API keys) are encrypted at rest.
- Standalone windows for image preview, web preview and applet runtime.
- Built-in **Edge TTS**, and a one-click launcher for the official AI SDK DevTools.

## Screenshots

> Screenshots are placeholders for now and will be replaced before the first public release.

<table>
  <tr>
    <td><img src="docs/images/screenshot-chat.png" alt="Chat" /></td>
    <td><img src="docs/images/screenshot-session-map.png" alt="Session Map" /></td>
  </tr>
  <tr>
    <td><img src="docs/images/screenshot-knowledge.png" alt="Knowledge" /></td>
    <td><img src="docs/images/screenshot-applet.png" alt="Applets" /></td>
  </tr>
</table>

## Download

Mirdel is distributed via GitHub Releases. Pick the installer that matches your platform:

- **macOS (Apple Silicon)** — `Mirdel-*-arm64.dmg`
- **macOS (Intel)** — `Mirdel-*-x64.dmg`
- **Windows (x64)** — `Mirdel-*-setup.exe` (NSIS installer) or `Mirdel-*-portable.exe`

Latest builds: [github.com/mirdel/mirdel/releases/latest](https://github.com/mirdel/mirdel/releases/latest)

Once the official website at [mirdel.ai](https://www.mirdel.ai) goes live, its download buttons will route to these same artifacts.

### First run

1. Launch Mirdel.
2. Configure at least one model provider — either paste an API key for a cloud provider, or download a local model from **Settings → Model Service**.
3. Start a conversation.

## Development

### Requirements

- **Node.js** `>=24 <25` (see [`.nvmrc`](./.nvmrc))
- **pnpm** `9.15.0` (declared in `package.json` / `packageManager`)
- macOS 13+ or Windows 10/11 for building desktop artifacts

### Getting started

```bash
git clone https://github.com/mirdel/mirdel.git
cd mirdel

pnpm install

pnpm dev
```

`pnpm dev` runs the `@mirdel/desktop` package in Electron + Vite dev mode.

### Useful scripts

Run from the repo root:

```bash
pnpm build                 # Build renderer + main bundles
pnpm preview               # Launch the built app without packaging
pnpm release:local         # Package a local dmg (macOS arm64) for testing
pnpm release               # Full platform-matched dist build

pnpm test                  # Run the full test suite (all packages)
pnpm test:desktop          # All tests for @mirdel/desktop
pnpm test:desktop:data     # Data-layer tests only
pnpm test:desktop:store    # Pinia store tests
pnpm test:desktop:service  # Main-process service tests
pnpm test:desktop:router   # IPC router tests

pnpm applet:playground     # Run the applet development playground
```

Releases are built on GitHub Actions with a three-way platform matrix — macOS arm64, macOS x64 and Windows x64 — triggered either manually (`workflow_dispatch`) or by pushing a `v*` tag. See [`.github/workflows/desktop-release-matrix.yml`](./.github/workflows/desktop-release-matrix.yml).

## Contributing

Contributions are welcome — issues, pull requests, ideas and bug reports alike.

- File bugs and feature requests at [github.com/mirdel/mirdel/issues](https://github.com/mirdel/mirdel/issues).
- Before sending a pull request, please run `pnpm lint` and `pnpm test`.
- Project-level conventions (pnpm, monorepo, Vue file layout, component library rules, etc.) are documented in [`AGENTS.md`](./AGENTS.md).

## License

Mirdel is released under the [MIT License](./LICENSE).

Third-party components and their licenses are tracked in [`packages/desktop/THIRD_PARTY_NOTICES.md`](./packages/desktop/THIRD_PARTY_NOTICES.md).

---

<div align="center">
  <sub>© Mirdel Team · Released under the MIT License</sub>
</div>
