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
    const { displayName, ...spawnOptions } = opts;
    const child = spawn(cmd, args, {
      cwd: desktopDir,
      stdio: "inherit",
      shell: false,
      ...spawnOptions,
    });
    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (code === 0) resolve();
      else {
        const exitReason = signal ? `signal ${signal}` : `code ${code}`;
        reject(new Error(`${displayName || `${cmd} ${args.join(" ")}`} failed with ${exitReason}`));
      }
    });
  });
}

function getPnpmRunner() {
  const npmExecPath = process.env.npm_execpath;
  if (npmExecPath && path.basename(npmExecPath).toLowerCase().includes("pnpm")) {
    return {
      cmd: process.execPath,
      argsPrefix: [npmExecPath],
      label: `node ${npmExecPath}`,
    };
  }

  if (process.platform === "win32") {
    return {
      cmd: "cmd.exe",
      argsPrefix: ["/d", "/s", "/c", "pnpm"],
      label: "cmd.exe /d /s /c pnpm",
    };
  }

  return {
    cmd: "pnpm",
    argsPrefix: [],
    label: "pnpm",
  };
}

function runPnpm(args) {
  const runner = getPnpmRunner();
  return run(runner.cmd, [...runner.argsPrefix, ...args], {
    displayName: `pnpm ${args.join(" ")}`,
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

function hasPublishArg(args) {
  return args.some((arg) => arg === "--publish" || arg.startsWith("--publish="));
}

function getPublishMode() {
  const mode = String(process.env.ELECTRON_BUILDER_PUBLISH || "never").trim();
  return mode || "never";
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
  const publishMode = getPublishMode();

  console.log("[release] runtime target:", runtimeTarget);
  console.log("[release] node:", process.version);
  console.log("[release] NODE_OPTIONS:", process.env.NODE_OPTIONS || "(unset)");
  console.log("[release] pnpm runner:", getPnpmRunner().label);
  console.log("[release] electron-builder publish:", publishMode);
  console.log("[release] electron-builder args:", builderArgs.join(" ") || "(default from config)");

  await runPnpm(["run", "build"]);
  await runPnpm(["run", "prepare:packaged-main-chunks"]);
  await runPnpm(["run", "prepare:platform-runtime", "--", `--target=${runtimeTarget}`]);
  await runPnpm(["run", "prepare:electron-native"]);

  const finalBuilderArgs = [...builderArgs];
  if (!hasPublishArg(finalBuilderArgs)) {
    finalBuilderArgs.push("--publish", publishMode);
  }
  await runPnpm(["exec", "electron-builder", ...finalBuilderArgs]);

  await maybeCleanUnpackedApp(runtimeTarget);
}

main().catch((err) => {
  console.error("[release] failed:", err);
  process.exitCode = 1;
});
