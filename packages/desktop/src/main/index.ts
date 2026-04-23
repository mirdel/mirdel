import "./userDataPath";
import { app, BaseWindow, BrowserWindow, ipcMain, dialog, shell, screen, session, WebContentsView, Menu, clipboard, nativeImage, net, protocol } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { loggerServiceMain } from "@shared";
import { initDb } from "./services/db";
import { router } from "./ipc/router";
import installExtension, { VUEJS_DEVTOOLS } from "electron-devtools-installer";
import { initializeConfigManager } from "./services/models/ConfigManager";
import {
  ensureLocalProviderApiKey,
} from "./services/providers/providerData";
import { lazyMcpManager } from "./services/mcp/LazyMcpManager";
import { listEnabledMcpServers, updateMcpServer } from "./services/mcp/mcpData";
import { mcpServerManager } from "./services/mcp/mcpServerManager";
import { modelServerManager } from "./services/model-server";
import type { ServerStatusSnapshot } from "./services/model-server";
import { searxngServerManager } from "./services/web-search/SearxngServerManager";
import { ensureSkillsDirAndCopyBuiltin } from "./services/skill";
import { stopAiDevToolsViewer } from "./services/devtools/aiDevToolsService";
import { cleanupExpiredTemporarySessions } from "./services/chat/sessionData";
import { ensureGlobalSearchReady } from "./services/search/searchService";
import { getAssetFileById } from "./services/notes/noteData";
import { resolveAppletAssetFileByUrl } from "./services/applet/appletProcessManager";
import { ensureBuiltinApplets } from "./services/applet/appletData";
import { tMain } from "./i18n";
import { applyProxySettings, installProxyAwareFetch } from "./services/network/proxyRuntime";
import { getAppBehaviorSettings } from "./services/settings/settingsData";
import { applyLaunchAtLoginSetting } from "./services/app/loginItemService";
import { destroyTray, ensureTray } from "./services/app/trayService";
import { initializeUpdateService, scheduleAutomaticUpdateCheck } from "./services/app/updateService";

const logger = loggerServiceMain.withContext("main");

let mainWindow: BrowserWindow | null = null;
let imagePreviewWindow: BrowserWindow | null = null;
let webPreviewWindow: BaseWindow | null = null;
let webPreviewToolbarView: WebContentsView | null = null;
let webPreviewContentView: WebContentsView | null = null;
let aiDevToolsWindow: BrowserWindow | null = null;
let isQuitting = false;
let temporarySessionCleanupTimer: NodeJS.Timeout | null = null;

function broadcastModelServerStatus(status: ServerStatusSnapshot) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send("model-server:statusChanged", status);
    }
  }
}

const WEB_PREVIEW_TOOLBAR_HEIGHT = 50;
const CHROME_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

protocol.registerSchemesAsPrivileged([
  {
    scheme: "asset",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      corsEnabled: true,
    },
  },
  {
    scheme: "applet-asset",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      corsEnabled: true,
    },
  },
]);

type ImageInput = {
  src?: string;
  filePath?: string;
  name?: string;
};

async function ensureDataDir() {
  const base = app.getPath("userData");
  const dataDir = path.join(base, "data");
  await fs.mkdir(dataDir, { recursive: true });
  logger.info("data dir ensured", { dataDir });
  return dataDir;
}

function shouldMinimizeToTrayOnClose() {
  return getAppBehaviorSettings().minimizeToTrayOnClose;
}

async function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    await createMainWindow();
  }

  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function quitApplication() {
  if (isQuitting) return;
  isQuitting = true;
  app.quit();
}

function toggleDevToolsAtBottom() {
  const targetWindow = BrowserWindow.getFocusedWindow() ?? mainWindow;
  if (!targetWindow || targetWindow.isDestroyed()) return;

  const { webContents } = targetWindow;
  if (webContents.isDevToolsOpened()) {
    webContents.closeDevTools();
    return;
  }

  webContents.openDevTools({ mode: "bottom" });
}

async function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1080,
    height: 720,
    ...(process.platform === "darwin"
      ? {
          // macOS: 隐藏原生标题栏，并把三色按钮（traffic lights）嵌入到 web 内容层
          titleBarStyle: "hidden",
          trafficLightPosition: { x: 5, y: 6 }
        }
      : {}),
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.on("close", (event) => {
    if (isQuitting) return;

    if (shouldMinimizeToTrayOnClose()) {
      event.preventDefault();
      mainWindow?.hide();
      return;
    }

    if (process.platform !== "darwin") {
      event.preventDefault();
      quitApplication();
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  // 设置 Content Security Policy
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    const csp =
      "default-src * data: blob: asset: applet-asset:; script-src * 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' data: blob: asset: applet-asset:; style-src * 'unsafe-inline' data: blob: asset: applet-asset:; img-src * data: blob: asset: applet-asset:; media-src * data: blob: asset: applet-asset: file:; font-src * data: blob: asset: applet-asset:; connect-src * ws: wss: data: blob:;";
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [csp],
      }
    });
  });

  // electron-vite dev 会注入 ELECTRON_RENDERER_URL；兼容旧写法保留 VITE_DEV_SERVER_URL fallback
  const devUrl = process.env.ELECTRON_RENDERER_URL ?? process.env.VITE_DEV_SERVER_URL;
  
  // 窗口最大化
  mainWindow.maximize();

  if (devUrl) {
    await mainWindow.loadURL(devUrl);
    // mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    await mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }

  scheduleAutomaticUpdateCheck();
}

function getImagePreviewUrl(devUrl: string | undefined) {
  if (!devUrl) return null;
  // 将 devUrl 结尾的 index.html（如果有）替换为 image-preview.html
  return devUrl.replace(/(\/*index\.html)?$/, "/image-preview.html");
}

async function ensureImagePreviewWindow() {
  const devUrl = process.env.ELECTRON_RENDERER_URL ?? process.env.VITE_DEV_SERVER_URL;

  if (!imagePreviewWindow || imagePreviewWindow.isDestroyed()) {
    imagePreviewWindow = new BrowserWindow({
      width: 800,
      height: 600,
      show: false,
      ...(process.platform === "darwin"
        ? {
            titleBarStyle: "hiddenInset",
            trafficLightPosition: { x: 10, y: 12 }
          }
        : {}),
      webPreferences: {
        preload: path.join(__dirname, "../preload/index.cjs"),
        contextIsolation: true,
        nodeIntegration: false
      }
    });

    // 关闭时仅隐藏窗口，不销毁实例，保持单例并避免重复加载
    imagePreviewWindow.on("close", (event) => {
      // 用户显式退出应用时（例如 Cmd+Q），允许窗口正常关闭
      if (isQuitting) return;
      event.preventDefault();
      imagePreviewWindow?.hide();
    });

    const previewUrl = getImagePreviewUrl(devUrl);

    if (previewUrl) {
      await imagePreviewWindow.loadURL(previewUrl);
    } else {
      await imagePreviewWindow.loadFile(path.join(__dirname, "../renderer/image-preview.html"));
    }
  }
}

async function createOrShowImagePreviewWindow(imageInfo: ImageInput) {
  await ensureImagePreviewWindow();
  if (!imagePreviewWindow) return;

  imagePreviewWindow.show();
  imagePreviewWindow.focus();

  imagePreviewWindow.webContents.send("image-preview:update", imageInfo);
}

function getWebPreviewUrl(devUrl: string | undefined) {
  if (!devUrl) return null;
  return devUrl.replace(/(\/*index\.html)?$/, "/web-preview.html");
}

function sendWebPreviewStateToToolbar(state: {
  url: string;
  canGoBack: boolean;
  canGoForward: boolean;
  isLoading: boolean;
  loadError: string | null;
}) {
  webPreviewToolbarView?.webContents.send("web-preview:state", state);
}

function setupWebPreviewContentListeners() {
  const content = webPreviewContentView?.webContents;
  if (!content) return;

  content.on("did-start-loading", () => {
    sendWebPreviewStateToToolbar({
      url: content.getURL(),
      canGoBack: content.canGoBack(),
      canGoForward: content.canGoForward(),
      isLoading: true,
      loadError: null
    });
  });

  content.on("did-stop-loading", () => {
    sendWebPreviewStateToToolbar({
      url: content.getURL(),
      canGoBack: content.canGoBack(),
      canGoForward: content.canGoForward(),
      isLoading: false,
      loadError: null
    });
  });

  content.on("did-navigate", () => {
    sendWebPreviewStateToToolbar({
      url: content.getURL(),
      canGoBack: content.canGoBack(),
      canGoForward: content.canGoForward(),
      isLoading: content.isLoading(),
      loadError: null
    });
  });

  content.on("did-navigate-in-page", () => {
    sendWebPreviewStateToToolbar({
      url: content.getURL(),
      canGoBack: content.canGoBack(),
      canGoForward: content.canGoForward(),
      isLoading: content.isLoading(),
      loadError: null
    });
  });

  content.on("page-title-updated", (_evt, title) => {
    webPreviewWindow?.setTitle(title || tMain("window.webPreview"));
  });

  content.on("did-fail-load", (_evt, errorCode, errorDescription) => {
    if (errorCode === -3) return; // ERR_ABORTED
    sendWebPreviewStateToToolbar({
      url: content.getURL(),
      canGoBack: content.canGoBack(),
      canGoForward: content.canGoForward(),
      isLoading: false,
      loadError: errorDescription || tMain("web.loadFailed", { errorCode })
    });
  });

  content.setWindowOpenHandler(({ url }) => {
    content.loadURL(url);
    return { action: "deny" };
  });
}

async function ensureWebPreviewWindow() {
  const devUrl = process.env.ELECTRON_RENDERER_URL ?? process.env.VITE_DEV_SERVER_URL;

  if (!webPreviewWindow || webPreviewWindow.isDestroyed()) {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;
    const windowWidth = Math.round(screenWidth * 0.9);
    const windowHeight = Math.round(screenHeight * 0.9);

    webPreviewWindow = new BaseWindow({
      width: windowWidth,
      height: windowHeight,
      show: false,
      center: true,
      ...(process.platform === "darwin"
        ? {
            titleBarStyle: "hiddenInset",
            trafficLightPosition: { x: 10, y: 16 }
          }
        : {})
    });

    const toolbarSession = mainWindow?.webContents.session ?? session.defaultSession;
    webPreviewToolbarView = new WebContentsView({
      webPreferences: {
        preload: path.join(__dirname, "../preload/index.cjs"),
        contextIsolation: true,
        nodeIntegration: false,
        session: toolbarSession
      }
    });

    webPreviewContentView = new WebContentsView({
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        partition: "persist:web-preview"
      }
    });
    webPreviewContentView.webContents.setUserAgent(CHROME_USER_AGENT);

    webPreviewWindow.contentView.addChildView(webPreviewToolbarView);
    webPreviewWindow.contentView.addChildView(webPreviewContentView);

    const toolbarHeight = WEB_PREVIEW_TOOLBAR_HEIGHT;
    webPreviewToolbarView.setBounds({ x: 0, y: 0, width: windowWidth, height: toolbarHeight });
    webPreviewContentView.setBounds({
      x: 0,
      y: toolbarHeight,
      width: windowWidth,
      height: windowHeight - toolbarHeight
    });

    webPreviewWindow.on("resize", () => {
      const [w, h] = webPreviewWindow!.getContentSize();
      webPreviewToolbarView?.setBounds({ x: 0, y: 0, width: w, height: toolbarHeight });
      webPreviewContentView?.setBounds({ x: 0, y: toolbarHeight, width: w, height: h - toolbarHeight });
    });

    webPreviewWindow.on("close", (event) => {
      if (isQuitting) return;
      event.preventDefault();
      webPreviewWindow?.hide();
    });

    webPreviewWindow.on("closed", () => {
      webPreviewToolbarView?.webContents.close();
      webPreviewContentView?.webContents.close();
      webPreviewToolbarView = null;
      webPreviewContentView = null;
      webPreviewWindow = null;
    });

    setupWebPreviewContentListeners();

    const previewUrl = getWebPreviewUrl(devUrl);
    if (previewUrl) {
      await webPreviewToolbarView.webContents.loadURL(previewUrl);
    } else {
      await webPreviewToolbarView.webContents.loadFile(path.join(__dirname, "../renderer/web-preview.html"));
    }
  }
}

function normalizeUrl(url: string): string {
  try {
    return new URL(url).href;
  } catch {
    return url;
  }
}

async function createOrShowWebPreviewWindow(url: string) {
  await ensureWebPreviewWindow();
  if (!webPreviewWindow || !webPreviewContentView) return;

  const content = webPreviewContentView.webContents;
  const currentUrl = content.getURL();
  const targetNormalized = normalizeUrl(url);
  const currentNormalized = currentUrl ? normalizeUrl(currentUrl) : "";

  if (targetNormalized === currentNormalized && currentUrl && currentUrl !== "about:blank") {
    webPreviewWindow.show();
    webPreviewWindow.focus();
    return;
  }

  webPreviewWindow.show();
  webPreviewWindow.focus();

  await content.loadURL("about:blank");
  sendWebPreviewStateToToolbar({
    url: "about:blank",
    canGoBack: false,
    canGoForward: false,
    isLoading: false,
    loadError: null
  });
  content.navigationHistory?.clear?.();

  await content.loadURL(url);
  sendWebPreviewStateToToolbar({
    url,
    canGoBack: content.canGoBack(),
    canGoForward: content.canGoForward(),
    isLoading: true,
    loadError: null
  });
}

async function ensureAiDevToolsWindow() {
  if (!aiDevToolsWindow || aiDevToolsWindow.isDestroyed()) {
    aiDevToolsWindow = new BrowserWindow({
      width: 1000,
      height: 700,
      show: false,
      autoHideMenuBar: true,
      title: "AI DevTools",
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false
      }
    });

    aiDevToolsWindow.on("close", (event) => {
      if (isQuitting) return;
      event.preventDefault();
      aiDevToolsWindow?.hide();
    });
  }
}

async function createOrShowAiDevToolsWindow(url: string) {
  await ensureAiDevToolsWindow();
  if (!aiDevToolsWindow) return;

  const currentUrl = aiDevToolsWindow.webContents.getURL();
  const targetNormalized = normalizeUrl(url);
  const currentNormalized = currentUrl ? normalizeUrl(currentUrl) : "";

  aiDevToolsWindow.show();
  aiDevToolsWindow.focus();
  if (targetNormalized === currentNormalized && currentUrl) return;

  await aiDevToolsWindow.loadURL(url);
}

function isHttpImage(src: string) {
  return /^https?:\/\//i.test(src);
}

function parseBase64Data(src: string) {
  // 兼容 dataURL（base64 或 urlencoded）和纯 base64 字符串
  const dataUrlMatch = src.match(/^data:([^,]*?),(.*)$/i);
  if (dataUrlMatch) {
    const meta = dataUrlMatch[1] || "";
    const payload = dataUrlMatch[2] || "";
    const mediaTypeToken = meta
      .split(";")
      .map((token) => token.trim())
      .find((token) => token.length > 0 && token.includes("/"));
    const mime = mediaTypeToken || "image/png";
    const isBase64 = /;base64/i.test(meta);
    let normalizedPayload = payload;
    if (!isBase64) {
      try {
        normalizedPayload = Buffer.from(decodeURIComponent(payload), "utf8").toString("base64");
      } catch {
        normalizedPayload = Buffer.from(payload, "utf8").toString("base64");
      }
    }

    return {
      mime,
      data: isBase64 ? payload : normalizedPayload
    };
  }

  // 默认按 png 处理
  return {
    mime: "image/png",
    data: src
  };
}

function getExtensionFromMime(mime: string) {
  if (mime === "image/png") return "png";
  if (mime === "image/jpeg" || mime === "image/jpg") return "jpg";
  if (mime === "image/gif") return "gif";
  if (mime === "image/webp") return "webp";
  if (mime === "image/svg+xml") return "svg";
  return "png";
}

function inferMediaTypeFromFilePath(filePath: string) {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  if (lower.endsWith(".mp4")) return "video/mp4";
  if (lower.endsWith(".webm")) return "video/webm";
  if (lower.endsWith(".mov")) return "video/quicktime";
  if (lower.endsWith(".mpeg") || lower.endsWith(".mpg")) return "video/mpeg";
  return "application/octet-stream";
}

function isPathInside(parent: string, target: string) {
  const relative = path.relative(parent, target);
  return !relative.startsWith("..") && !path.isAbsolute(relative);
}

async function readImageAssetFile(input: { filePath: string }) {
  const rawPath = input?.filePath ?? "";
  if (!rawPath) return { ok: false as const, error: "filePath is required" };

  const normalizedPath = path.resolve(rawPath);
  const assetRoot = path.resolve(path.join(app.getPath("userData"), "assets"));
  if (!isPathInside(assetRoot, normalizedPath)) {
    return { ok: false as const, error: "access denied" };
  }

  const bytes = await fs.readFile(normalizedPath);
  return {
    ok: true as const,
    base64: bytes.toString("base64"),
    mediaType: inferMediaTypeFromFilePath(normalizedPath),
  };
}

function parseAssetIdFromUrl(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "asset:") return null;

    const hostPart = decodeURIComponent(url.hostname || "");
    const pathPart = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
    const candidate = (hostPart || pathPart.split("/")[0] || "").trim();
    if (!candidate || !/^[0-9a-zA-Z-]+$/.test(candidate)) return null;
    return candidate;
  } catch {
    return null;
  }
}

function resolveAssetFileById(assetId: string): { id: string; filePath: string; mediaType?: string } | null {
  const asset = getAssetFileById(assetId);
  if (!asset) return null;

  const normalizedPath = path.resolve(asset.filePath);
  const assetRoot = path.resolve(path.join(app.getPath("userData"), "assets"));
  if (!isPathInside(assetRoot, normalizedPath)) return null;

  return {
    id: asset.id,
    filePath: normalizedPath,
    mediaType: asset.mediaType,
  };
}

function resolveAssetFileByUrl(rawUrl: string): { id: string; filePath: string; mediaType?: string } | null {
  const assetId = parseAssetIdFromUrl(rawUrl);
  if (!assetId) return null;
  return resolveAssetFileById(assetId);
}

function registerAssetProtocol() {
  protocol.handle("asset", async (request) => {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("method not allowed", { status: 405 });
    }

    const asset = resolveAssetFileByUrl(request.url);
    if (!asset) {
      const assetId = parseAssetIdFromUrl(request.url);
      return new Response(assetId ? "asset not found" : "invalid asset url", { status: assetId ? 404 : 400 });
    }

    try {
      const fileUrl = pathToFileURL(asset.filePath).toString();
      const upstream = await net.fetch(fileUrl, {
        method: request.method,
        headers: request.headers,
      });

      const headers = new Headers(upstream.headers);
      if (!headers.has("content-type")) {
        headers.set("content-type", asset.mediaType || inferMediaTypeFromFilePath(asset.filePath));
      }
      if (!headers.has("cache-control")) {
        headers.set("cache-control", "public, max-age=31536000, immutable");
      }

      return new Response(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers,
      });
    } catch {
      return new Response("asset not found", { status: 404 });
    }
  });
}

function registerAppletAssetProtocol() {
  protocol.handle("applet-asset", async (request) => {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("method not allowed", { status: 405 });
    }
    const filePath = resolveAppletAssetFileByUrl(request.url);
    if (!filePath) {
      return new Response("asset not found", { status: 404 });
    }
    try {
      const fileUrl = pathToFileURL(filePath).toString();
      const upstream = await net.fetch(fileUrl, {
        method: request.method,
        headers: request.headers,
      });
      const headers = new Headers(upstream.headers);
      if (!headers.has("content-type")) {
        headers.set("content-type", inferMediaTypeFromFilePath(filePath));
      }
      if (!headers.has("cache-control")) {
        headers.set("cache-control", "public, max-age=31536000, immutable");
      }
      return new Response(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers,
      });
    } catch {
      return new Response("asset not found", { status: 404 });
    }
  });
}

async function handleDownloadImage(imageInfo: ImageInput, ownerWindow?: BrowserWindow | null) {
  const { src, filePath: rawFilePath, name } = imageInfo;
  const sourceAsset = !rawFilePath && src ? resolveAssetFileByUrl(src) : null;

  const sourceIsFilePath = typeof rawFilePath === "string" && rawFilePath.length > 0;
  const sourceIsHttp = !!src && isHttpImage(src);
  const sourceIsDataUrl = !!src && /^data:/i.test(src);
  const sourceIsRawBase64 = !!src && /^[A-Za-z0-9+/=\s]+$/.test(src);
  const sourceIsBlob = !!src && /^blob:/i.test(src);

  if (!sourceIsFilePath && !sourceIsHttp && !sourceAsset && !sourceIsDataUrl && !sourceIsRawBase64) {
    if (sourceIsBlob) {
      throw new Error("blob URL is not supported for download; use filePath or data/http src");
    }
    throw new Error("unsupported image source");
  }

  const rawBaseName = (name || "image").trim() || "image";
  let defaultExt = "png";

  if (sourceIsFilePath) {
    const filePath = path.resolve(rawFilePath!);
    const ext = path.extname(filePath).replace(".", "").toLowerCase();
    if (ext) defaultExt = ext;
  } else if (sourceAsset) {
    const ext = path.extname(sourceAsset.filePath).replace(".", "").toLowerCase();
    if (ext) defaultExt = ext;
    if (!ext && sourceAsset.mediaType) {
      defaultExt = getExtensionFromMime(sourceAsset.mediaType);
    }
  } else if (!sourceIsHttp) {
    const { mime } = parseBase64Data(src!);
    defaultExt = getExtensionFromMime(mime);
  } else {
    const urlPath = new URL(src!).pathname;
    const fileName = urlPath.split("/").filter(Boolean).pop();
    if (fileName && fileName.includes(".")) {
      defaultExt = fileName.split(".").pop() || defaultExt;
    }
  }

  const extPattern = /\.(png|jpe?g|gif|webp|svg)$/i;
  const baseName = rawBaseName.replace(extPattern, "");
  const defaultPath = `${baseName}.${defaultExt}`;

  const { canceled, filePath } = await dialog.showSaveDialog(ownerWindow ?? mainWindow ?? undefined, {
    title: tMain("dialog.saveAs"),
    defaultPath,
    filters: [
      { name: tMain("dialog.filterImage"), extensions: ["png", "jpg", "jpeg", "gif", "webp", "svg"] },
      { name: tMain("dialog.filterAllFiles"), extensions: ["*"] }
    ]
  });

  if (canceled || !filePath) return;

  if (sourceIsFilePath) {
    const normalizedPath = path.resolve(rawFilePath!);
    const assetRoot = path.resolve(path.join(app.getPath("userData"), "assets"));
    if (!isPathInside(assetRoot, normalizedPath)) {
      throw new Error("access denied");
    }
    const bytes = await fs.readFile(normalizedPath);
    await fs.writeFile(filePath, bytes);
  } else if (sourceAsset) {
    const bytes = await fs.readFile(sourceAsset.filePath);
    await fs.writeFile(filePath, bytes);
  } else if (sourceIsHttp) {
    const response = await fetch(src!);
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    await fs.writeFile(filePath, buffer);
  } else {
    const { data } = parseBase64Data(src!);
    const buffer = Buffer.from(data, "base64");
    await fs.writeFile(filePath, buffer);
  }
}

async function resolveImageDataUrl(input: ImageInput): Promise<string> {
  const { src, filePath } = input;

  if (filePath) {
    const readResult = await readImageAssetFile({ filePath });
    if (!readResult.ok || !readResult.base64) throw new Error(readResult.error || "failed to read image file");
    return `data:${readResult.mediaType || "application/octet-stream"};base64,${readResult.base64}`;
  }

  if (!src) throw new Error("unsupported image source");
  if (/^asset:/i.test(src)) {
    const asset = resolveAssetFileByUrl(src);
    if (!asset) throw new Error("asset not found");
    const readResult = await readImageAssetFile({ filePath: asset.filePath });
    if (!readResult.ok || !readResult.base64) throw new Error(readResult.error || "failed to read image file");
    return `data:${asset.mediaType || readResult.mediaType || "application/octet-stream"};base64,${readResult.base64}`;
  }
  if (/^data:/i.test(src)) return src;
  if (/^https?:\/\//i.test(src)) {
    const response = await fetch(src);
    const arrayBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    const mediaType = response.headers.get("content-type") || "application/octet-stream";
    return `data:${mediaType};base64,${base64}`;
  }
  if (/^[A-Za-z0-9+/=\s]+$/.test(src)) {
    return `data:image/png;base64,${src.replace(/\s+/g, "")}`;
  }

  throw new Error("unsupported image source");
}

async function handleCopyImage(imageInfo: ImageInput) {
  let filePath = imageInfo?.filePath ? path.resolve(imageInfo.filePath) : "";
  if (!filePath && imageInfo?.src && /^asset:/i.test(imageInfo.src)) {
    const asset = resolveAssetFileByUrl(imageInfo.src);
    if (asset?.filePath) {
      filePath = asset.filePath;
    }
  }

  if (filePath) {
    const assetRoot = path.resolve(path.join(app.getPath("userData"), "assets"));
    if (!isPathInside(assetRoot, filePath)) {
      throw new Error("access denied");
    }

    const imageFromPath = nativeImage.createFromPath(filePath);
    if (!imageFromPath.isEmpty()) {
      clipboard.writeImage(imageFromPath);
      return;
    }

    const mediaTypeFromPath = inferMediaTypeFromFilePath(filePath);
    if (mediaTypeFromPath === "image/svg+xml") {
      const bytes = await fs.readFile(filePath);
      clipboard.writeBuffer("image/svg+xml", bytes);
      return;
    }
  }

  const dataUrl = await resolveImageDataUrl(imageInfo);
  const image = nativeImage.createFromDataURL(dataUrl);
  if (!image.isEmpty()) {
    clipboard.writeImage(image);
    return;
  }

  const { mime, data } = parseBase64Data(dataUrl);
  if (mime === "image/svg+xml") {
    clipboard.writeBuffer("image/svg+xml", Buffer.from(data, "base64"));
    return;
  }

  throw new Error("failed to decode image");
}

function setupApplicationMenu() {
  const isMac = process.platform === "darwin";
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about" as const },
              { type: "separator" as const },
              { role: "services" as const },
              { type: "separator" as const },
              { role: "hide" as const },
              { role: "hideOthers" as const },
              { role: "unhide" as const },
              { type: "separator" as const },
              { role: "quit" as const }
            ]
          } as Electron.MenuItemConstructorOptions
        ]
      : []),
    {
      label: tMain("menu.edit"),
      submenu: [
        { role: "undo" as const },
        { role: "redo" as const },
        { type: "separator" as const },
        { role: "cut" as const },
        { role: "copy" as const },
        { role: "paste" as const },
        ...(isMac ? [{ role: "pasteAndMatchStyle" as const }] : []),
        { role: "selectAll" as const }
      ]
    },
    {
      label: tMain("menu.view"),
      submenu: [
        {
          label: tMain("menu.toggleDevTools"),
          accelerator: isMac ? "Alt+Command+I" : "Ctrl+Shift+I",
          click: toggleDevToolsAtBottom
        },
        { role: "reload" as const },
        { type: "separator" as const },
        { role: "resetZoom" as const },
        { role: "zoomIn" as const },
        { role: "zoomOut" as const },
        { type: "separator" as const },
        { role: "togglefullscreen" as const }
      ]
    },
    {
      label: tMain("menu.window"),
      submenu: [
        { role: "minimize" as const },
        { role: "zoom" as const },
        ...(isMac
          ? [
              { type: "separator" as const },
              { role: "front" as const },
              { type: "separator" as const },
              { role: "window" as const }
            ]
          : [{ role: "close" as const }])
      ]
    },
    {
      label: tMain("menu.help"),
      submenu: [{ role: "about" as const }]
    }
  ];
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function registerContextMenu() {
  app.on("web-contents-created", (_event, contents) => {
    contents.on("context-menu", (event, params) => {
      const selectedText = (params.selectionText || "").trim();
      const hasSelection = selectedText.length > 0;
      const isEditable = params.isEditable;
      const template: Electron.MenuItemConstructorOptions[] = [];

      if (isEditable) {
        template.push(
          { role: "undo" as const },
          { role: "redo" as const },
          { type: "separator" as const },
          { role: "cut" as const },
          { role: "copy" as const },
          { role: "paste" as const },
          { type: "separator" as const },
          { role: "selectAll" as const }
        );
      } else if (hasSelection) {
        template.push({ role: "copy" as const });
      }

      if (template.length === 0) return;

      event.preventDefault();
      const menu = Menu.buildFromTemplate(template);
      const ownerWindow = BrowserWindow.fromWebContents(contents) ?? undefined;
      menu.popup({ window: ownerWindow });
    });
  });
}

function registerIpc() {
  // 防止重复注册：先移除所有旧的 handlers
  const channels = [
    ...Object.keys(router),
    "ax:log"
  ];
  
  channels.forEach(channel => {
    ipcMain.removeHandler(channel);
  });

  // 注册 typed-electron-ipc router
  Object.entries(router).forEach(([channel, handler]) => {
    ipcMain.handle(channel, handler as any);
  });

  // Logger 通道：保持原有的 ipcMain.on 方式
  ipcMain.removeAllListeners('ax:log');
  ipcMain.on("ax:log", (_evt, payload: { level: "error" | "warn" | "info" | "debug"; message: string; extra?: unknown }) => {
    const { level, message, extra } = payload ?? {};
    const l = loggerServiceMain.withContext("renderer");
    l[level]?.(message, extra);
  });

  // 图片预览：打开窗口并更新内容
  ipcMain.removeAllListeners("image-preview:open");
  ipcMain.on("image-preview:open", async (_evt, imageInfo: ImageInput) => {
    try {
      if (imageInfo?.filePath && !imageInfo.src) {
        const readResult = await readImageAssetFile({ filePath: imageInfo.filePath });
        if (readResult?.ok && readResult.base64) {
          imageInfo = {
            src: `data:${readResult.mediaType || "application/octet-stream"};base64,${readResult.base64}`,
            filePath: imageInfo.filePath,
            name: imageInfo.name,
          };
        } else {
          logger.warn("failed to resolve preview filePath", { filePath: imageInfo.filePath, error: readResult?.error });
          return;
        }
      }
      if (!imageInfo?.src) return;
      await createOrShowImagePreviewWindow(imageInfo);
    } catch (error) {
      logger.error("failed to open image preview window", { error });
    }
  });

  // 图片下载：独立能力（与预览窗口解耦）
  ipcMain.removeHandler("image-asset:download");
  ipcMain.handle("image-asset:download", async (evt, imageInfo: ImageInput) => {
    try {
      const ownerWindow = BrowserWindow.fromWebContents(evt.sender);
      await handleDownloadImage(imageInfo, ownerWindow);
      return { ok: true };
    } catch (error) {
      logger.error("failed to download image", { error });
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.removeHandler("image-asset:copy");
  ipcMain.handle("image-asset:copy", async (_evt, imageInfo: ImageInput) => {
    try {
      await handleCopyImage(imageInfo);
      return { ok: true };
    } catch (error) {
      logger.error("failed to copy image", { error });
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  // 图片资产读取：用于 renderer 转 Blob URL 展示（不暴露 file://）
  ipcMain.removeHandler("image-asset:read-file");
  ipcMain.handle("image-asset:read-file", async (_evt, input: { filePath: string }) => {
    try {
      return await readImageAssetFile(input);
    } catch (error) {
      logger.error("failed to read image asset", { error });
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  // 网页预览：打开窗口并更新内容
  ipcMain.removeAllListeners("web-preview:open");
  ipcMain.on("web-preview:open", async (_evt, url: string) => {
    try {
      await createOrShowWebPreviewWindow(url);
    } catch (error) {
      logger.error("failed to open web preview window", { error });
    }
  });

  // 网页预览：导航控制（由 toolbar 调用）
  ipcMain.removeAllListeners("web-preview:goBack");
  ipcMain.on("web-preview:goBack", () => {
    if (webPreviewContentView?.webContents.canGoBack()) {
      webPreviewContentView.webContents.goBack();
    }
  });
  ipcMain.removeAllListeners("web-preview:goForward");
  ipcMain.on("web-preview:goForward", () => {
    if (webPreviewContentView?.webContents.canGoForward()) {
      webPreviewContentView.webContents.goForward();
    }
  });
  ipcMain.removeAllListeners("web-preview:reload");
  ipcMain.on("web-preview:reload", () => {
    webPreviewContentView?.webContents.reload();
  });
  ipcMain.removeAllListeners("web-preview:stop");
  ipcMain.on("web-preview:stop", () => {
    webPreviewContentView?.webContents.stop();
  });
  ipcMain.removeAllListeners("web-preview:loadURL");
  ipcMain.on("web-preview:loadURL", async (_evt, url: string) => {
    if (webPreviewContentView && url) {
      await webPreviewContentView.webContents.loadURL(url);
    }
  });

  // 网页预览：在浏览器中打开
  ipcMain.removeHandler("web-preview:open-in-browser");
  ipcMain.handle("web-preview:open-in-browser", async (_evt, url: string) => {
    try {
      await shell.openExternal(url);
      return { ok: true };
    } catch (error) {
      logger.error("failed to open in browser", { error });
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  // AI DevTools 独立预览窗口（不复用 webPreview）
  ipcMain.removeAllListeners("devtools-preview:open");
  ipcMain.on("devtools-preview:open", async (_evt, url: string) => {
    try {
      await createOrShowAiDevToolsWindow(url);
    } catch (error) {
      logger.error("failed to open AI DevTools window", { error });
    }
  });
}

app.on("ready", async () => {
  logger.info("app ready");
  setupApplicationMenu();
  registerContextMenu();
  installProxyAwareFetch();
  initDb();
  await applyProxySettings();
  try {
    await ensureBuiltinApplets();
    logger.info("builtin applets ensured");
  } catch (error) {
    logger.error("failed to ensure builtin applets", { error });
  }
  try {
    ensureGlobalSearchReady();
    logger.info("global search initialized on startup");
  } catch (error) {
    logger.error("failed to initialize global search on startup", { error });
  }
  registerAssetProtocol();
  registerAppletAssetProtocol();
  try {
    const cleaned = cleanupExpiredTemporarySessions();
    logger.info("temporary sessions cleaned on startup", { cleaned: cleaned.count });
  } catch (error) {
    logger.error("failed to cleanup temporary sessions on startup", { error });
  }
  temporarySessionCleanupTimer = setInterval(() => {
    try {
      const cleaned = cleanupExpiredTemporarySessions();
      if (cleaned.count > 0) {
        logger.info("temporary sessions cleaned by timer", { cleaned: cleaned.count });
        for (const win of BrowserWindow.getAllWindows()) {
          if (!win.isDestroyed()) {
            win.webContents.send("chat:temporarySessionsDeleted", { sessionIds: cleaned.sessionIds });
          }
        }
      }
    } catch (error) {
      logger.error("failed to cleanup temporary sessions by timer", { error });
    }
  }, 30 * 60 * 1000);
  
  // 初始化远程配置管理器
  await initializeConfigManager();

  const localProviderApiKey = ensureLocalProviderApiKey();
  modelServerManager.onStatusChange(broadcastModelServerStatus);
  
  // 启动本地模型服务（后台运行，不阻塞）
  modelServerManager.start({ apiKey: localProviderApiKey }).then(port => {
    logger.info("Model server started", { port });
  }).catch(error => {
    logger.error("Failed to start model server", { error });
  });

  // 启动内置 SearXNG 服务（后台运行，不阻塞）
  searxngServerManager.start().then(port => {
    logger.info("SearXNG server started", { port });
  }).catch(error => {
    logger.error("Failed to start SearXNG server", { error });
  });
  
  // 自动启动所有 enabled: true 的 MCP 服务器
  const enabledServers = listEnabledMcpServers();
  if (enabledServers.length > 0) {
    logger.info("Starting enabled MCP servers", { count: enabledServers.length });
    
    // 并发启动所有 enabled 服务器
    const startPromises = enabledServers.map(async (server) => {
      try {
        await lazyMcpManager.manualStart(server.id);
        await mcpServerManager.loadServerCapabilities(server.id);
        logger.info("MCP server started successfully", { serverId: server.id, name: server.name });
      } catch (error) {
        // 启动失败，更新 enabled 为 false
        logger.error("Failed to start MCP server, setting enabled to false", { 
          serverId: server.id, 
          name: server.name, 
          error 
        });
        try {
          updateMcpServer(server.id, { enabled: false });
        } catch (updateError) {
          logger.error("Failed to update enabled status", { serverId: server.id, updateError });
        }
      }
    });
    
    // 不阻塞应用启动，后台并发启动
    Promise.all(startPromises).then(() => {
      logger.info("All enabled MCP servers startup attempts completed");
    });
  } else {
    logger.info("No enabled MCP servers to start");
  }
  
  registerIpc();
  initializeUpdateService({
    getWindows: () => BrowserWindow.getAllWindows(),
    beforeQuitForUpdate: () => {
      isQuitting = true;
    }
  });
  await ensureDataDir();
  ensureSkillsDirAndCopyBuiltin();
  applyLaunchAtLoginSetting(getAppBehaviorSettings().launchAtLogin);
  await createMainWindow();
  ensureTray({
    showMainWindow,
    quitApp: quitApplication
  });
  // 预先创建图片预览窗口，但默认隐藏，避免首次点击时的加载时序问题
  await ensureImagePreviewWindow();

  // 在开发模式下安装 Vue DevTools
  const devUrl = process.env.ELECTRON_RENDERER_URL ?? process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    try {
      const name = await installExtension(VUEJS_DEVTOOLS);
      // logger.info("Vue DevTools installed", { name });
    } catch (err) {
      logger.error("Failed to install Vue DevTools", err);
    }
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  isQuitting = true;
  destroyTray();
  if (temporarySessionCleanupTimer) {
    clearInterval(temporarySessionCleanupTimer);
    temporarySessionCleanupTimer = null;
  }
  // 停止所有 MCP 服务器
  lazyMcpManager.stopAll().catch(error => {
    logger.error("Failed to stop MCP servers", { error });
  });
  // 停止本地模型服务
  modelServerManager.stop().catch(error => {
    logger.error("Failed to stop model server", { error });
  });
  searxngServerManager.stop().catch(error => {
    logger.error("Failed to stop SearXNG server", { error });
  });
  stopAiDevToolsViewer();
});

app.on("activate", async () => {
  await showMainWindow();
});
