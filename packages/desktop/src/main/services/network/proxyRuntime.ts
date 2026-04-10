import { app, net, session, type ProxyConfig } from "electron";
import { loggerServiceMain } from "@shared";
import { getProxySettings, type ProxySettings } from "../settings/settingsData";

const logger = loggerServiceMain.withContext("proxyRuntime");

const MANAGED_SESSION_PARTITIONS = ["persist:web-preview", "persist:web-search"];
const PROXY_ENV_KEYS = [
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "ALL_PROXY",
  "NO_PROXY",
  "NODE_USE_ENV_PROXY",
  "http_proxy",
  "https_proxy",
  "all_proxy",
  "no_proxy",
];
const initialProxyEnv = Object.fromEntries(
  PROXY_ENV_KEYS.map((key) => [key, process.env[key]])
) as Record<string, string | undefined>;

const nativeFetch = globalThis.fetch.bind(globalThis);
let proxyAwareFetchInstalled = false;

function resolveRequestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  if (typeof Request !== "undefined" && input instanceof Request) return input.url;
  return String(input);
}

function isHttpRequest(input: RequestInfo | URL): boolean {
  try {
    const url = new URL(resolveRequestUrl(input));
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function buildElectronProxyConfig(settings: ProxySettings): ProxyConfig {
  if (settings.mode === "direct") {
    return { mode: "direct" };
  }

  if (settings.mode === "custom" && settings.server) {
    return {
      mode: "fixed_servers",
      proxyRules: settings.server,
      proxyBypassRules: settings.bypassRules.join(","),
    };
  }

  return { mode: "system" };
}

function resolveEffectiveProxySettings(settings: ProxySettings): ProxySettings {
  if (settings.mode !== "custom") {
    return settings;
  }

  if (settings.server.trim()) {
    return {
      ...settings,
      server: settings.server.trim(),
    };
  }

  return {
    ...settings,
    mode: "system",
    server: "",
  };
}

function buildProxyEnv(settings: ProxySettings): Record<string, string | undefined> {
  if (settings.mode === "system") {
    return { ...initialProxyEnv };
  }

  if (settings.mode !== "custom" || !settings.server) {
    return Object.fromEntries(PROXY_ENV_KEYS.map((key) => [key, undefined]));
  }

  const noProxy = settings.bypassRules.join(",");
  return {
    HTTP_PROXY: settings.server,
    HTTPS_PROXY: settings.server,
    ALL_PROXY: settings.server,
    NO_PROXY: noProxy,
    NODE_USE_ENV_PROXY: "1",
    http_proxy: settings.server,
    https_proxy: settings.server,
    all_proxy: settings.server,
    no_proxy: noProxy,
  };
}

function applyProcessEnv(settings: ProxySettings) {
  const nextEnv = buildProxyEnv(settings);
  for (const key of PROXY_ENV_KEYS) {
    const value = nextEnv[key];
    if (value) {
      process.env[key] = value;
    } else {
      delete process.env[key];
    }
  }
}

async function applySessionProxy(config: ProxyConfig, partition?: string) {
  const targetSession = partition ? session.fromPartition(partition) : session.defaultSession;
  await targetSession.setProxy(config);
  try {
    await targetSession.closeAllConnections();
  } catch (error) {
    logger.warn("failed to close session connections after proxy update", {
      partition: partition || "default",
      error,
    });
  }
}

export async function proxyAwareFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (!app.isReady() || !isHttpRequest(input)) {
    return nativeFetch(input, init);
  }

  return net.fetch(input, init);
}

export function installProxyAwareFetch() {
  if (proxyAwareFetchInstalled) return;
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => (
    proxyAwareFetch(input, init)
  )) as typeof globalThis.fetch;
  proxyAwareFetchInstalled = true;
}

export async function applyProxySettings(settings: ProxySettings = getProxySettings()) {
  installProxyAwareFetch();
  const effectiveSettings = resolveEffectiveProxySettings(settings);
  applyProcessEnv(effectiveSettings);

  if (!app.isReady()) {
    return settings;
  }

  const config = buildElectronProxyConfig(effectiveSettings);
  await app.setProxy(config);
  await applySessionProxy(config);

  for (const partition of MANAGED_SESSION_PARTITIONS) {
    await applySessionProxy(config, partition);
  }

  logger.info("proxy settings applied", {
    mode: settings.mode,
    server: settings.server || null,
    bypassRules: settings.bypassRules,
    effectiveMode: effectiveSettings.mode,
    effectiveServer: effectiveSettings.server || null,
  });

  return settings;
}
