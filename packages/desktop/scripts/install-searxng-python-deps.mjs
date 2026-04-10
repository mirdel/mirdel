#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const desktopRoot = path.resolve(__dirname, '..');

const pythonRuntimeRoot = path.join(desktopRoot, '.runtime', 'python');
const requirementsPath = path.join(desktopRoot, 'searxng', 'source', 'requirements.txt');
const DEPS_MANIFEST_NAME = '.searxng-deps.manifest.json';

const RUNTIME_DEFS = {
  'darwin-arm64': {
    basePythonRelPath: path.join('bin', 'python3'),
  },
  'darwin-x64': {
    basePythonRelPath: path.join('bin', 'python3'),
  },
  'win32-x64': {
    basePythonRelPath: 'python.exe',
  },
  'win32-arm64': {
    basePythonRelPath: 'python.exe',
  },
};

function parseArgs(argv) {
  const args = {
    targets: null,
    all: false,
    dryRun: false,
    upgrade: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const raw = argv[i];
    if (raw === '--') {
      continue;
    }
    if (raw === '--all') {
      args.all = true;
      continue;
    }
    if (raw === '--dry-run') {
      args.dryRun = true;
      continue;
    }
    if (raw === '--upgrade') {
      args.upgrade = true;
      continue;
    }
    if (raw.startsWith('--target=')) {
      args.targets = raw.slice('--target='.length);
      continue;
    }
    if (raw === '--target') {
      const next = argv[i + 1];
      if (!next) {
        throw new Error('Missing value for --target');
      }
      args.targets = next;
      i += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${raw}`);
  }

  return args;
}

function resolveDefaultTarget() {
  const platform = process.platform;
  const arch = process.arch;

  if (platform === 'darwin' && arch === 'arm64') return 'darwin-arm64';
  if (platform === 'darwin' && arch === 'x64') return 'darwin-x64';
  if (platform === 'win32' && arch === 'x64') return 'win32-x64';
  if (platform === 'win32' && arch === 'arm64') return 'win32-arm64';

  throw new Error(`Unsupported host platform for default target: ${platform}/${arch}`);
}

function normalizeTargets(parsedArgs) {
  if (parsedArgs.all) {
    return Object.keys(RUNTIME_DEFS);
  }

  if (parsedArgs.targets) {
    return parsedArgs.targets
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [resolveDefaultTarget()];
}

function assertFilesReady() {
  if (!fs.existsSync(requirementsPath)) {
    throw new Error(`requirements file not found: ${requirementsPath}`);
  }
}

function isNativeTarget(target) {
  if (target.startsWith('darwin-')) {
    return process.platform === 'darwin';
  }
  if (target.startsWith('win32-')) {
    return process.platform === 'win32';
  }
  return false;
}

function runCommand(executable, args, cwd, dryRun) {
  const commandPreview = `${executable} ${args.join(' ')}`;
  console.log(`[searxng] ${dryRun ? 'would run' : 'running'}: ${commandPreview}`);
  if (dryRun) return;

  const result = spawnSync(executable, args, {
    cwd,
    stdio: 'inherit',
    env: {
      ...process.env,
      PIP_DISABLE_PIP_VERSION_CHECK: '1',
    },
  });

  if (result.status !== 0) {
    throw new Error(`Command failed with exit code ${result.status}: ${commandPreview}`);
  }
}

function sha256File(filePath) {
  const data = fs.readFileSync(filePath);
  return createHash('sha256').update(data).digest('hex');
}

function readManifest(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeManifest(filePath, payload) {
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function installTargetDeps(target, options, requirementsSha256) {
  const def = RUNTIME_DEFS[target];
  if (!def) {
    throw new Error(`Unknown runtime target: ${target}`);
  }

  const runtimeDir = path.join(pythonRuntimeRoot, target);
  const basePythonPath = path.join(runtimeDir, def.basePythonRelPath);
  const depsManifestPath = path.join(runtimeDir, DEPS_MANIFEST_NAME);

  if (!fs.existsSync(runtimeDir)) {
    throw new Error(`Runtime directory not found for ${target}: ${runtimeDir}`);
  }
  if (!fs.existsSync(basePythonPath)) {
    throw new Error(`Base Python executable not found for ${target}: ${basePythonPath}`);
  }

  if (!isNativeTarget(target)) {
    if (options.all) {
      console.log(
        `[searxng] skip target ${target}: not runnable on host ${process.platform}/${process.arch}`
      );
      return;
    }
    throw new Error(
      `Target ${target} is not runnable on host ${process.platform}/${process.arch}. ` +
      'Please run this script on that target OS.'
    );
  }

  const depsManifest = readManifest(depsManifestPath);
  if (
    !options.upgrade
    && depsManifest
    && depsManifest.requirementsSha256 === requirementsSha256
    && depsManifest.pythonRelPath === def.basePythonRelPath
  ) {
    console.log(`[searxng] skip target ${target}: dependencies already prepared`);
    return;
  }

  // 直接在 bundled Python runtime 上安装 searxng 依赖，避免额外 venv 冗余打包体积
  runCommand(basePythonPath, ['-m', 'pip', '--version'], desktopRoot, options.dryRun);

  const pipArgs = ['-m', 'pip', 'install', '-r', requirementsPath];
  if (options.upgrade) {
    pipArgs.push('--upgrade');
  }
  runCommand(basePythonPath, pipArgs, desktopRoot, options.dryRun);

  if (!options.dryRun) {
    writeManifest(depsManifestPath, {
      target,
      pythonRelPath: def.basePythonRelPath,
      requirementsSha256,
      preparedAt: new Date().toISOString(),
    });
  }
}

function main() {
  const parsedArgs = parseArgs(process.argv.slice(2));
  const targets = normalizeTargets(parsedArgs);

  if (targets.length === 0) {
    throw new Error('No targets to install');
  }

  assertFilesReady();
  const requirementsSha256 = sha256File(requirementsPath);

  console.log('[searxng] install searxng env deps');
  console.log(`[searxng] host: ${process.platform}/${process.arch}`);
  console.log(`[searxng] targets: ${targets.join(', ')}`);

  for (const target of targets) {
    console.log(`[searxng] target start: ${target}`);
    installTargetDeps(target, parsedArgs, requirementsSha256);
    console.log(`[searxng] target done: ${target}`);
  }

  console.log('[searxng] all done');
}

try {
  main();
} catch (error) {
  console.error(
    `[searxng] failed: ${error instanceof Error ? error.message : String(error)}`
  );
  process.exit(1);
}
