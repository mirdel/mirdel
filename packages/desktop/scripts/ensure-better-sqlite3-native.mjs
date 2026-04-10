import { spawnSync } from "node:child_process";

const checkArgs = [
  "--input-type=module",
  "-e",
  [
    "const mod = await import('better-sqlite3');",
    "const Database = mod.default;",
    "const db = new Database(':memory:');",
    "db.prepare('select 1').get();",
    "db.close();",
  ].join(" "),
];

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    stdio: "inherit",
    ...options,
  });
}

function canLoadBetterSqlite3() {
  const result = spawnSync(process.execPath, checkArgs, {
    stdio: "ignore",
  });
  return result.status === 0;
}

if (!canLoadBetterSqlite3()) {
  const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const rebuild = run(pnpmCommand, ["rebuild", "better-sqlite3"]);
  if (rebuild.status !== 0) {
    process.exit(rebuild.status ?? 1);
  }
}

if (!canLoadBetterSqlite3()) {
  console.error("better-sqlite3 is still unavailable for the current Node runtime after rebuild.");
  process.exit(1);
}
