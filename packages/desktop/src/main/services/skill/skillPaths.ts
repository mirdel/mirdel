import path from "node:path";
import fs from "node:fs";
import { app } from "electron";

const SKILLS_DIR_NAME = "skills";
const SYSTEM_DIR = ".system";
const PUBLIC_DIR = "public";

/**
 * 用户目录下的技能根路径：{userData}/skills
 */
export function getSkillsRoot(): string {
  return path.join(app.getPath("userData"), SKILLS_DIR_NAME);
}

/**
 * 内置技能在用户目录下的路径：{userData}/skills/.system
 */
export function getSystemSkillsPath(): string {
  return path.join(getSkillsRoot(), SYSTEM_DIR);
}

/**
 * 用户安装技能路径：{userData}/skills/public
 */
export function getPublicSkillsPath(): string {
  return path.join(getSkillsRoot(), PUBLIC_DIR);
}

/**
 * 内置技能拷贝来源路径（打包后从 resources，开发时从项目 builtin-skills）
 */
export function getBuiltinSkillsSourcePath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "builtin-skills");
  }
  const fromCwd = path.join(process.cwd(), "builtin-skills");
  if (fs.existsSync(fromCwd)) return fromCwd;
  return path.join(__dirname, "../../../../builtin-skills");
}
