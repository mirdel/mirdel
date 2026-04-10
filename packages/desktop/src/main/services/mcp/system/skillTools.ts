/**
 * 技能相关系统工具（仅在选中某技能时挂载）
 * 仅提供 system::run_script：按绝对路径执行脚本（限定在技能目录下）。
 * 读文件、列目录统一使用 filesystem 的 read_file / list_directory，路径使用 system_context 中的 SKILLS_PUBLIC_ROOT、CURRENT_SKILL_ROOT。
 */
import { tool } from "ai";
import { z } from "zod";
import { runScriptByPath } from "../../skill";

/**
 * 创建 run_script 工具（通用：仅按脚本路径执行，路径须在技能目录下，由 runScriptByPath 校验）
 */
export function createRunScript() {
  return tool({
    description: `Run a script (.py or .js) inside an allowed skill directory. Pass the absolute script path, typically built from CURRENT_SKILL_ROOT or SKILLS_PUBLIC_ROOT in system_context (for example, CURRENT_SKILL_ROOT + "/scripts/init_skill.py"). The working directory is the script's directory.`,
    inputSchema: z.object({
      script_path: z.string().describe("Absolute script path. It must be inside an allowed skill directory (for example, CURRENT_SKILL_ROOT/scripts/init_skill.py)"),
      args: z.array(z.string()).optional().describe("Arguments to pass to the script"),
    }),
    execute: async ({ script_path, args }) => {
      const result = await runScriptByPath(script_path, args ?? []);
      if (!result) {
        return {
          content: [{ type: "text" as const, text: "Invalid path, path is outside the allowed skill directories, or the file is not a .py/.js script" }],
          isError: true,
        };
      }
      const text = [
        result.stdout ? `stdout:\n${result.stdout}` : "",
        result.stderr ? `stderr:\n${result.stderr}` : "",
        `exitCode: ${result.exitCode}`,
      ]
        .filter(Boolean)
        .join("\n\n");
      return {
        content: [{ type: "text" as const, text: text || "(no output)" }],
        isError: result.exitCode !== 0,
      };
    },
  });
}
