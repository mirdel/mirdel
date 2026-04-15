import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import * as os from "node:os";
import { app } from "electron";
import { loggerServiceMain } from "@shared";
import * as sqliteVec from "sqlite-vec";
import { tMain } from "../i18n";
import { DEFAULT_WEB_SEARCH_CONFIG } from "./web-search/webSearchData";

let db: Database.Database | null = null;
let dbPathOverride: string | null = process.env.AI_CLIENT_X_TEST_DB_PATH?.trim() || null;
const logger = loggerServiceMain.withContext("db");
const loadedSqliteExtensionPaths = new Set<string>();
export const SIMPLE_SEARCH_TOKENIZER = "simple";

function getSqliteExtensionFileExtension() {
  switch (process.platform) {
    case "darwin":
      return ".dylib";
    case "win32":
      return ".dll";
    default:
      return ".so";
  }
}

function getSqliteExtensionPlatformDir() {
  return `${process.platform}-${process.arch}`;
}

function listSqliteExtensionsInDir(dirPath: string) {
  try {
    if (!fs.existsSync(dirPath)) return [];

    const extension = getSqliteExtensionFileExtension();
    return fs
      .readdirSync(dirPath, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(extension))
      .map((entry) => path.join(dirPath, entry.name))
      .sort((a, b) => a.localeCompare(b));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn("failed to inspect sqlite extension directory", { dirPath, message });
    return [];
  }
}

function resolveBundledSqliteExtensionPaths() {
  const platformDir = getSqliteExtensionPlatformDir();
  const candidateDirs = [
    path.join(process.resourcesPath, ".runtime", "sqlite-extensions", platformDir),
    path.join(app.getAppPath(), ".runtime", "sqlite-extensions", platformDir),
  ];

  const seen = new Set<string>();
  const resolved: string[] = [];

  for (const dirPath of candidateDirs) {
    for (const filePath of listSqliteExtensionsInDir(dirPath)) {
      if (seen.has(filePath)) continue;
      seen.add(filePath);
      resolved.push(filePath);
    }
  }

  return resolved;
}

function resolveConfiguredSqliteExtensionPaths() {
  const raw = String(process.env.AI_CLIENT_X_SQLITE_EXTENSIONS || "").trim();
  if (raw) {
    return raw
      .split(path.delimiter)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return resolveBundledSqliteExtensionPaths();
}

function loadConfiguredSqliteExtensions(database: Database.Database) {
  const extensionPaths = resolveConfiguredSqliteExtensionPaths();
  if (extensionPaths.length === 0) return;

  for (const extensionPath of extensionPaths) {
    try {
      database.loadExtension(extensionPath);
      loadedSqliteExtensionPaths.add(extensionPath);
      logger.info("sqlite extension loaded", { extensionPath });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("sqlite extension load failed", { extensionPath, message });
    }
  }
}

function isSimpleSearchExtensionPath(extensionPath: string) {
  const lowerName = path.basename(extensionPath).toLowerCase();
  const stem = lowerName.replace(/\.[^.]+$/, "");
  return stem === "simple" || stem === "libsimple";
}

function isSqliteVecAvailable(database: Database.Database) {
  try {
    database.prepare("SELECT vec_version() AS version").get();
    return true;
  } catch {
    return false;
  }
}

function resolveBundledSqliteVecExtensionPath() {
  const extension = getSqliteExtensionFileExtension();
  const platformDir = getSqliteExtensionPlatformDir();
  const candidates = [
    path.join(process.resourcesPath, ".runtime", "sqlite-extensions", platformDir, `vec0${extension}`),
    path.join(app.getAppPath(), ".runtime", "sqlite-extensions", platformDir, `vec0${extension}`),
  ];

  return candidates.find((candidate) => fs.existsSync(candidate)) || "";
}

function loadSqliteVecExtension(database: Database.Database) {
  if (isSqliteVecAvailable(database)) return;

  try {
    sqliteVec.load(database);
    return;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn("sqlite-vec package extension load failed, trying bundled runtime", { message });
  }

  if (isSqliteVecAvailable(database)) return;

  const extensionPath = resolveBundledSqliteVecExtensionPath();
  if (!extensionPath) {
    throw new Error(
      "sqlite-vec extension is required but was not found; check .runtime/sqlite-extensions packaging"
    );
  }

  database.loadExtension(extensionPath);
  loadedSqliteExtensionPaths.add(extensionPath);
}

export function hasSimpleSearchExtension() {
  for (const extensionPath of loadedSqliteExtensionPaths) {
    if (isSimpleSearchExtensionPath(extensionPath)) {
      return true;
    }
  }
  return false;
}

export function assertSimpleSearchExtensionLoaded() {
  if (hasSimpleSearchExtension()) return;

  throw new Error(
    "simple search extension is required but was not loaded; check .runtime/sqlite-extensions packaging or AI_CLIENT_X_SQLITE_EXTENSIONS"
  );
}

export function getDb() {
  if (db) return db;
  const dbPath = getCurrentDbPath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  loadConfiguredSqliteExtensions(db);
  loadSqliteVecExtension(db);
  return db;
}

export function getCurrentDbPath() {
  if (dbPathOverride) {
    return dbPathOverride;
  }
  const userData = app.getPath("userData");
  return path.join(userData, "app.db");
}

export function closeDb() {
  if (!db) return;
  db.close();
  db = null;
}

export function setDbPathForTests(nextPath: string | null) {
  closeDb();
  dbPathOverride = nextPath?.trim() || null;
}

export function resetDbForTests(options?: { removeFiles?: boolean }) {
  const dbPath = getCurrentDbPath();
  closeDb();

  if (options?.removeFiles) {
    const companionPaths = [
      dbPath,
      `${dbPath}-wal`,
      `${dbPath}-shm`,
      `${dbPath}-journal`,
    ];
    for (const filePath of companionPaths) {
      try {
        fs.rmSync(filePath, { force: true });
      } catch {
        // Ignore cleanup failures in tests.
      }
    }
  }
}

export function initDb() {
  const d = getDb();

  d.exec(`
    CREATE TABLE IF NOT EXISTS builtin_provider_overrides (
      id TEXT PRIMARY KEY,
      baseUrl TEXT,
      imageBaseUrl TEXT,
      videoBaseUrl TEXT,
      apiKey TEXT,
      customHeaders TEXT,
      providerOptionsDefaults TEXT,
      nativeWebSearchDefaults TEXT,
      enabled INTEGER,
      updatedAt INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS custom_providers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      logo TEXT,
      type TEXT NOT NULL,
      baseUrl TEXT NOT NULL,
      imageBaseUrl TEXT,
      videoBaseUrl TEXT,
      apiKey TEXT,
      customHeaders TEXT,
      providerOptionsDefaults TEXT,
      nativeWebSearchDefaults TEXT,
      enabled INTEGER NOT NULL DEFAULT 0,
      models TEXT,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS model_overrides (
      id TEXT PRIMARY KEY,
      providerId TEXT NOT NULL,
      modelId TEXT NOT NULL,
      type TEXT NOT NULL,
      detailsJson TEXT,
      updatedAt INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_model_overrides_provider ON model_overrides(providerId);

    CREATE TABLE IF NOT EXISTS provider_model_actions (
      providerId TEXT NOT NULL,
      modelId TEXT NOT NULL,
      action TEXT NOT NULL,
      type TEXT,
      updatedAt INTEGER NOT NULL,
      PRIMARY KEY (providerId, modelId)
    );

    CREATE INDEX IF NOT EXISTS idx_provider_model_actions_provider ON provider_model_actions(providerId);

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    -- ===== 会话表（支持分支 - 扁平化方案）=====
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      selectedModel TEXT NOT NULL DEFAULT '__default__',
      scenarioId TEXT NOT NULL DEFAULT 'default-scenario',
      projectId TEXT,
      rootSessionId TEXT,
      parentSessionId TEXT,
      forkFromMessageId TEXT,
      forkPointMessageId TEXT,
      mcpServerIds TEXT,
      mcpPolicy TEXT NOT NULL DEFAULT 'manual',
      workingDirs TEXT,
      mode TEXT NOT NULL DEFAULT 'chat',
      skillPolicy TEXT NOT NULL DEFAULT 'auto',
      webSearch TEXT NOT NULL DEFAULT 'auto',
      thinking TEXT NOT NULL DEFAULT 'auto',
      kbIds TEXT,
      stateText TEXT,
      briefText TEXT,
      stateCursorUserMessageId TEXT,
      isTemporary INTEGER NOT NULL DEFAULT 0,
      temporaryType TEXT,
      expiresAt INTEGER,
      contextCount INTEGER,
      linkedNoteId TEXT,
      isFavorite INTEGER NOT NULL DEFAULT 0,
      isArchived INTEGER NOT NULL DEFAULT 0,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_updatedAt ON sessions(updatedAt);
    CREATE INDEX IF NOT EXISTS idx_sessions_root ON sessions(rootSessionId);
    CREATE INDEX IF NOT EXISTS idx_sessions_parent ON sessions(parentSessionId);
    CREATE INDEX IF NOT EXISTS idx_sessions_projectId ON sessions(projectId);
    CREATE INDEX IF NOT EXISTS idx_sessions_isTemporary_expiresAt ON sessions(isTemporary, expiresAt);

    -- ===== 消息表（线性结构 + 溯源信息）=====
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      sessionId TEXT NOT NULL,
      turnId TEXT,
      role TEXT NOT NULL,
      parts TEXT NOT NULL,
      status TEXT NOT NULL,
      copiedFromMessageId TEXT,
      isShared INTEGER DEFAULT 0,
      isDeleted INTEGER DEFAULT 0,
      deletedAt INTEGER,
      userEdited INTEGER DEFAULT 0,
      tokenUsage TEXT,
      contextSources TEXT,
      historicalMemory TEXT,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_messages_sessionId_createdAt ON messages(sessionId, createdAt);
    CREATE INDEX IF NOT EXISTS idx_messages_turnId_createdAt ON messages(turnId, createdAt);
    CREATE INDEX IF NOT EXISTS idx_messages_copiedFrom ON messages(copiedFromMessageId);

    -- ===== 轮次表（一次请求/续跑生命周期）=====
    CREATE TABLE IF NOT EXISTS turns (
      id TEXT PRIMARY KEY,
      sessionId TEXT NOT NULL,
      userMessageId TEXT,
      assistantMessageId TEXT,
      parentTurnId TEXT,
      triggerType TEXT NOT NULL,
      status TEXT NOT NULL,
      selectedModel TEXT NOT NULL,
      mcpServerIds TEXT,
      mode TEXT,
      webSearch TEXT,
      thinking TEXT,
      effectiveThinking TEXT,
      skillId TEXT,
      citationRequired INTEGER DEFAULT 0,
      citationStartIndex INTEGER DEFAULT 0,
      tokenUsage TEXT,
      stateText TEXT,
      briefText TEXT,
      error TEXT,
      suggestions TEXT,
      startedAt INTEGER NOT NULL,
      endedAt INTEGER,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_turns_sessionId_createdAt ON turns(sessionId, createdAt);
    CREATE INDEX IF NOT EXISTS idx_turns_sessionId_status ON turns(sessionId, status);
    CREATE INDEX IF NOT EXISTS idx_turns_userMessageId ON turns(userMessageId);
    CREATE INDEX IF NOT EXISTS idx_turns_assistantMessageId ON turns(assistantMessageId);

    -- ===== 场景表 =====
    CREATE TABLE IF NOT EXISTS scenarios (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      selectedModel TEXT NOT NULL DEFAULT '__default__',
      temperature REAL,
      topP REAL,
      topK INTEGER,
      presencePenalty REAL,
      frequencyPenalty REAL,
      stopSequences TEXT,
      seed INTEGER,
      contextCount INTEGER DEFAULT 10,
      maxOutputTokens INTEGER,
      systemPrompt TEXT,
      mcpServerIds TEXT,
      mcpPolicy TEXT NOT NULL DEFAULT 'auto',
      skillPolicy TEXT NOT NULL DEFAULT 'auto',
      maxToolSteps INTEGER DEFAULT 20,
      workingDirs TEXT,
      kbIds TEXT,
      kbRecallTopK INTEGER DEFAULT 5,
      kbRecallMinScore REAL DEFAULT 0.75,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_scenarios_updatedAt ON scenarios(updatedAt DESC);
  `);

  d.exec(`

    -- ===== 项目表（分类功能）=====
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      scenarioId TEXT NOT NULL DEFAULT 'default-scenario',
      color TEXT,
      icon TEXT,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_projects_updatedAt ON projects(updatedAt DESC);

    -- ===== 图片工作区 =====
    CREATE TABLE IF NOT EXISTS image_workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      lastComposerJson TEXT,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_image_workspaces_updatedAt ON image_workspaces(updatedAt DESC);

    CREATE TABLE IF NOT EXISTS image_generations (
      id TEXT PRIMARY KEY,
      workspaceId TEXT NOT NULL,
      prompt TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'queued',
      selectedModel TEXT NOT NULL DEFAULT '',
      paramsJson TEXT,
      errorMessage TEXT,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL,
      FOREIGN KEY (workspaceId) REFERENCES image_workspaces(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_image_generations_workspace_createdAt ON image_generations(workspaceId, createdAt);

    CREATE TABLE IF NOT EXISTS image_generation_runs (
      id TEXT PRIMARY KEY,
      generationId TEXT NOT NULL,
      prompt TEXT NOT NULL,
      status TEXT NOT NULL,
      selectedModel TEXT NOT NULL,
      paramsJson TEXT,
      errorMessage TEXT,
      warningMessage TEXT,
      startedAt INTEGER NOT NULL,
      completedAt INTEGER,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL,
      FOREIGN KEY (generationId) REFERENCES image_generations(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_image_generation_runs_generation_createdAt ON image_generation_runs(generationId, createdAt);

    -- ===== 视频工作区 =====
    CREATE TABLE IF NOT EXISTS video_workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      lastComposerJson TEXT,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_video_workspaces_updatedAt ON video_workspaces(updatedAt DESC);

    CREATE TABLE IF NOT EXISTS video_generations (
      id TEXT PRIMARY KEY,
      workspaceId TEXT NOT NULL,
      prompt TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'queued',
      selectedModel TEXT NOT NULL DEFAULT '',
      paramsJson TEXT,
      errorMessage TEXT,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL,
      FOREIGN KEY (workspaceId) REFERENCES video_workspaces(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_video_generations_workspace_createdAt ON video_generations(workspaceId, createdAt);

    CREATE TABLE IF NOT EXISTS video_generation_runs (
      id TEXT PRIMARY KEY,
      generationId TEXT NOT NULL,
      prompt TEXT NOT NULL,
      status TEXT NOT NULL,
      selectedModel TEXT NOT NULL,
      paramsJson TEXT,
      errorMessage TEXT,
      warningMessage TEXT,
      startedAt INTEGER NOT NULL,
      completedAt INTEGER,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL,
      FOREIGN KEY (generationId) REFERENCES video_generations(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_video_generation_runs_generation_createdAt ON video_generation_runs(generationId, createdAt);

    CREATE TABLE IF NOT EXISTS assets (
      id TEXT PRIMARY KEY,
      filePath TEXT NOT NULL UNIQUE,
      mediaType TEXT,
      size INTEGER,
      width INTEGER,
      height INTEGER,
      sha256 TEXT,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_assets_filePath ON assets(filePath);
    CREATE INDEX IF NOT EXISTS idx_assets_sha256 ON assets(sha256);

    CREATE TABLE IF NOT EXISTS asset_links (
      id TEXT PRIMARY KEY,
      assetId TEXT NOT NULL,
      ownerType TEXT NOT NULL,
      ownerId TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'output',
      sortOrder INTEGER NOT NULL DEFAULT 0,
      createdAt INTEGER NOT NULL,
      metaJson TEXT,
      FOREIGN KEY (assetId) REFERENCES assets(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_asset_links_owner_sort ON asset_links(ownerType, ownerId, sortOrder);
    CREATE INDEX IF NOT EXISTS idx_asset_links_asset ON asset_links(assetId);

    CREATE TABLE IF NOT EXISTS note_lists (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      icon TEXT,
      color TEXT,
      sortOrder INTEGER NOT NULL DEFAULT 0,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_note_lists_sort ON note_lists(sortOrder, createdAt);

    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      listId TEXT,
      title TEXT NOT NULL DEFAULT '',
      contentMd TEXT NOT NULL DEFAULT '',
      previewText TEXT NOT NULL DEFAULT '',
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL,
      FOREIGN KEY (listId) REFERENCES note_lists(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_notes_list_updated ON notes(listId, updatedAt DESC);
    CREATE INDEX IF NOT EXISTS idx_notes_updated ON notes(updatedAt DESC);

    CREATE TABLE IF NOT EXISTS note_ai_sessions (
      id TEXT PRIMARY KEY,
      noteId TEXT NOT NULL,
      selectedModel TEXT NOT NULL DEFAULT '',
      contextMode TEXT NOT NULL DEFAULT 'full',
      lastMessageAt INTEGER NOT NULL,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL,
      FOREIGN KEY (noteId) REFERENCES notes(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_note_ai_sessions_note ON note_ai_sessions(noteId);
    CREATE INDEX IF NOT EXISTS idx_note_ai_sessions_last ON note_ai_sessions(lastMessageAt DESC);

    CREATE TABLE IF NOT EXISTS note_ai_messages (
      id TEXT PRIMARY KEY,
      sessionId TEXT NOT NULL,
      requestId TEXT NOT NULL,
      role TEXT NOT NULL,
      parts TEXT NOT NULL,
      status TEXT NOT NULL,
      error TEXT,
      tokenUsage TEXT,
      metaJson TEXT,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL,
      FOREIGN KEY (sessionId) REFERENCES note_ai_sessions(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_note_ai_messages_session_created ON note_ai_messages(sessionId, createdAt);
    CREATE INDEX IF NOT EXISTS idx_note_ai_messages_session_request ON note_ai_messages(sessionId, requestId);

    -- ===== MCP 服务器表 =====
    CREATE TABLE IF NOT EXISTS mcp_servers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      useCases TEXT,
      type TEXT NOT NULL,
      timeout INTEGER NOT NULL DEFAULT 30000,
      command TEXT,
      args TEXT,
      env TEXT,
      cwd TEXT,
      url TEXT,
      headers TEXT,
      enabled INTEGER NOT NULL DEFAULT 0,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_mcp_servers_updatedAt ON mcp_servers(updatedAt DESC);

    -- ===== MCP 服务器日志表（可选，用于持久化日志）=====
    CREATE TABLE IF NOT EXISTS mcp_server_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      serverId TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      level TEXT NOT NULL,
      message TEXT NOT NULL,
      FOREIGN KEY (serverId) REFERENCES mcp_servers(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_mcp_logs_server_time ON mcp_server_logs(serverId, timestamp DESC);

    -- ===== 调试信息表（run/step 结构，按 turn 聚合）=====
    CREATE TABLE IF NOT EXISTS chat_debug_runs (
      id TEXT PRIMARY KEY,
      sessionId TEXT NOT NULL,
      turnId TEXT NOT NULL,
      userMessageId TEXT,
      assistantMessageId TEXT,
      meta TEXT NOT NULL,
      startTime INTEGER NOT NULL,
      endTime INTEGER,
      status TEXT NOT NULL,
      finishReason TEXT,
      error TEXT,
      createdMessageIds TEXT,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_chat_debug_runs_turnId_createdAt ON chat_debug_runs(turnId, createdAt DESC);
    CREATE INDEX IF NOT EXISTS idx_chat_debug_runs_sessionId_createdAt ON chat_debug_runs(sessionId, createdAt DESC);

    CREATE TABLE IF NOT EXISTS chat_debug_steps (
      id TEXT PRIMARY KEY,
      runId TEXT NOT NULL,
      stepIndex INTEGER NOT NULL,
      startTime INTEGER NOT NULL,
      endTime INTEGER NOT NULL,
      inputMessages TEXT NOT NULL,
      outputContent TEXT,
      finishReason TEXT,
      usage TEXT,
      toolExecutions TEXT,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_chat_debug_steps_runId_stepIndex ON chat_debug_steps(runId, stepIndex ASC);

    -- ===== 知识库表 =====
    CREATE TABLE IF NOT EXISTS kbs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      embeddingModel TEXT,
      embeddingDimension INTEGER,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_kbs_updatedAt ON kbs(updatedAt DESC);

  `);

  d.exec(`

    -- ===== 知识库内容项表 =====
    CREATE TABLE IF NOT EXISTS kb_items (
      id TEXT PRIMARY KEY,
      kbId TEXT NOT NULL,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      source TEXT,
      content TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      error TEXT,
      fileType TEXT,
      fileSize INTEGER,
      fileMtime INTEGER,
      maxDepth INTEGER,
      chunkCount INTEGER DEFAULT 0,
      lastSyncAt INTEGER,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL,
      FOREIGN KEY (kbId) REFERENCES kbs(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_kb_items_kbId ON kb_items(kbId);
    CREATE INDEX IF NOT EXISTS idx_kb_items_status ON kb_items(status);

    -- ===== 向量元数据表 =====
    CREATE TABLE IF NOT EXISTS kb_chunks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      itemId TEXT NOT NULL,
      kbId TEXT NOT NULL,
      content TEXT NOT NULL,
      chunkIndex INTEGER NOT NULL,
      metadata TEXT,
      createdAt INTEGER NOT NULL,
      FOREIGN KEY (itemId) REFERENCES kb_items(id) ON DELETE CASCADE,
      FOREIGN KEY (kbId) REFERENCES kbs(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_kb_chunks_itemId ON kb_chunks(itemId);
    CREATE INDEX IF NOT EXISTS idx_kb_chunks_kbId ON kb_chunks(kbId);

    -- ===== 翻译历史表 =====
    CREATE TABLE IF NOT EXISTS translate_history (
      id TEXT PRIMARY KEY,
      input TEXT NOT NULL,
      result TEXT NOT NULL,
      targetLang TEXT NOT NULL,
      createdAt INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_translate_history_createdAt ON translate_history(createdAt DESC);

    -- ===== 工具执行白名单（用户确认后“加入白名单”的项）=====
    CREATE TABLE IF NOT EXISTS tool_allowlist (
      type TEXT NOT NULL,
      key TEXT NOT NULL,
      createdAt INTEGER NOT NULL,
      PRIMARY KEY (type, key)
    );
    CREATE INDEX IF NOT EXISTS idx_tool_allowlist_type ON tool_allowlist(type);
  `);

  // 兼容旧版本数据库：为 note_lists 增加 color 字段
  const noteListColumns = d.prepare("PRAGMA table_info(note_lists)").all() as Array<{ name: string }>;
  if (!noteListColumns.some((column) => column.name === "color")) {
    d.exec("ALTER TABLE note_lists ADD COLUMN color TEXT");
  }

  const messageColumns = d.prepare("PRAGMA table_info(messages)").all() as Array<{ name: string }>;
  if (!messageColumns.some((column) => column.name === "historicalMemory")) {
    d.exec("ALTER TABLE messages ADD COLUMN historicalMemory TEXT");
  }

  // 兼容旧版本数据库：为 sessions 增加 stateCursorUserMessageId 字段
  const sessionColumns = d.prepare("PRAGMA table_info(sessions)").all() as Array<{ name: string }>;
  if (!sessionColumns.some((column) => column.name === "stateCursorUserMessageId")) {
    d.exec("ALTER TABLE sessions ADD COLUMN stateCursorUserMessageId TEXT");
  }

  // 兼容旧版本数据库：为 scenarios 增加高级采样参数字段
  const scenarioColumns = d.prepare("PRAGMA table_info(scenarios)").all() as Array<{ name: string }>;
  if (!scenarioColumns.some((column) => column.name === "topK")) {
    d.exec("ALTER TABLE scenarios ADD COLUMN topK INTEGER");
  }
  if (!scenarioColumns.some((column) => column.name === "presencePenalty")) {
    d.exec("ALTER TABLE scenarios ADD COLUMN presencePenalty REAL");
  }
  if (!scenarioColumns.some((column) => column.name === "frequencyPenalty")) {
    d.exec("ALTER TABLE scenarios ADD COLUMN frequencyPenalty REAL");
  }
  if (!scenarioColumns.some((column) => column.name === "stopSequences")) {
    d.exec("ALTER TABLE scenarios ADD COLUMN stopSequences TEXT");
  }
  if (!scenarioColumns.some((column) => column.name === "seed")) {
    d.exec("ALTER TABLE scenarios ADD COLUMN seed INTEGER");
  }

  // 确保有默认场景
  const scenarioCount = d.prepare('SELECT COUNT(*) as count FROM scenarios').get() as { count: number };
  
  if (scenarioCount.count === 0) {
    const now = Date.now();
    const defaultScenarioId = 'default-scenario';
    
    d.prepare(`
      INSERT INTO scenarios (
        id, name, description, selectedModel,
        temperature, topP, topK, presencePenalty, frequencyPenalty, stopSequences, seed, contextCount, maxOutputTokens,
        systemPrompt, mcpServerIds, mcpPolicy, skillPolicy, maxToolSteps, workingDirs, kbIds, kbRecallTopK, kbRecallMinScore, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      defaultScenarioId,
      tMain("scenario.defaultName"),
      tMain("scenario.defaultDescription"),
      '__default__',
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      10,
      null,
      'You are a helpful assistant.',
      '[]',
      'auto',
      'auto',
      20,
      JSON.stringify([os.homedir()]),
      '[]',
      5,
      0.75,
      now,
      now
    );
  }

  // 确保图片/视频功能至少有一个默认工作区，避免首次进入页面出现无可用工作区
  const imageWorkspaceCount = d.prepare("SELECT COUNT(*) as count FROM image_workspaces").get() as { count: number };
  if (imageWorkspaceCount.count === 0) {
    const ts = Date.now();
    d.prepare(
      "INSERT INTO image_workspaces (id, name, lastComposerJson, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)"
    ).run("image-workspace-default", `${tMain("image.workspaceDefaultName")}1`, null, ts, ts);
  }
  d.prepare("UPDATE image_workspaces SET name = ?, updatedAt = ? WHERE id = ? AND name = ?").run(
    `${tMain("image.workspaceDefaultName")}1`,
    Date.now(),
    "image-workspace-default",
    `${tMain("image.workspaceDefaultName")} 1`
  );

  const videoWorkspaceCount = d.prepare("SELECT COUNT(*) as count FROM video_workspaces").get() as { count: number };
  if (videoWorkspaceCount.count === 0) {
    const ts = Date.now();
    d.prepare(
      "INSERT INTO video_workspaces (id, name, lastComposerJson, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)"
    ).run("video-workspace-default", `${tMain("video.workspaceDefaultName")}1`, null, ts, ts);
  }
  d.prepare("UPDATE video_workspaces SET name = ?, updatedAt = ? WHERE id = ? AND name = ?").run(
    `${tMain("video.workspaceDefaultName")}1`,
    Date.now(),
    "video-workspace-default",
    `${tMain("video.workspaceDefaultName")} 1`
  );

  // 确保有默认的发送快捷键设置
  const sendShortcutSetting = d.prepare('SELECT value FROM settings WHERE key = ?').get('sendShortcut');
  if (!sendShortcutSetting) {
    d.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('sendShortcut', 'enter');
  }

  // 确保有默认的网络搜索配置
  const webSearchConfig = d.prepare('SELECT value FROM settings WHERE key = ?').get('webSearch:config');
  if (!webSearchConfig) {
    const defaultConfig = JSON.stringify(DEFAULT_WEB_SEARCH_CONFIG);
    d.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('webSearch:config', defaultConfig);
  }

  // 长期记忆表（用户画像）
  d.exec(`
    CREATE TABLE IF NOT EXISTS long_term_memory (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL DEFAULT 'other',
      key TEXT NOT NULL UNIQUE,
      value TEXT NOT NULL,
      sessionId TEXT,
      messageId TEXT,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_long_term_memory_updatedAt ON long_term_memory(updatedAt DESC);
  `);

  d.exec(`
    CREATE TABLE IF NOT EXISTS historical_memory_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS historical_memory_chunks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sessionId TEXT NOT NULL,
      turnId TEXT NOT NULL,
      userMessageId TEXT,
      assistantMessageId TEXT,
      chunkIndex INTEGER NOT NULL,
      content TEXT NOT NULL,
      sourceHash TEXT NOT NULL,
      embeddingModel TEXT NOT NULL,
      embeddingDimension INTEGER NOT NULL,
      accessCount INTEGER NOT NULL DEFAULT 0,
      lastAccessedAt INTEGER,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL,
      UNIQUE(turnId, chunkIndex)
    );

    CREATE INDEX IF NOT EXISTS idx_historical_memory_chunks_turnId ON historical_memory_chunks(turnId);
    CREATE INDEX IF NOT EXISTS idx_historical_memory_chunks_sessionId ON historical_memory_chunks(sessionId);
    CREATE INDEX IF NOT EXISTS idx_historical_memory_chunks_createdAt ON historical_memory_chunks(createdAt DESC);
    CREATE INDEX IF NOT EXISTS idx_historical_memory_chunks_updatedAt ON historical_memory_chunks(updatedAt DESC);
  `);
}

/** 将 kbId 转为安全的 SQL 表名（仅字母数字下划线） */
export function toKbVectorTableName(kbId: string): string {
  return 'kb_vec_' + kbId.replace(/[^a-zA-Z0-9_]/g, '_');
}

/** 创建知识库专属向量表 */
export function createKbVectorTable(kbId: string, dimension: number): void {
  const dim = Math.max(1, Math.floor(dimension));
  if (dim > 10000) throw new Error(tMain("embedding.dimensionOutOfRange"));
  const d = getDb();
  const tableName = toKbVectorTableName(kbId);
  d.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS "${tableName}" USING vec0(
      id INTEGER PRIMARY KEY,
      embedding float[${dim}] distance_metric=cosine
    )
  `);
}

/** 删除知识库专属向量表 */
export function dropKbVectorTable(kbId: string): void {
  const d = getDb();
  const tableName = toKbVectorTableName(kbId);
  d.exec(`DROP TABLE IF EXISTS "${tableName}"`);
}

/** 检查知识库向量表是否存在 */
export function kbVectorTableExists(kbId: string): boolean {
  const d = getDb();
  const tableName = toKbVectorTableName(kbId);
  const row = d.prepare(`
    SELECT name FROM sqlite_master WHERE type='table' AND name=?
  `).get(tableName) as { name: string } | undefined;
  return !!row;
}

const HISTORICAL_MEMORY_VECTOR_TABLE = "historical_memory_vec";

export function getHistoricalMemoryVectorTableName(): string {
  return HISTORICAL_MEMORY_VECTOR_TABLE;
}

export function createHistoricalMemoryVectorTable(dimension: number): void {
  const dim = Math.max(1, Math.floor(dimension));
  if (dim > 10000) throw new Error(tMain("embedding.dimensionOutOfRange"));
  const d = getDb();
  d.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS "${HISTORICAL_MEMORY_VECTOR_TABLE}" USING vec0(
      id INTEGER PRIMARY KEY,
      embedding float[${dim}] distance_metric=cosine
    )
  `);
}

export function dropHistoricalMemoryVectorTable(): void {
  const d = getDb();
  d.exec(`DROP TABLE IF EXISTS "${HISTORICAL_MEMORY_VECTOR_TABLE}"`);
}

export function historicalMemoryVectorTableExists(): boolean {
  const d = getDb();
  const row = d.prepare(`
    SELECT name FROM sqlite_master WHERE type='table' AND name=?
  `).get(HISTORICAL_MEMORY_VECTOR_TABLE) as { name: string } | undefined;
  return !!row;
}
