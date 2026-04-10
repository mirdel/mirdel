/**
 * 系统环境信息收集模块
 * 用于向大模型提供必要的系统上下文信息
 * 技能相关路径（SKILLS_PUBLIC_ROOT、CURRENT_SKILL_ROOT）不再在此注入，改由技能块 [Paths & Tools] 注入
 */
import * as os from "node:os";

/**
 * 获取系统上下文信息字符串
 * 用于注入到系统提示词之前，帮助大模型了解用户的操作环境
 */
export function getSystemContext(): string {
  const now = new Date();

  const osType = os.type();
  const osRelease = os.release();
  const platform = os.platform();
  const osName =
    platform === "darwin" ? "macOS" : platform === "win32" ? "Windows" : "Linux";

  const locale = Intl.DateTimeFormat().resolvedOptions().locale || "unknown";
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "unknown";
  const currentTime = now.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const homeDir = os.homedir();

  const lines: string[] = [
    `## System Context`,
    ``,
    `<system_context>`,
    `OS: ${osName} (${osType} ${osRelease})`,
    `Locale: ${locale}`,
    `Current Time: ${currentTime}`,
    `Timezone: ${timezone}`,
    `Home Directory: ${homeDir}`,
    `</system_context>`,
  ];

  return lines.join("\n");
}
