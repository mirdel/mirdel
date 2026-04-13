import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const desktopDir = path.resolve(__dirname, "..");
const sourceDir = path.join(desktopDir, "dist", "main", "chunks");
const targetDir = path.join(desktopDir, ".pack-resources", "chunks");

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  await fs.rm(targetDir, { recursive: true, force: true });

  if (!(await pathExists(sourceDir))) {
    console.log(`[prepare:packaged-main-chunks] source missing, skipped: ${sourceDir}`);
    return;
  }

  await fs.mkdir(path.dirname(targetDir), { recursive: true });
  await fs.cp(sourceDir, targetDir, { recursive: true });
  console.log(`[prepare:packaged-main-chunks] copied ${sourceDir} -> ${targetDir}`);
}

main().catch((error) => {
  console.error("[prepare:packaged-main-chunks] failed:", error);
  process.exitCode = 1;
});
