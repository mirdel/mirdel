import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const desktopDir = path.resolve(__dirname, "..");
const releaseDir = path.join(desktopDir, "release");

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: desktopDir,
      stdio: "inherit",
      shell: false,
      ...opts,
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(" ")} failed with code ${code}`));
    });
  });
}

function getDefaultRuntimeTarget() {
  const platform = process.platform;
  const arch = process.arch;
  if (!["darwin", "win32"].includes(platform)) {
    throw new Error(`Unsupported platform: ${platform}`);
  }
  return `${platform}-${arch}`;
}

function parseArgs(raw) {
  return raw
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

async function maybeCleanUnpackedApp(runtimeTarget) {
  if (process.env.CLEAN_UNPACKED_APP !== "true") return;
  if (!runtimeTarget.startsWith("darwin-")) return;
  const arch = runtimeTarget.split("-")[1];
  const unpackedDir = path.join(releaseDir, `mac-${arch}`);
  await fs.rm(unpackedDir, { recursive: true, force: true });
  console.log(`[release] cleaned unpacked app dir: ${unpackedDir}`);
}

async function main() {
  const runtimeTarget = (process.env.RUNTIME_TARGET || getDefaultRuntimeTarget()).trim();
  const rawBuilderArgs = (process.env.ELECTRON_BUILDER_ARGS || "").trim();
  const builderArgs = parseArgs(rawBuilderArgs);

  console.log("[release] runtime target:", runtimeTarget);
  console.log("[release] electron-builder args:", builderArgs.join(" ") || "(default from config)");

  await run("pnpm", ["run", "build"]);
  await run("pnpm", ["run", "prepare:packaged-main-chunks"]);
  await run("pnpm", ["run", "prepare:platform-runtime", "--", `--target=${runtimeTarget}`]);
  await run("pnpm", ["run", "prepare:electron-native"]);

  const finalBuilderArgs = [...builderArgs];
  if (!finalBuilderArgs.includes("--publish")) {
    finalBuilderArgs.push("--publish", "never");
  }
  await run("pnpm", ["exec", "electron-builder", ...finalBuilderArgs]);

  await maybeCleanUnpackedApp(runtimeTarget);
}

main().catch((err) => {
  console.error("[release] failed:", err);
  process.exitCode = 1;
});
