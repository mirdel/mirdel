import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { app } from "electron";
import type { SkillItem, SkillDetail } from "@shared";
import { tMain } from "../../i18n";
import { getSystemSkillsPath, getPublicSkillsPath, getBuiltinSkillsSourcePath } from "./skillPaths";
import { parseSkillMd } from "./parseSkillMd";
import { getPythonRuntimeEnv } from "../pythonRuntimeEnv";

const INSTALL_TIMEOUT_MS = 120_000;

const SKILL_MD = "SKILL.md";
const SCRIPTS_DIR = "scripts";
const REFERENCES_DIR = "references";
const REFERENCE_DIR = "reference"; // 部分技能使用单数
const ASSETS_DIR = "assets";

function listSubdirsWithSkillMd(dirPath: string): string[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return [];
  }
  const result: string[] = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const skillMdPath = path.join(dirPath, e.name, SKILL_MD);
    try {
      if (fs.statSync(skillMdPath).isFile()) {
        result.push(e.name);
      }
    } catch {
      // no SKILL.md, skip
    }
  }
  return result;
}

const ROOT_EXCLUDE_NAMES = new Set([SKILL_MD]);

/** 递归列出技能目录下所有文件的相对路径（统一 /），排除 SKILL.md */
function listAllRelativeFiles(skillDir: string): string[] {
  const result: string[] = [];
  function walk(currentDir: string, prefix: string) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const rel = prefix ? `${prefix}/${e.name}` : e.name;
      const relNorm = rel.replace(/\\/g, "/");
      if (e.isFile()) {
        if (!ROOT_EXCLUDE_NAMES.has(e.name)) result.push(relNorm);
        continue;
      }
      if (e.isDirectory()) {
        walk(path.join(currentDir, e.name), relNorm);
      }
    }
  }
  walk(skillDir, "");
  return result;
}

function listRelativeFilesInDir(dirPath: string, subdir: string): string[] {
  const full = path.join(dirPath, subdir);
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(full, { withFileTypes: true });
  } catch {
    return [];
  }
  const result: string[] = [];
  for (const e of entries) {
    const rel = path.join(subdir, e.name);
    if (e.isFile()) {
      result.push(rel);
    } else if (e.isDirectory()) {
      result.push(...listRelativeFilesInDir(dirPath, rel));
    }
  }
  return result;
}

/**
 * 确保 skills 目录存在，且 .system 有内容时从内置源拷贝（首次或为空时）
 */
export function ensureSkillsDirAndCopyBuiltin(): void {
  const root = path.dirname(getSystemSkillsPath());
  const systemPath = getSystemSkillsPath();
  const publicPath = getPublicSkillsPath();
  const sourcePath = getBuiltinSkillsSourcePath();

  if (!fs.existsSync(root)) {
    fs.mkdirSync(root, { recursive: true });
  }
  if (!fs.existsSync(systemPath)) {
    fs.mkdirSync(systemPath, { recursive: true });
  }
  if (!fs.existsSync(publicPath)) {
    fs.mkdirSync(publicPath, { recursive: true });
  }

  const existingSystemDirs = listSubdirsWithSkillMd(systemPath);
  if (existingSystemDirs.length > 0) {
    return;
  }

  if (!fs.existsSync(sourcePath)) {
    return;
  }

  const sourceDirs = listSubdirsWithSkillMd(sourcePath);
  for (const dirName of sourceDirs) {
    const src = path.join(sourcePath, dirName);
    const dest = path.join(systemPath, dirName);
    try {
      fs.cpSync(src, dest, { recursive: true });
    } catch {
      // ignore single skill copy failure
    }
  }
}

/**
 * 列出所有已安装技能（.system + public），id 格式为 system/xxx 或 public/xxx
 */
export function listSkills(): SkillItem[] {
  ensureSkillsDirAndCopyBuiltin();

  const result: SkillItem[] = [];
  const systemPath = getSystemSkillsPath();
  const publicPath = getPublicSkillsPath();

  for (const dirName of listSubdirsWithSkillMd(systemPath)) {
    const skillDir = path.join(systemPath, dirName);
    const skillMdPath = path.join(skillDir, SKILL_MD);
    const parsed = parseSkillMd(skillMdPath);
    if (parsed) {
      let updatedAt: number | undefined;
      try {
        updatedAt = fs.statSync(skillDir).mtimeMs;
      } catch {
        // ignore
      }
      result.push({
        id: `system/${dirName}`,
        name: parsed.name,
        description: parsed.description,
        isBuiltin: true,
        updatedAt,
      });
    }
  }

  for (const dirName of listSubdirsWithSkillMd(publicPath)) {
    const skillDir = path.join(publicPath, dirName);
    const skillMdPath = path.join(skillDir, SKILL_MD);
    const parsed = parseSkillMd(skillMdPath);
    if (parsed) {
      let updatedAt: number | undefined;
      try {
        updatedAt = fs.statSync(skillDir).mtimeMs;
      } catch {
        // ignore
      }
      result.push({
        id: `public/${dirName}`,
        name: parsed.name,
        description: parsed.description,
        isBuiltin: false,
        updatedAt,
      });
    }
  }

  result.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  return result;
}

/**
 * 根据技能 id 解析出技能目录绝对路径，无效 id 返回 null
 */
export function getSkillDirById(id: string): string | null {
  const parts = id.split("/");
  if (parts.length < 2) return null;
  const source = parts[0];
  const dirName = parts.slice(1).join("/");
  if (source !== "system" && source !== "public") return null;
  const basePath = source === "system" ? getSystemSkillsPath() : getPublicSkillsPath();
  return path.join(basePath, dirName);
}

/**
 * 卸载技能：删除该技能目录（内置与用户技能均支持，删除后需重新拷贝或添加才能恢复）
 */
export function uninstallSkill(skillId: string): void {
  const skillDir = getSkillDirById(skillId);
  if (!skillDir) throw new Error(tMain("skill.invalidId"));
  const basePath = skillId.startsWith("system/") ? getSystemSkillsPath() : getPublicSkillsPath();
  const resolvedDir = path.resolve(skillDir);
  const resolvedBase = path.resolve(basePath);
  if (!resolvedDir.startsWith(resolvedBase + path.sep) && resolvedDir !== resolvedBase) {
    throw new Error(tMain("skill.pathNotAllowed"));
  }
  if (!fs.existsSync(resolvedDir)) {
    return;
  }
  fs.rmSync(resolvedDir, { recursive: true });
}

const SCRIPT_TIMEOUT_MS = 60_000;

type RuntimeCommand = {
  cmd: string;
  argsPrefix: string[];
  env: Record<string, string>;
};

function getBundledPythonPath(): string | null {
  const runtimePythonRoot = app.isPackaged
    ? path.join(process.resourcesPath, ".runtime", "python")
    : path.join(app.getAppPath(), ".runtime", "python");

  const platform = process.platform;
  const arch = process.arch;

  if (platform === "darwin" && arch === "arm64") {
    const p = path.join(runtimePythonRoot, "darwin-arm64", "bin", "python3");
    return fs.existsSync(p) ? p : null;
  }
  if (platform === "darwin" && arch === "x64") {
    const p = path.join(runtimePythonRoot, "darwin-x64", "bin", "python3");
    return fs.existsSync(p) ? p : null;
  }
  if (platform === "win32" && arch === "x64") {
    const p = path.join(runtimePythonRoot, "win32-x64", "python.exe");
    return fs.existsSync(p) ? p : null;
  }
  if (platform === "win32" && arch === "arm64") {
    const p = path.join(runtimePythonRoot, "win32-arm64", "python.exe");
    return fs.existsSync(p) ? p : null;
  }

  return null;
}

/**
 * 从脚本绝对路径解析出「技能根目录」（即 system/public 下的一级子目录）
 */
function getSkillRootFromScriptPath(resolvedScriptPath: string): string | null {
  const systemRoot = path.resolve(getSystemSkillsPath());
  const publicRoot = path.resolve(getPublicSkillsPath());
  let current = path.dirname(resolvedScriptPath);
  const rootDir = path.parse(current).root;
  while (current && current !== rootDir) {
    const parent = path.dirname(current);
    if (parent === systemRoot || parent === publicRoot) return current;
    current = parent;
  }
  return null;
}

function getSpawnFailureMessage(
  result: ReturnType<typeof spawnSync>,
  fallbackMessage: string
): string {
  const errorMessage = result.error?.message ?? "";
  return String(result.stderr || result.stdout || errorMessage || fallbackMessage).trim();
}

function getNodeRuntimeCommand(): RuntimeCommand {
  return {
    cmd: process.execPath,
    argsPrefix: [],
    // Avoid launching another Electron app instance when spawning JS scripts.
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
  };
}

function getNpmRuntimeCommand(): RuntimeCommand {
  const appPath = app.getAppPath();
  const npmCliCandidates = [
    path.join(appPath, "node_modules", "npm", "bin", "npm-cli.js"),
    path.join(process.resourcesPath, "app.asar.unpacked", "node_modules", "npm", "bin", "npm-cli.js"),
  ];

  for (const npmCliPath of npmCliCandidates) {
    if (!fs.existsSync(npmCliPath)) continue;
    return {
      cmd: process.execPath,
      argsPrefix: [npmCliPath],
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
    };
  }

  return {
    cmd: "npm",
    argsPrefix: [],
    env: { ...process.env },
  };
}

function ensurePipAvailableInVenv(
  pythonInVenv: string,
  cwd: string
): { ok: true } | { error: string } {
  const pipCheck = spawnSync(pythonInVenv, ["-m", "pip", "--version"], {
    cwd,
    timeout: INSTALL_TIMEOUT_MS,
    encoding: "utf8",
    env: getPythonRuntimeEnv(),
  });
  if (pipCheck.status === 0) return { ok: true };

  const ensurePipResult = spawnSync(pythonInVenv, ["-m", "ensurepip", "--upgrade"], {
    cwd,
    timeout: INSTALL_TIMEOUT_MS,
    encoding: "utf8",
    env: getPythonRuntimeEnv(),
  });
  if (ensurePipResult.status !== 0) {
    return {
      error: getSpawnFailureMessage(ensurePipResult, tMain("skill.pipInstallFailed")),
    };
  }

  const pipCheckAfterEnsure = spawnSync(pythonInVenv, ["-m", "pip", "--version"], {
    cwd,
    timeout: INSTALL_TIMEOUT_MS,
    encoding: "utf8",
    env: getPythonRuntimeEnv(),
  });
  if (pipCheckAfterEnsure.status !== 0) {
    return {
      error: getSpawnFailureMessage(pipCheckAfterEnsure, tMain("skill.pipInstallFailed")),
    };
  }

  return { ok: true };
}

/**
 * 若技能根目录存在 requirements.txt 且尚无 .venv，则创建 venv 并 pip install；返回要使用的 python 可执行路径或错误
 */
function ensurePythonVenv(skillRoot: string): { pythonPath: string } | { error: string } {
  const reqInRoot = path.join(skillRoot, "requirements.txt");
  const reqInScripts = path.join(skillRoot, "scripts", "requirements.txt");
  const reqPath = fs.existsSync(reqInRoot) ? reqInRoot : fs.existsSync(reqInScripts) ? reqInScripts : null;
  const venvDir = path.join(skillRoot, ".venv");
  const pythonInVenv = path.join(
    venvDir,
    process.platform === "win32" ? "Scripts" : "bin",
    process.platform === "win32" ? "python.exe" : "python"
  );
  const bundledPython = getBundledPythonPath();

  if (!bundledPython) {
    return { error: tMain("skill.runtimeMissing") };
  }

  if (!reqPath) {
    return { pythonPath: bundledPython };
  }
  if (fs.existsSync(venvDir) && fs.existsSync(pythonInVenv)) {
    const pipReady = ensurePipAvailableInVenv(pythonInVenv, skillRoot);
    if ("error" in pipReady) {
      return { error: pipReady.error };
    }
    return { pythonPath: pythonInVenv };
  }

  const venvResult = spawnSync(bundledPython, ["-m", "venv", ".venv"], {
    cwd: skillRoot,
    timeout: INSTALL_TIMEOUT_MS,
    encoding: "utf8",
    env: getPythonRuntimeEnv(),
  });
  if (venvResult.status !== 0) {
    return { error: getSpawnFailureMessage(venvResult, tMain("skill.venvCreateFailed")) };
  }

  const pipReady = ensurePipAvailableInVenv(pythonInVenv, skillRoot);
  if ("error" in pipReady) {
    return { error: pipReady.error };
  }

  const pipResult = spawnSync(pythonInVenv, ["-m", "pip", "install", "-r", path.basename(reqPath)], {
    cwd: path.dirname(reqPath),
    timeout: INSTALL_TIMEOUT_MS,
    encoding: "utf8",
    env: getPythonRuntimeEnv(),
  });
  if (pipResult.status !== 0) {
    return { error: getSpawnFailureMessage(pipResult, tMain("skill.pipInstallFailed")) };
  }
  return { pythonPath: pythonInVenv };
}

/**
 * 若技能根目录存在 package.json 且尚无 node_modules，则执行 npm install
 */
function ensureNodeModules(skillRoot: string): { error?: string } {
  const pkgPath = path.join(skillRoot, "package.json");
  const nodeModules = path.join(skillRoot, "node_modules");
  if (!fs.existsSync(pkgPath)) return {};
  if (fs.existsSync(nodeModules)) return {};

  const npmRuntime = getNpmRuntimeCommand();
  const result = spawnSync(npmRuntime.cmd, [...npmRuntime.argsPrefix, "install"], {
    cwd: skillRoot,
    timeout: INSTALL_TIMEOUT_MS,
    encoding: "utf8",
    env: npmRuntime.env,
  });
  if (result.status !== 0) {
    return { error: getSpawnFailureMessage(result, tMain("skill.npmInstallFailed")) };
  }
  return {};
}

/**
 * 在技能目录下执行脚本（.py / .js），工作目录为技能根，禁止路径穿越
 * @returns { stdout, stderr, exitCode } 或 null（路径无效/执行失败）
 */
export async function runSkillScript(
  skillId: string,
  scriptPath: string,
  args: string[] = []
): Promise<{ stdout: string; stderr: string; exitCode: number } | null> {
  const skillDir = getSkillDirById(skillId);
  if (!skillDir) return null;
  const normalized = scriptPath.replace(/\\/g, "/").replace(/^\/+/, "");
  if (normalized.includes("..") || path.isAbsolute(scriptPath)) return null;
  const fullPath = path.join(skillDir, normalized);
  const rel = path.relative(skillDir, fullPath);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
  const ext = path.extname(normalized).toLowerCase();
  if (ext !== ".py" && ext !== ".js") return null;
  try {
    if (!fs.statSync(fullPath).isFile()) return null;
  } catch {
    return null;
  }

  let cmd: string;
  let execArgs: string[];
  const env: Record<string, string> = { ...process.env };
  if (ext === ".py") {
    const bundledPython = getBundledPythonPath();
    if (!bundledPython) {
      return {
        stdout: "",
        stderr: tMain("skill.scriptStartFailedRuntimeMissing"),
        exitCode: -1,
      };
    }
    cmd = bundledPython;
    execArgs = [fullPath, ...args];
    Object.assign(env, getPythonRuntimeEnv(env));
  } else {
    const nodeRuntime = getNodeRuntimeCommand();
    cmd = nodeRuntime.cmd;
    execArgs = [...nodeRuntime.argsPrefix, fullPath, ...args];
    Object.assign(env, nodeRuntime.env);
  }
  if (skillId === "system/skill-creator") {
    env.SKILLS_PUBLIC_ROOT = getPublicSkillsPath();
  }
  return new Promise((resolve) => {
    const child = spawn(cmd, execArgs, {
      cwd: skillDir,
      stdio: ["ignore", "pipe", "pipe"],
      env,
    }) as import("node:child_process").ChildProcess;
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve({
        stdout,
        stderr: stderr + `\n${tMain("skill.scriptTimeoutTerminated")}`,
        exitCode: -1,
      });
    }, SCRIPT_TIMEOUT_MS);
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      resolve({
        stdout,
        stderr,
        exitCode: code ?? (signal ? -1 : 0),
      });
    });
    child.on("error", () => {
      clearTimeout(timer);
      resolve({
        stdout: "",
        stderr: tMain("skill.scriptStartFailedGeneral"),
        exitCode: -1,
      });
    });
  });
}

/**
 * 按绝对路径执行脚本（仅允许在 system/public 技能目录下），工作目录为脚本所在目录
 * 若有 requirements.txt 则首次自动建 venv 并 pip install；若有 package.json 则首次自动 npm install
 */
export async function runScriptByPath(
  scriptPath: string,
  args: string[] = []
): Promise<{ stdout: string; stderr: string; exitCode: number } | null> {
  const resolved = path.resolve(scriptPath);
  const systemRoot = path.resolve(getSystemSkillsPath());
  const publicRoot = path.resolve(getPublicSkillsPath());
  const allowed =
    (resolved.startsWith(systemRoot + path.sep) || resolved === systemRoot) ||
    (resolved.startsWith(publicRoot + path.sep) || resolved === publicRoot);
  if (!allowed) return null;
  const normalized = scriptPath.replace(/\\/g, "/").replace(/^\/+/, "");
  const ext = path.extname(normalized).toLowerCase();
  if (ext !== ".py" && ext !== ".js") return null;
  try {
    if (!fs.statSync(resolved).isFile()) return null;
  } catch {
    return null;
  }
  const skillRoot = getSkillRootFromScriptPath(resolved);
  const skillDir = path.dirname(resolved);

  let cmd: string;
  let execArgs: string[];
  const env: Record<string, string> = { ...process.env };
  if (ext === ".py") {
    if (!skillRoot) return null;
    const venvResult = ensurePythonVenv(skillRoot);
    if ("error" in venvResult) {
      return {
        stdout: "",
        stderr: tMain("skill.dependencyInstallFailed", { message: venvResult.error }),
        exitCode: -1,
      };
    }
    cmd = venvResult.pythonPath;
    execArgs = [resolved, ...args];
    Object.assign(env, getPythonRuntimeEnv(env));
  } else {
    if (skillRoot) {
      const nodeResult = ensureNodeModules(skillRoot);
      if (nodeResult.error) {
        return {
          stdout: "",
          stderr: tMain("skill.dependencyInstallFailed", { message: nodeResult.error }),
          exitCode: -1,
        };
      }
    }
    const nodeRuntime = getNodeRuntimeCommand();
    cmd = nodeRuntime.cmd;
    execArgs = [...nodeRuntime.argsPrefix, resolved, ...args];
    Object.assign(env, nodeRuntime.env);
  }

  if (skillRoot && (skillRoot.includes(path.sep + "skill-creator" + path.sep) || skillRoot.endsWith(path.sep + "skill-creator"))) {
    env.SKILLS_PUBLIC_ROOT = getPublicSkillsPath();
  }
  return new Promise((resolve) => {
    const child = spawn(cmd, execArgs, {
      cwd: skillDir,
      stdio: ["ignore", "pipe", "pipe"],
      env,
    }) as import("node:child_process").ChildProcess;
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve({
        stdout,
        stderr: stderr + `\n${tMain("skill.scriptTimeoutTerminated")}`,
        exitCode: -1,
      });
    }, SCRIPT_TIMEOUT_MS);
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      resolve({
        stdout,
        stderr,
        exitCode: code ?? (signal ? -1 : 0),
      });
    });
    child.on("error", () => {
      clearTimeout(timer);
      resolve({
        stdout: "",
        stderr: tMain("skill.scriptStartFailedGeneral"),
        exitCode: -1,
      });
    });
  });
}

/**
 * 返回技能下拍平后的全部文件相对路径（供 list_skill_files 等使用）
 */
export function listSkillFilePaths(skillId: string): string[] {
  const detail = getSkillDetail(skillId);
  if (!detail) return [];
  const paths: string[] = [];
  if (detail.scriptPaths) paths.push(...detail.scriptPaths);
  if (detail.referencePaths) paths.push(...detail.referencePaths);
  if (detail.assetPaths) paths.push(...detail.assetPaths);
  if (detail.otherFilePaths) paths.push(...detail.otherFilePaths);
  return paths;
}

/**
 * 读取技能目录下某相对路径文件内容（仅文本，防路径穿越）
 */
export function readSkillFile(skillId: string, relativePath: string): { content: string; filename: string } | null {
  const skillDir = getSkillDirById(skillId);
  if (!skillDir) return null;
  const normalized = relativePath.replace(/\\/g, "/").replace(/^\/+/, "");
  if (normalized.includes("..") || path.isAbsolute(relativePath)) return null;
  const fullPath = path.join(skillDir, normalized);
  const rel = path.relative(skillDir, fullPath);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
  try {
    const content = fs.readFileSync(fullPath, "utf-8");
    return { content, filename: path.basename(normalized) };
  } catch {
    return null;
  }
}

/**
 * 根据 id（system/xxx 或 public/xxx）解析并返回技能详情
 */
export function getSkillDetail(id: string): SkillDetail | null {
  const skillDir = getSkillDirById(id);
  if (!skillDir) return null;
  const skillMdPath = path.join(skillDir, SKILL_MD);

  const parsed = parseSkillMd(skillMdPath);
  if (!parsed) return null;

  const scriptPaths = listRelativeFilesInDir(skillDir, SCRIPTS_DIR).map((p) => p.replace(/\\/g, "/").replace(/^\//, ""));
  const refsPlural = listRelativeFilesInDir(skillDir, REFERENCES_DIR).map((p) => p.replace(/\\/g, "/"));
  const refsSingular = listRelativeFilesInDir(skillDir, REFERENCE_DIR).map((p) => p.replace(/\\/g, "/"));
  const referencePaths = [...refsPlural, ...refsSingular].length > 0 ? [...refsPlural, ...refsSingular] : undefined;
  const assetPaths = listRelativeFilesInDir(skillDir, ASSETS_DIR).map((p) => p.replace(/\\/g, "/"));

  const inThree = new Set<string>([
    ...scriptPaths,
    ...(referencePaths ?? []),
    ...(assetPaths ?? []),
  ]);
  const allPaths = listAllRelativeFiles(skillDir);
  const otherFilePaths = allPaths.filter((p) => !inThree.has(p));

  return {
    id,
    name: parsed.name,
    description: parsed.description,
    isBuiltin: id.startsWith("system/"),
    bodyMarkdown: parsed.bodyMarkdown || undefined,
    scriptPaths: scriptPaths.length > 0 ? scriptPaths : undefined,
    referencePaths,
    assetPaths: assetPaths.length > 0 ? assetPaths : undefined,
    otherFilePaths: otherFilePaths.length > 0 ? otherFilePaths : undefined,
  };
}
