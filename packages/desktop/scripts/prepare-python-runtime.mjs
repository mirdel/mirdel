#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as tar from "tar";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const desktopRoot = path.resolve(__dirname, "..");
const pythonRuntimeRoot = path.join(desktopRoot, ".runtime", "python");
const pythonRuntimeCacheRoot = path.join(desktopRoot, ".runtime", ".cache", "python");

const PYTHON_BUILD_STANDALONE_REPO = "astral-sh/python-build-standalone";
const PYTHON_BUILD_STANDALONE_RELEASE = "20260325";

const TARGET_ASSET_MAP = {
  "darwin-arm64": {
    assetName: "cpython-3.12.13+20260325-aarch64-apple-darwin-install_only.tar.gz",
    sha256: "49c04654deeb63e1034512b0695435e6f188d92869270350a6f9613c7bbafdc1",
    executableRelPath: path.join("bin", "python3"),
  },
  "darwin-x64": {
    assetName: "cpython-3.12.13+20260325-x86_64-apple-darwin-install_only.tar.gz",
    sha256: "ec15b979a43415e6e230714e91a8895d2ecf68e13e0f83d2fa3855740308cfa7",
    executableRelPath: path.join("bin", "python3"),
  },
  "win32-arm64": {
    assetName: "cpython-3.12.13+20260325-aarch64-pc-windows-msvc-install_only.tar.gz",
    sha256: "898d04f26d903b134c566c1223dd65f3eec41a666ba18050fcbe7ec50db4bced",
    executableRelPath: "python.exe",
  },
  "win32-x64": {
    assetName: "cpython-3.12.13+20260325-x86_64-pc-windows-msvc-install_only.tar.gz",
    sha256: "aaee8e72c20e1a266bbc6b0dcd640679d1aa1ea4257725af336b5ce9e492891b",
    executableRelPath: "python.exe",
  },
};

function runCommand(executable, args, cwd) {
  const commandPreview = `${executable} ${args.join(" ")}`;
  console.log(`[python-runtime] running: ${commandPreview}`);

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
          process.stdout.write(`\r[python-runtime] download progress: ${progress}%`);
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
      `[python-runtime] fetch download failed, fallback to curl: ${error instanceof Error ? error.message : String(error)}`
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
  const releasePath = `${PYTHON_BUILD_STANDALONE_REPO}/releases/download/${PYTHON_BUILD_STANDALONE_RELEASE}/${encodedName}`;
  const fromEnvRaw = String(process.env.PYTHON_RUNTIME_RELEASE_BASE_URLS || "").trim();
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

function normalizeSeparators(value) {
  return value.replace(/\\/g, "/");
}

function findInstallRoot(extractRoot, executableRelPath) {
  const normalizedRel = normalizeSeparators(executableRelPath);
  const expectedSuffix = `/${normalizedRel}`;
  const stack = [extractRoot];

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
      if (!entry.isFile() && !entry.isSymbolicLink()) continue;

      const normalizedCandidate = normalizeSeparators(nextPath);
      if (!normalizedCandidate.endsWith(expectedSuffix)) continue;
      return nextPath.slice(0, -executableRelPath.length);
    }
  }

  return "";
}

async function extractTarGz(archivePath, outputDir) {
  console.log(`[python-runtime] extracting: ${archivePath}`);
  await tar.x({
    file: archivePath,
    cwd: outputDir,
  });
}

function readManifest(manifestPath) {
  try {
    const raw = fs.readFileSync(manifestPath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function hasExecutable(targetDir, executableRelPath) {
  return fs.existsSync(path.join(targetDir, executableRelPath));
}

async function ensureArchive(archivePath, downloadUrls, expectedSha256) {
  if (fs.existsSync(archivePath)) {
    const actual = await sha256File(archivePath);
    if (actual.toLowerCase() === expectedSha256.toLowerCase()) {
      console.log(`[python-runtime] using cached archive: ${archivePath}`);
      return;
    }
    console.warn(
      `[python-runtime] cached archive hash mismatch, redownload: expected=${expectedSha256} actual=${actual}`
    );
    await fs.promises.rm(archivePath, { force: true });
  }

  const errors = [];
  for (const url of downloadUrls) {
    try {
      console.log(`[python-runtime] downloading: ${url}`);
      await downloadFile(url, archivePath);
      const actual = await sha256File(archivePath);
      if (actual.toLowerCase() !== expectedSha256.toLowerCase()) {
        throw new Error(`SHA256 mismatch: expected=${expectedSha256} actual=${actual}`);
      }
      console.log(`[python-runtime] downloaded: ${archivePath}`);
      return;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      errors.push(`${url} => ${reason}`);
      await fs.promises.rm(archivePath, { force: true });
    }
  }

  throw new Error(`All runtime download URLs failed: ${errors.join(" | ")}`);
}

async function copyDirectoryContents(fromDir, toDir) {
  await fs.promises.mkdir(toDir, { recursive: true });
  const entries = await fs.promises.readdir(fromDir, { withFileTypes: true });
  for (const entry of entries) {
    const src = path.join(fromDir, entry.name);
    const dst = path.join(toDir, entry.name);
    // python-build-standalone archives may contain absolute symlinks into the
    // extract directory; dereference to keep runtime self-contained after cleanup.
    await fs.promises.cp(src, dst, { recursive: true, force: true, dereference: true });
  }
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2));
  const runtimeTarget = String(args.target || process.env.RUNTIME_TARGET || getDefaultRuntimeTarget()).trim();
  const assetConfig = TARGET_ASSET_MAP[runtimeTarget];
  if (!assetConfig) {
    const supported = Object.keys(TARGET_ASSET_MAP).join(", ");
    throw new Error(`Unsupported runtime target: ${runtimeTarget}. Supported: ${supported}`);
  }

  const { assetName, sha256, executableRelPath } = assetConfig;
  const archivePath = path.join(pythonRuntimeCacheRoot, assetName);
  const targetDir = path.join(pythonRuntimeRoot, runtimeTarget);
  const executablePath = path.join(targetDir, executableRelPath);
  const manifestPath = path.join(pythonRuntimeCacheRoot, `${runtimeTarget}.manifest.json`);
  const downloadUrls = resolveDownloadUrls(assetName);

  console.log(`[python-runtime] target: ${runtimeTarget}`);
  console.log(`[python-runtime] release: ${PYTHON_BUILD_STANDALONE_RELEASE}`);
  console.log(`[python-runtime] asset: ${assetName}`);

  const manifest = readManifest(manifestPath);
  if (
    manifest
    && manifest.repo === PYTHON_BUILD_STANDALONE_REPO
    && manifest.release === PYTHON_BUILD_STANDALONE_RELEASE
    && manifest.assetName === assetName
    && manifest.sha256 === sha256
    && hasExecutable(targetDir, executableRelPath)
  ) {
    console.log(`[python-runtime] already prepared: ${targetDir}`);
    return;
  }

  await fs.promises.mkdir(pythonRuntimeCacheRoot, { recursive: true });
  await ensureArchive(archivePath, downloadUrls, sha256);

  const extractRoot = path.join(pythonRuntimeCacheRoot, `.extract-${runtimeTarget}-${Date.now()}`);
  await fs.promises.rm(extractRoot, { recursive: true, force: true });
  await fs.promises.mkdir(extractRoot, { recursive: true });

  try {
    await extractTarGz(archivePath, extractRoot);
    const installRoot = findInstallRoot(extractRoot, executableRelPath);
    if (!installRoot) {
      throw new Error(`Unable to resolve install root from extracted archive: ${archivePath}`);
    }

    await fs.promises.rm(targetDir, { recursive: true, force: true });
    await fs.promises.mkdir(targetDir, { recursive: true });
    await copyDirectoryContents(installRoot, targetDir);

    if (!fs.existsSync(executablePath)) {
      throw new Error(`Python executable not found after extraction: ${executablePath}`);
    }

    if (!runtimeTarget.startsWith("win32-")) {
      await fs.promises.chmod(executablePath, 0o755);
    }

    await fs.promises.writeFile(
      manifestPath,
      JSON.stringify(
        {
          repo: PYTHON_BUILD_STANDALONE_REPO,
          release: PYTHON_BUILD_STANDALONE_RELEASE,
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

  console.log(`[python-runtime] prepared: ${targetDir}`);
}

main().catch((error) => {
  console.error(`[python-runtime] failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
