import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach } from "vitest";
import { closeDb, initDb, resetDbForTests, setDbPathForTests } from "../../src/main/services/db";

export type TestDbHandle = {
  dir: string;
  dbPath: string;
};

export type TestDbScope = {
  current: () => TestDbHandle;
  recreate: (name?: string) => TestDbHandle;
};

function sanitizeName(value: string) {
  return value.replace(/[^a-z0-9_-]+/gi, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "test";
}

export function setupTestDb(name: string): TestDbHandle {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `ai-client-x-${sanitizeName(name)}-`));
  const dbPath = path.join(dir, "app.test.sqlite");

  setDbPathForTests(dbPath);
  resetDbForTests({ removeFiles: true });
  initDb();

  return { dir, dbPath };
}

export function teardownTestDb(handle: TestDbHandle | null | undefined) {
  closeDb();
  setDbPathForTests(null);
  if (handle?.dir) {
    fs.rmSync(handle.dir, { recursive: true, force: true });
  }
}

export function useTestDb(name: string): TestDbScope {
  let handle: TestDbHandle | null = null;

  beforeEach(() => {
    handle = setupTestDb(name);
  });

  afterEach(() => {
    teardownTestDb(handle);
    handle = null;
  });

  return {
    current() {
      if (!handle) {
        throw new Error(`Test DB for "${name}" has not been initialized`);
      }
      return handle;
    },
    recreate(nextName = name) {
      teardownTestDb(handle);
      handle = setupTestDb(nextName);
      return handle;
    },
  };
}
