#!/usr/bin/env node

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const desktopRoot = path.resolve(__dirname, "..");

function getDefaultRuntimeTarget() {
  const platform = process.platform;
  const arch = process.arch;
  if (!["darwin", "win32"].includes(platform)) {
    throw new Error(`Unsupported platform: ${platform}`);
  }
  return `${platform}-${arch}`;
}

function parseTargetArg(argv) {
  for (let i = 0; i < argv.length; i += 1) {
    const raw = String(argv[i] || "");
    if (raw === "--") continue;
    if (raw.startsWith("--target=")) return raw.slice("--target=".length).trim();
    if (raw === "--target") {
      const next = String(argv[i + 1] || "").trim();
      if (!next) throw new Error("Missing value for --target");
      return next;
    }
  }
  return "";
}

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: desktopRoot,
      stdio: "inherit",
      shell: false,
      env: process.env,
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(" ")} failed with code ${code}`));
    });
  });
}

async function main() {
  const targetFromArg = parseTargetArg(process.argv.slice(2));
  const runtimeTarget = (
    targetFromArg
    || String(process.env.RUNTIME_TARGET || "").trim()
    || getDefaultRuntimeTarget()
  ).trim();

  if (!runtimeTarget) {
    throw new Error("runtime target is required");
  }

  console.log("[platform-runtime] target:", runtimeTarget);

  await run(process.execPath, ["./scripts/prepare-model-server-runtime.mjs", `--target=${runtimeTarget}`]);
  await run(process.execPath, ["./scripts/prepare-python-runtime.mjs", `--target=${runtimeTarget}`]);
  await run(process.execPath, ["./scripts/prepare-sqlite-extension-runtime.mjs", `--target=${runtimeTarget}`]);
  await run(process.execPath, ["./scripts/prepare-esbuild-runtime.mjs", `--target=${runtimeTarget}`]);
  await run(process.execPath, ["./scripts/install-searxng-python-deps.mjs", `--target=${runtimeTarget}`]);
  await run(process.execPath, ["./scripts/verify-sqlite-extension.mjs", `--target=${runtimeTarget}`]);

  console.log("[platform-runtime] ready");
}

main().catch((error) => {
  console.error(`[platform-runtime] failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
