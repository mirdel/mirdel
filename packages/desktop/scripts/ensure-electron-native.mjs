/**
 * Ensure better-sqlite3 native binary matches Electron's ABI.
 *
 * Strategy:
 *   1. Spawn Electron in ELECTRON_RUN_AS_NODE mode and try to require('better-sqlite3').
 *   2. If it loads → ABI already matches, exit fast (<200 ms).
 *   3. If it fails → run `electron-rebuild -f -w better-sqlite3` to force-rebuild.
 *   4. Probe again to confirm.
 */

import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const electronPath = require("electron");

const MODULES_TO_REBUILD = "better-sqlite3";

const probeCode = [
  "try {",
  "  const Database = require('better-sqlite3');",
  "  const db = new Database(':memory:');",
  "  db.prepare('SELECT 1').get();",
  "  db.close();",
  "  process.exit(0);",
  "} catch (e) {",
  "  process.stderr.write(e.message);",
  "  process.exit(1);",
  "}",
].join(" ");

function canElectronLoad() {
  const result = spawnSync(electronPath, ["-e", probeCode], {
    stdio: ["ignore", "ignore", "pipe"],
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
  });
  return {
    ok: result.status === 0,
    stderr: result.stderr?.toString().trim() || "",
  };
}

function rebuild() {
  console.log(`[electron-native] rebuilding ${MODULES_TO_REBUILD} for Electron...`);
  const pnpmCmd = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const result = spawnSync(pnpmCmd, ["exec", "electron-rebuild", "-f", "-w", MODULES_TO_REBUILD], {
    stdio: "inherit",
    cwd: process.cwd(),
  });
  if (result.status !== 0) {
    console.error("[electron-native] rebuild failed");
    process.exit(result.status ?? 1);
  }
}

const check1 = canElectronLoad();
if (check1.ok) {
  console.log("[electron-native] better-sqlite3 OK (ABI matches Electron)");
  process.exit(0);
}

console.log("[electron-native] ABI mismatch detected:", check1.stderr.split("\n")[0]);
rebuild();

const check2 = canElectronLoad();
if (!check2.ok) {
  console.error("[electron-native] still broken after rebuild:", check2.stderr);
  process.exit(1);
}

console.log("[electron-native] better-sqlite3 OK after rebuild");
