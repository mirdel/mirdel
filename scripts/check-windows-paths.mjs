import { spawnSync } from "node:child_process";
import fs from "node:fs";

const result = spawnSync("git", ["ls-files", "-z"], {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
});

if (result.status !== 0) {
  process.stderr.write(result.stderr || "git ls-files failed\n");
  process.exit(result.status || 1);
}

const invalidChars = /[<>:"\\|?*\x00-\x1F]/;
const reservedNames = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;
const invalidPaths = [];

for (const filePath of result.stdout.split("\0").filter(Boolean)) {
  if (!fs.existsSync(filePath)) continue;

  const invalidPart = filePath.split("/").find((part) => {
    return invalidChars.test(part) || reservedNames.test(part) || /[ .]$/.test(part);
  });

  if (invalidPart) {
    invalidPaths.push(filePath);
  }
}

if (invalidPaths.length > 0) {
  console.error("Found paths that cannot be checked out on Windows:");
  for (const filePath of invalidPaths) {
    console.error(`- ${filePath}`);
  }
  process.exit(1);
}

console.log("Windows path check passed.");
