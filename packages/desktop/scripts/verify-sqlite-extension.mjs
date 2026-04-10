#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const desktopRoot = path.resolve(__dirname, "..");
const sqliteExtensionsRoot = path.join(desktopRoot, ".runtime", "sqlite-extensions");

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

function isSimpleName(filename) {
  const stem = filename.toLowerCase().replace(/\.[^.]+$/, "");
  return stem === "simple" || stem === "libsimple";
}

function main() {
  const targetFromArg = parseTargetArg(process.argv.slice(2));
  const platformDir = (
    targetFromArg
    || String(process.env.RUNTIME_TARGET || "").trim()
    || `${process.platform}-${process.arch}`
  ).trim();
  const targetPlatform = platformDir.split("-")[0];
  if (!targetPlatform) {
    throw new Error(`Invalid target: ${platformDir}`);
  }

  const extension = targetPlatform === "darwin" ? ".dylib" : targetPlatform === "win32" ? ".dll" : ".so";
  const targetDir = path.join(sqliteExtensionsRoot, platformDir);

  if (!fs.existsSync(targetDir)) {
    throw new Error(`sqlite extension directory missing for ${platformDir}: ${targetDir}`);
  }

  const files = fs.readdirSync(targetDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name);
  const candidates = files.filter((name) => name.toLowerCase().endsWith(extension));
  const hasSimple = candidates.some(isSimpleName);

  if (!hasSimple) {
    throw new Error(
      `simple sqlite extension not found for ${platformDir}. ` +
      `Expected a file like simple${extension} or libsimple${extension} under ${targetDir}`
    );
  }

  console.log(`[sqlite-extension] verified ${platformDir}: ${candidates.join(", ")}`);
}

try {
  main();
} catch (error) {
  console.error(`[sqlite-extension] failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
