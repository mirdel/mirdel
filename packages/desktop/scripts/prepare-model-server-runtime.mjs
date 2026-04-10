#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const desktopRoot = path.resolve(__dirname, "..");
const runtimeRoot = path.join(desktopRoot, ".runtime", "model-server");
const runtimeCacheRoot = path.join(desktopRoot, ".runtime", ".cache", "model-server");

const LLAMA_CPP_REPO = "ggml-org/llama.cpp";
const LLAMA_CPP_RELEASE = "b8179";

const TARGET_ASSET_MAP = {
  "darwin-arm64": {
    assetName: `llama-${LLAMA_CPP_RELEASE}-bin-macos-arm64.tar.gz`,
    executable: "llama-server",
    archiveType: "tar.gz",
  },
  "darwin-x64": {
    assetName: `llama-${LLAMA_CPP_RELEASE}-bin-macos-x64.tar.gz`,
    executable: "llama-server",
    archiveType: "tar.gz",
  },
  "win32-x64": {
    assetName: `llama-${LLAMA_CPP_RELEASE}-bin-win-cpu-x64.zip`,
    executable: "llama-server.exe",
    archiveType: "zip",
  },
  "win32-arm64": {
    assetName: `llama-${LLAMA_CPP_RELEASE}-bin-win-cpu-arm64.zip`,
    executable: "llama-server.exe",
    archiveType: "zip",
  },
};

function runCommand(executable, args, cwd) {
  const commandPreview = `${executable} ${args.join(" ")}`;
  console.log(`[llama-runtime] running: ${commandPreview}`);

  const result = spawnSync(executable, args, {
    cwd,
    stdio: "inherit",
    env: process.env,
    shell: false,
  });

  if (result.status !== 0) {
    throw new Error(`Command failed with exit code ${result.status}: ${commandPreview}`);
  }
}

function parseCliArgs(argv) {
  const parsed = {};
  for (const arg of argv) {
    if (!arg.startsWith("--")) continue;
    const [key, value] = arg.slice(2).split("=", 2);
    if (!key) continue;
    parsed[key] = value ?? "true";
  }
  return parsed;
}

function getDefaultRuntimeTarget() {
  const platform = process.platform;
  const arch = process.arch;
  if (!["darwin", "win32"].includes(platform)) {
    throw new Error(`Unsupported platform: ${platform}`);
  }
  return `${platform}-${arch}`;
}

async function downloadFileViaFetch(url, targetPath) {
  const response = await fetch(url, {
    method: "GET",
  });

  if (!response.ok || !response.body) {
    throw new Error(`Failed to download file: HTTP ${response.status} ${response.statusText}`);
  }

  await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
  const tempPath = `${targetPath}.downloading`;
  await fs.promises.rm(tempPath, { force: true });

  const writer = fs.createWriteStream(tempPath, { flags: "w" });

  try {
    const reader = response.body.getReader();
    let downloadedBytes = 0;
    const totalBytes = Number(response.headers.get("content-length") || "0") || 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value || value.length === 0) continue;
      downloadedBytes += value.length;

      await new Promise((resolve, reject) => {
        writer.write(value, (error) => {
          if (error) reject(error);
          else resolve();
        });
      });

      if (totalBytes > 0) {
        const progress = Math.min(100, Math.round((downloadedBytes / totalBytes) * 100));
        if (progress % 10 === 0) {
          process.stdout.write(`\r[llama-runtime] download progress: ${progress}%`);
        }
      }
    }

    await new Promise((resolve, reject) => {
      writer.end((error) => {
        if (error) reject(error);
        else resolve();
      });
    });

    process.stdout.write("\n");
    await fs.promises.rename(tempPath, targetPath);
  } catch (error) {
    writer.destroy();
    await fs.promises.rm(tempPath, { force: true });
    throw error;
  }
}

async function downloadFile(url, targetPath) {
  try {
    await downloadFileViaFetch(url, targetPath);
    return;
  } catch (error) {
    console.warn(
      `[llama-runtime] fetch download failed, fallback to curl: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
  runCommand(
    "curl",
    ["-L", "-f", "--connect-timeout", "15", "--retry", "2", "-o", targetPath, url],
    desktopRoot
  );
}

function resolveDownloadUrls(assetName) {
  const releasePath = `${LLAMA_CPP_REPO}/releases/download/${LLAMA_CPP_RELEASE}/${assetName}`;
  const fromEnvRaw = String(process.env.LLAMA_RUNTIME_RELEASE_BASE_URLS || "").trim();
  const fromEnvBases = fromEnvRaw
    ? fromEnvRaw.split(",").map((item) => item.trim()).filter(Boolean)
    : [];

  const defaultBases = [
    "https://github.com",
    "https://gh-proxy.com/https://github.com",
  ];

  const uniqueBases = [...fromEnvBases, ...defaultBases].filter(
    (base, index, arr) => arr.indexOf(base) === index
  );

  return uniqueBases.map((base) => `${base.replace(/\/+$/, "")}/${releasePath}`);
}

function extractArchive(archivePath, archiveType, outputDir) {
  if (archiveType === "tar.gz") {
    runCommand("tar", ["-xzf", archivePath, "-C", outputDir, "--strip-components=1"], desktopRoot);
    return;
  }

  if (archiveType === "zip") {
    if (process.platform === "win32") {
      runCommand(
        "powershell",
        [
          "-NoProfile",
          "-Command",
          `Expand-Archive -Path '${archivePath.replace(/'/g, "''")}' -DestinationPath '${outputDir.replace(/'/g, "''")}' -Force`,
        ],
        desktopRoot
      );
      return;
    }

    runCommand("unzip", ["-oq", archivePath, "-d", outputDir], desktopRoot);
    return;
  }

  throw new Error(`Unsupported archive type: ${archiveType}`);
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2));
  const runtimeTarget = String(args.target || process.env.RUNTIME_TARGET || getDefaultRuntimeTarget()).trim();

  const assetConfig = TARGET_ASSET_MAP[runtimeTarget];
  if (!assetConfig) {
    const supported = Object.keys(TARGET_ASSET_MAP).join(", ");
    throw new Error(`Unsupported runtime target: ${runtimeTarget}. Supported: ${supported}`);
  }

  const { assetName, executable, archiveType } = assetConfig;
  const archivePath = path.join(runtimeCacheRoot, assetName);
  const targetDir = path.join(runtimeRoot, runtimeTarget);
  const executablePath = path.join(targetDir, executable);
  const downloadUrls = resolveDownloadUrls(assetName);

  console.log(`[llama-runtime] target: ${runtimeTarget}`);
  console.log(`[llama-runtime] release: ${LLAMA_CPP_RELEASE}`);
  console.log(`[llama-runtime] asset: ${assetName}`);

  await fs.promises.mkdir(runtimeCacheRoot, { recursive: true });

  if (!fs.existsSync(archivePath)) {
    let downloaded = false;
    const errors = [];
    for (const url of downloadUrls) {
      try {
        console.log(`[llama-runtime] downloading: ${url}`);
        await downloadFile(url, archivePath);
        downloaded = true;
        break;
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        errors.push(`${url} => ${reason}`);
      }
    }
    if (!downloaded) {
      throw new Error(`All runtime download URLs failed: ${errors.join(" | ")}`);
    }
    console.log(`[llama-runtime] downloaded: ${archivePath}`);
  } else {
    console.log(`[llama-runtime] using cached archive: ${archivePath}`);
  }

  await fs.promises.rm(targetDir, { recursive: true, force: true });
  await fs.promises.mkdir(targetDir, { recursive: true });

  extractArchive(archivePath, archiveType, targetDir);

  if (!fs.existsSync(executablePath)) {
    throw new Error(`llama-server binary not found after extraction: ${executablePath}`);
  }

  if (process.platform !== "win32") {
    await fs.promises.chmod(executablePath, 0o755);
  }

  const manifestPath = path.join(targetDir, "runtime.manifest.json");
  await fs.promises.writeFile(
    manifestPath,
    JSON.stringify(
      {
        repo: LLAMA_CPP_REPO,
        release: LLAMA_CPP_RELEASE,
        target: runtimeTarget,
        assetName,
        preparedAt: new Date().toISOString(),
      },
      null,
      2
    ) + "\n",
    "utf8"
  );

  console.log(`[llama-runtime] prepared: ${targetDir}`);
}

main().catch((error) => {
  console.error(`[llama-runtime] failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
