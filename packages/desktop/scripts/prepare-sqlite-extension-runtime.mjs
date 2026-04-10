#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const desktopRoot = path.resolve(__dirname, "..");
const sqliteExtensionsRoot = path.join(desktopRoot, ".runtime", "sqlite-extensions");
const sqliteExtensionsCacheRoot = path.join(desktopRoot, ".runtime", ".cache", "sqlite-extensions");

const SIMPLE_REPO = "wangfenjin/simple";
const SIMPLE_RELEASE = "v0.7.1";

const TARGET_ASSET_MAP = {
  "darwin-arm64": {
    assetName: "libsimple-osx-arm64.zip",
    sha256: "b699f0fca1e7d1f8776d067708ecf4d0bcc2d765e4b643862e129058583b885f",
    libraryCandidates: ["libsimple.dylib", "simple.dylib"],
  },
  "darwin-x64": {
    assetName: "libsimple-osx-x64.zip",
    sha256: "d6f7e9fc9dac3c2bcfb5389618d41f2f0db6ea5a83dd8b9a363cf9b02fa20f95",
    libraryCandidates: ["libsimple.dylib", "simple.dylib"],
  },
  "win32-arm64": {
    assetName: "libsimple-windows-arm64.zip",
    sha256: "520c33aae3fab35cba963927d04f041f971eee71f01fa577fb1d51e171780687",
    libraryCandidates: ["simple.dll", "libsimple.dll"],
  },
  "win32-x64": {
    assetName: "libsimple-windows-x64.zip",
    sha256: "7f03cc28cf307721f5621b5a52ef3bcb26c5215de012b09900492eb34d5bed0b",
    libraryCandidates: ["simple.dll", "libsimple.dll"],
  },
};

function runCommand(executable, args, cwd) {
  const commandPreview = `${executable} ${args.join(" ")}`;
  console.log(`[sqlite-extension] running: ${commandPreview}`);

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
  const response = await fetch(url, { method: "GET" });
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
          process.stdout.write(`\r[sqlite-extension] download progress: ${progress}%`);
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
      `[sqlite-extension] fetch download failed, fallback to curl: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
  runCommand(
    "curl",
    ["-L", "-f", "--connect-timeout", "15", "--retry", "2", "-o", targetPath, url],
    desktopRoot
  );
}

async function sha256File(filePath) {
  return await new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

function resolveDownloadUrls(assetName) {
  const encodedName = encodeURIComponent(assetName);
  const releasePath = `${SIMPLE_REPO}/releases/download/${SIMPLE_RELEASE}/${encodedName}`;
  const fromEnvRaw = String(process.env.SQLITE_SIMPLE_RELEASE_BASE_URLS || "").trim();
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

function extractArchive(archivePath, outputDir) {
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
}

function readManifest(manifestPath) {
  try {
    const raw = fs.readFileSync(manifestPath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function hasSimpleLibraryAtTopLevel(targetDir, libraryCandidates) {
  const normalizedCandidates = libraryCandidates.map((item) => item.toLowerCase());
  try {
    const entries = fs.readdirSync(targetDir, { withFileTypes: true });
    return entries.some(
      (entry) => entry.isFile() && normalizedCandidates.includes(entry.name.toLowerCase())
    );
  } catch {
    return false;
  }
}

function findLibraryRecursive(rootDir, libraryCandidates) {
  const normalizedCandidates = new Set(libraryCandidates.map((item) => item.toLowerCase()));
  const stack = [rootDir];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const nextPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(nextPath);
        continue;
      }
      if (!entry.isFile()) continue;
      if (normalizedCandidates.has(entry.name.toLowerCase())) {
        return nextPath;
      }
    }
  }

  return "";
}

function resolveSourceRoot(extractRoot, libraryPath) {
  let current = path.dirname(libraryPath);

  while (true) {
    if (fs.existsSync(path.join(current, "dict"))) {
      return current;
    }
    if (current === extractRoot) {
      return current;
    }
    const parent = path.dirname(current);
    if (!parent || parent === current || !parent.startsWith(extractRoot)) {
      return path.dirname(libraryPath);
    }
    current = parent;
  }
}

async function ensureArchive(archivePath, downloadUrls, expectedSha256) {
  if (fs.existsSync(archivePath)) {
    const actual = await sha256File(archivePath);
    if (actual.toLowerCase() === expectedSha256.toLowerCase()) {
      console.log(`[sqlite-extension] using cached archive: ${archivePath}`);
      return;
    }
    console.warn(
      `[sqlite-extension] cached archive hash mismatch, redownload: expected=${expectedSha256} actual=${actual}`
    );
    await fs.promises.rm(archivePath, { force: true });
  }

  const errors = [];
  for (const url of downloadUrls) {
    try {
      console.log(`[sqlite-extension] downloading: ${url}`);
      await downloadFile(url, archivePath);
      const actual = await sha256File(archivePath);
      if (actual.toLowerCase() !== expectedSha256.toLowerCase()) {
        throw new Error(`SHA256 mismatch: expected=${expectedSha256} actual=${actual}`);
      }
      console.log(`[sqlite-extension] downloaded: ${archivePath}`);
      return;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      errors.push(`${url} => ${reason}`);
      await fs.promises.rm(archivePath, { force: true });
    }
  }

  throw new Error(`All extension download URLs failed: ${errors.join(" | ")}`);
}

async function copyDirectoryContents(fromDir, toDir) {
  await fs.promises.mkdir(toDir, { recursive: true });
  const entries = await fs.promises.readdir(fromDir, { withFileTypes: true });
  for (const entry of entries) {
    const src = path.join(fromDir, entry.name);
    const dst = path.join(toDir, entry.name);
    await fs.promises.cp(src, dst, { recursive: true, force: true });
  }
}

async function promoteLibraryToTopLevel(targetDir, libraryCandidates) {
  if (hasSimpleLibraryAtTopLevel(targetDir, libraryCandidates)) {
    return;
  }

  const found = findLibraryRecursive(targetDir, libraryCandidates);
  if (!found) return;

  const destination = path.join(targetDir, path.basename(found));
  await fs.promises.copyFile(found, destination);
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2));
  const runtimeTarget = String(args.target || process.env.RUNTIME_TARGET || getDefaultRuntimeTarget()).trim();
  const assetConfig = TARGET_ASSET_MAP[runtimeTarget];
  if (!assetConfig) {
    const supported = Object.keys(TARGET_ASSET_MAP).join(", ");
    throw new Error(`Unsupported runtime target: ${runtimeTarget}. Supported: ${supported}`);
  }

  const { assetName, sha256, libraryCandidates } = assetConfig;
  const archivePath = path.join(sqliteExtensionsCacheRoot, assetName);
  const targetDir = path.join(sqliteExtensionsRoot, runtimeTarget);
  const manifestPath = path.join(sqliteExtensionsCacheRoot, `${runtimeTarget}.manifest.json`);
  const downloadUrls = resolveDownloadUrls(assetName);

  console.log(`[sqlite-extension] target: ${runtimeTarget}`);
  console.log(`[sqlite-extension] release: ${SIMPLE_RELEASE}`);
  console.log(`[sqlite-extension] asset: ${assetName}`);

  const manifest = readManifest(manifestPath);
  if (
    manifest
    && manifest.repo === SIMPLE_REPO
    && manifest.release === SIMPLE_RELEASE
    && manifest.assetName === assetName
    && manifest.sha256 === sha256
    && hasSimpleLibraryAtTopLevel(targetDir, libraryCandidates)
  ) {
    console.log(`[sqlite-extension] already prepared: ${targetDir}`);
    return;
  }

  await fs.promises.mkdir(sqliteExtensionsCacheRoot, { recursive: true });
  await ensureArchive(archivePath, downloadUrls, sha256);

  const extractRoot = path.join(sqliteExtensionsCacheRoot, `.extract-${runtimeTarget}-${Date.now()}`);
  await fs.promises.rm(extractRoot, { recursive: true, force: true });
  await fs.promises.mkdir(extractRoot, { recursive: true });

  try {
    extractArchive(archivePath, extractRoot);

    const libraryPath = findLibraryRecursive(extractRoot, libraryCandidates);
    if (!libraryPath) {
      throw new Error(`Simple extension library not found in extracted archive: ${archivePath}`);
    }

    const sourceRoot = resolveSourceRoot(extractRoot, libraryPath);
    await fs.promises.rm(targetDir, { recursive: true, force: true });
    await fs.promises.mkdir(targetDir, { recursive: true });
    await copyDirectoryContents(sourceRoot, targetDir);
    await promoteLibraryToTopLevel(targetDir, libraryCandidates);

    if (!hasSimpleLibraryAtTopLevel(targetDir, libraryCandidates)) {
      throw new Error(`Simple extension library not found at target root: ${targetDir}`);
    }

    await fs.promises.writeFile(
      manifestPath,
      JSON.stringify(
        {
          repo: SIMPLE_REPO,
          release: SIMPLE_RELEASE,
          target: runtimeTarget,
          assetName,
          sha256,
          preparedAt: new Date().toISOString(),
        },
        null,
        2
      ) + "\n",
      "utf8"
    );
  } finally {
    await fs.promises.rm(extractRoot, { recursive: true, force: true });
  }

  console.log(`[sqlite-extension] prepared: ${targetDir}`);
}

main().catch((error) => {
  console.error(`[sqlite-extension] failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
