import { spawn } from "node:child_process";
import * as path from "node:path";
import { tool } from "ai";
import { z } from "zod";
import { getEffectiveWorkingDirs } from "../../chat/sessionData";

function validateCwd(cwd: string, allowedDirs: string[]): { valid: boolean; error?: string } {
  if (!allowedDirs || allowedDirs.length === 0) {
    return { valid: false, error: "No working directory is configured. Add an allowed directory in the scenario settings." };
  }

  const absolutePath = path.resolve(cwd);
  const isAllowed = allowedDirs.some((dir) => {
    const allowedDir = path.resolve(dir);
    return absolutePath === allowedDir || absolutePath.startsWith(allowedDir + path.sep);
  });

  if (!isAllowed) {
    return {
      valid: false,
      error: `Path "${cwd}" is outside the allowed working directories. Allowed directories: ${allowedDirs.join(", ")}`
    };
  }

  return { valid: true };
}

type RunCommandResult = {
  output: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  timedOut: boolean;
  aborted: boolean;
};

const COMMAND_TIMEOUT_MS = 60_000;
const COMMAND_TERMINATE_GRACE_MS = 10_000;

function runCommand(params: { cwd: string; command: string; args?: string[]; abortSignal?: AbortSignal }): Promise<RunCommandResult> {
  return new Promise((resolve, reject) => {
    const { cwd, command, args = [], abortSignal } = params;
    if (abortSignal?.aborted) {
      resolve({
        output: "(aborted)",
        exitCode: null,
        signal: null,
        timedOut: false,
        aborted: true,
      });
      return;
    }

    const child: any = spawn(command, args, {
      cwd,
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let settled = false;
    let timedOut = false;
    let aborted = false;
    let forceKillTimer: ReturnType<typeof setTimeout> | undefined;

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    child.stdout?.on("data", (chunk) => stdoutChunks.push(chunk));
    child.stderr?.on("data", (chunk) => stderrChunks.push(chunk));

    const terminateChild = () => {
      try {
        child.kill("SIGTERM");
      } catch {
        // noop
      }
      forceKillTimer = setTimeout(() => {
        if (!settled) {
          try {
            child.kill("SIGKILL");
          } catch {
            // noop
          }
        }
      }, COMMAND_TERMINATE_GRACE_MS);
    };

    const onAbort = () => {
      if (settled) return;
      aborted = true;
      terminateChild();
    };
    abortSignal?.addEventListener("abort", onAbort, { once: true });

    const timeout = setTimeout(() => {
      timedOut = true;
      terminateChild();
    }, COMMAND_TIMEOUT_MS);

    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (forceKillTimer) clearTimeout(forceKillTimer);
      abortSignal?.removeEventListener("abort", onAbort);
      reject(err);
    });
    child.on("close", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (forceKillTimer) clearTimeout(forceKillTimer);
      abortSignal?.removeEventListener("abort", onAbort);
      const stdout = Buffer.concat(stdoutChunks).toString("utf8");
      const stderr = Buffer.concat(stderrChunks).toString("utf8");
      const output = stdout + (stderr ? `\n[stderr]\n${stderr}` : "");
      resolve({
        output: output || "(no output)",
        exitCode: code,
        signal: signal ?? null,
        timedOut,
        aborted,
      });
    });
  });
}

export function createRunCommand(sessionId?: string) {
  return tool({
    description: "Run a shell command. Suitable for git, package managers, and common CLIs. The cwd must be one of the allowed working directories.",
    inputSchema: z.object({
      cwd: z.string().describe("Working directory (required). It must be inside an allowed working directory."),
      command: z.string().describe("Command to execute"),
      args: z.array(z.string()).optional().describe("Optional command arguments"),
    }),
    execute: async ({ cwd, command, args }, options: { abortSignal?: AbortSignal } = {}) => {
      const allowedDirs = sessionId ? getEffectiveWorkingDirs(sessionId) : [];
      const valid = validateCwd(cwd, allowedDirs);
      if (!valid.valid) {
        return {
          content: [{ type: "text" as const, text: valid.error || "cwd validation failed" }],
          isError: true,
        };
      }
      try {
        const result = await runCommand({
          cwd,
          command,
          args: Array.isArray(args) ? args : [],
          abortSignal: options.abortSignal,
        });
        const isError = result.timedOut || result.aborted || result.exitCode !== 0;
        const prefix = result.timedOut
          ? `[timeout after ${COMMAND_TIMEOUT_MS}ms]`
          : result.aborted
            ? `[aborted${result.signal ? ` signal ${result.signal}` : ""}]`
          : result.exitCode !== 0
            ? `[exit ${result.exitCode}${result.signal ? ` signal ${result.signal}` : ""}]`
            : "";
        const text = prefix ? `${prefix}\n${result.output}` : result.output;
        return {
          content: [{ type: "text" as const, text }],
          ...(isError ? { isError: true } : {}),
        };
      } catch (error: any) {
        return { content: [{ type: "text" as const, text: `Error: ${error.message || String(error)}` }], isError: true };
      }
    },
  });
}
