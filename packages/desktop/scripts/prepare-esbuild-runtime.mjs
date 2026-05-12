#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);
const desktopRoot = path.resolve(__dirname, "..");
const runtimeRoot = path.join(desktopRoot, ".runtime", "esbuild");

const TARGET_PACKAGE_MAP = {
  "darwin-arm64": {
    packageName: "@esbuild/darwin-arm64",
    executableRelPath: path.join("bin", "esbuild"),
    outputName: "esbuild",
  },
  "darwin-x64": {
    packageName: "@esbuild/darwin-x64",
    executableRelPath: path.join("bin", "esbuild"),
    outputName: "esbuild",
  },
  "win32-x64": {
    packageName: "@esbuild/win32-x64",
    executableRelPath: "esbuild.exe",
    outputName: "esbuild.exe",
  },
  "win32-arm64": {
    packageName: "@esbuild/win32-arm64",
    executableRelPath: "esbuild.exe",
    outputName: "esbuild.exe",
  },
};

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

function resolvePackageJson(packageName) {
  const esbuildPackageJsonPath = require.resolve("esbuild/package.json", {
    paths: [desktopRoot],
  });
  const esbuildPackageDir = path.dirname(esbuildPackageJsonPath);
  return require.resolve(`${packageName}/package.json`, {
    paths: [esbuildPackageDir],
  });
}

async function copyEsbuildBinary(sourcePath, targetPath) {
  await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.promises.copyFile(sourcePath, targetPath);
  if (process.platform !== "win32") {
    await fs.promises.chmod(targetPath, 0o755);
  }
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2));
  const runtimeTarget = String(args.target || process.env.RUNTIME_TARGET || getDefaultRuntimeTarget()).trim();
  const targetConfig = TARGET_PACKAGE_MAP[runtimeTarget];
  if (!targetConfig) {
    const supported = Object.keys(TARGET_PACKAGE_MAP).join(", ");
    throw new Error(`Unsupported esbuild runtime target: ${runtimeTarget}. Supported: ${supported}`);
  }

  const { packageName, executableRelPath, outputName } = targetConfig;
  const packageJsonPath = resolvePackageJson(packageName);
  const packageDir = path.dirname(packageJsonPath);
  const sourcePath = path.join(packageDir, executableRelPath);
  const targetDir = path.join(runtimeRoot, runtimeTarget);
  const targetPath = path.join(targetDir, outputName);

  console.log(`[esbuild-runtime] target: ${runtimeTarget}`);
  console.log(`[esbuild-runtime] package: ${packageName}`);

  if (!fs.existsSync(sourcePath)) {
    throw new Error(`esbuild binary not found: ${sourcePath}`);
  }

  await fs.promises.rm(targetDir, { recursive: true, force: true });
  await copyEsbuildBinary(sourcePath, targetPath);

  const packageJson = JSON.parse(await fs.promises.readFile(packageJsonPath, "utf8"));
  const manifestPath = path.join(targetDir, "runtime.manifest.json");
  await fs.promises.writeFile(
    manifestPath,
    JSON.stringify(
      {
        packageName,
        version: packageJson.version,
        target: runtimeTarget,
        executable: outputName,
        preparedAt: new Date().toISOString(),
      },
      null,
      2
    ) + "\n",
    "utf8"
  );

  console.log(`[esbuild-runtime] prepared: ${targetDir}`);
}

main().catch((error) => {
  console.error(`[esbuild-runtime] failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
