import fs from "node:fs";
import path from "node:path";
import { app } from "electron";

export function getPythonRuntimeEnv(
  baseEnv: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env
): Record<string, string> {
  const pycacheRoot = path.join(app.getPath("userData"), "python-cache", "pycache");
  fs.mkdirSync(pycacheRoot, { recursive: true });

  return {
    ...baseEnv,
    PYTHONUTF8: "1",
    PYTHONDONTWRITEBYTECODE: "1",
    PYTHONPYCACHEPREFIX: pycacheRoot,
  } as Record<string, string>;
}
