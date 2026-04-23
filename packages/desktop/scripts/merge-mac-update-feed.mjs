import fs from "node:fs/promises";
import path from "node:path";

function readArg(name) {
  const prefix = `--${name}=`;
  const arg = process.argv.slice(2).find((value) => value.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : "";
}

function requireArg(name) {
  const value = readArg(name).trim();
  if (!value) {
    throw new Error(`--${name}=... is required`);
  }
  return value;
}

function parseScalar(value) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  if (/^\d+$/.test(trimmed)) {
    return Number(trimmed);
  }
  return trimmed;
}

function parseFileEntries(lines) {
  const filesIndex = lines.findIndex((line) => /^files:\s*$/.test(line));
  if (filesIndex === -1) {
    throw new Error("latest-mac.yml is missing files");
  }

  const files = [];
  let current = null;

  for (const line of lines.slice(filesIndex + 1)) {
    if (/^\S/.test(line)) break;

    const itemMatch = line.match(/^\s*-\s+([A-Za-z0-9_-]+):\s*(.*?)\s*$/);
    if (itemMatch) {
      current = { [itemMatch[1]]: parseScalar(itemMatch[2]) };
      files.push(current);
      continue;
    }

    const propMatch = line.match(/^\s+([A-Za-z0-9_-]+):\s*(.*?)\s*$/);
    if (propMatch && current) {
      current[propMatch[1]] = parseScalar(propMatch[2]);
    }
  }

  if (files.length === 0) {
    throw new Error("latest-mac.yml has no file entries");
  }

  return files;
}

function parseTopLevel(lines) {
  const topLevel = {};
  for (const line of lines) {
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*?)\s*$/);
    if (!match || match[1] === "files") continue;
    topLevel[match[1]] = parseScalar(match[2]);
  }
  return topLevel;
}

async function parseUpdateInfo(filePath) {
  const text = await fs.readFile(filePath, "utf8");
  const lines = text.split(/\r?\n/);
  return {
    topLevel: parseTopLevel(lines),
    files: parseFileEntries(lines),
  };
}

function findZipFile(info, arch) {
  const file = info.files.find((entry) => {
    const url = String(entry.url || entry.path || "");
    return url.endsWith(".zip") && url.includes(arch);
  });

  if (!file) {
    throw new Error(`Unable to find mac ${arch} zip entry`);
  }

  return file;
}

function stringifyScalar(value) {
  if (typeof value === "number") return String(value);
  if (/^[A-Za-z0-9._/@:+-]+$/.test(String(value))) return String(value);
  return JSON.stringify(String(value));
}

function stringifyFile(file) {
  const lines = [`  - url: ${stringifyScalar(file.url)}`];
  for (const [key, value] of Object.entries(file)) {
    if (key === "url") continue;
    lines.push(`    ${key}: ${stringifyScalar(value)}`);
  }
  return lines.join("\n");
}

function buildMergedUpdateInfo(arm64Info, x64Info) {
  const arm64File = findZipFile(arm64Info, "arm64");
  const x64File = findZipFile(x64Info, "x64");
  const releaseDate = arm64Info.topLevel.releaseDate || x64Info.topLevel.releaseDate;

  if (arm64Info.topLevel.version !== x64Info.topLevel.version) {
    throw new Error(`Version mismatch: ${arm64Info.topLevel.version} !== ${x64Info.topLevel.version}`);
  }

  return [
    `version: ${stringifyScalar(arm64Info.topLevel.version)}`,
    "files:",
    stringifyFile(arm64File),
    stringifyFile(x64File),
    `path: ${stringifyScalar(arm64File.url)}`,
    `sha512: ${stringifyScalar(arm64File.sha512)}`,
    releaseDate ? `releaseDate: ${stringifyScalar(releaseDate)}` : "",
    "",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

async function main() {
  const arm64Path = requireArg("arm64");
  const x64Path = requireArg("x64");
  const outputPath = requireArg("output");
  const [arm64Info, x64Info] = await Promise.all([parseUpdateInfo(arm64Path), parseUpdateInfo(x64Path)]);
  const merged = buildMergedUpdateInfo(arm64Info, x64Info);

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, merged);
  console.log(`[mac-update-feed] wrote ${outputPath}`);
}

main().catch((err) => {
  console.error("[mac-update-feed] failed:", err);
  process.exitCode = 1;
});
