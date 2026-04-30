import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { vi } from "vitest";

const defaultUserDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-client-x-vitest-user-data-"));

process.env.AI_CLIENT_X_TEST_USER_DATA_DIR ||= defaultUserDataDir;
(process as any).resourcesPath ||= process.cwd();

vi.mock("electron", () => {
  const userDataDir = process.env.AI_CLIENT_X_TEST_USER_DATA_DIR || defaultUserDataDir;

  return {
    app: {
      isPackaged: false,
      getPath: vi.fn(() => userDataDir),
      getAppPath: vi.fn(() => process.cwd()),
      getVersion: vi.fn(() => "0.0.0-test"),
    },
    BrowserWindow: {
      fromWebContents: vi.fn(),
    },
    dialog: {},
    screen: {},
    shell: {},
  };
});
