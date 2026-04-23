import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const desktopDir = path.resolve(__dirname, "..");
const repoRoot = path.resolve(desktopDir, "../..");
const outputDir = path.join(desktopDir, ".pack-resources", "release-notes");

const files = [
  { source: "CHANGELOG.md", target: "CHANGELOG.md" },
  { source: "CHANGELOG.zh-CN.md", target: "CHANGELOG.zh-CN.md" },
];

async function copyIfExists(sourceName, targetName) {
  const sourcePath = path.join(repoRoot, sourceName);
  const targetPath = path.join(outputDir, targetName);
  try {
    await fs.copyFile(sourcePath, targetPath);
    console.log(`[release-metadata] copied ${sourcePath} -> ${targetPath}`);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    if (sourceName !== "CHANGELOG.zh-CN.md") throw error;
    await fs.copyFile(path.join(repoRoot, "CHANGELOG.md"), targetPath);
    console.log(`[release-metadata] copied fallback CHANGELOG.md -> ${targetPath}`);
  }
}

async function main() {
  await fs.rm(outputDir, { recursive: true, force: true });
  await fs.mkdir(outputDir, { recursive: true });
  await Promise.all(files.map((file) => copyIfExists(file.source, file.target)));
}

main().catch((error) => {
  console.error("[release-metadata] failed:", error);
  process.exitCode = 1;
});
