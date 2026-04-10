import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { loggerServiceMain } from "@shared";

const logger = loggerServiceMain.withContext("aiDevToolsService");
const DEVTOOLS_URL = "http://127.0.0.1:4983";

let devToolsProcess: any = null;

type ViewerStatus = {
  running: boolean;
  url: string;
  pid?: number;
};

function resolveDevToolsCliPath(): string {
  const require = createRequire(import.meta.url);
  const entryPath = require.resolve("@ai-sdk/devtools");
  const packageRoot = path.resolve(path.dirname(entryPath), "..");
  const cliPath = path.join(packageRoot, "bin", "cli.js");
  if (!fs.existsSync(cliPath)) {
    throw new Error(`无法找到 @ai-sdk/devtools CLI: ${cliPath}`);
  }
  return cliPath;
}

async function waitUntilViewerReady(timeoutMs = 6000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(DEVTOOLS_URL, { method: "GET" });
      if (response.ok) return true;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return false;
}

export function getAiDevToolsViewerStatus(): ViewerStatus {
  return {
    running: !!devToolsProcess && !devToolsProcess.killed,
    url: DEVTOOLS_URL,
    ...(devToolsProcess?.pid ? { pid: devToolsProcess.pid } : {}),
  };
}

export async function startAiDevToolsViewer(): Promise<{ ok: boolean; url: string; error?: string }> {
  if (devToolsProcess && !devToolsProcess.killed) {
    return { ok: true, url: DEVTOOLS_URL };
  }

  try {
    const cliPath = resolveDevToolsCliPath();
    const child: any = spawn(process.execPath, [cliPath], {
      cwd: process.cwd(),
      // Force viewer to serve built UI from package dist/client.
      // In dev env it otherwise serves API only and points to localhost:5173.
      // ELECTRON_RUN_AS_NODE avoids launching a second Electron app instance
      // (extra Dock icon) when spawning from Electron.
      env: { ...process.env, NODE_ENV: "production", ELECTRON_RUN_AS_NODE: "1" },
      stdio: "ignore",
    });

    child.on("exit", (code, signal) => {
      logger.info("AI DevTools viewer exited", { code, signal });
      if (devToolsProcess === child) {
        devToolsProcess = null;
      }
    });
    child.on("error", (error) => {
      logger.error("AI DevTools viewer process error", { error });
      if (devToolsProcess === child) {
        devToolsProcess = null;
      }
    });

    devToolsProcess = child;

    const ready = await waitUntilViewerReady();
    if (!ready) {
      logger.warn("AI DevTools viewer not ready before timeout");
    }

    return { ok: true, url: DEVTOOLS_URL };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("Failed to start AI DevTools viewer", { error: message });
    devToolsProcess = null;
    return { ok: false, url: DEVTOOLS_URL, error: message };
  }
}

export function stopAiDevToolsViewer() {
  if (!devToolsProcess || devToolsProcess.killed) return;
  try {
    devToolsProcess.kill();
  } catch (error) {
    logger.error("Failed to stop AI DevTools viewer", { error });
  } finally {
    devToolsProcess = null;
  }
}
