import type { Logger } from "electron-log";
import log from "electron-log";
import type { LogLevel, LoggerContext, LoggerServiceLike } from "./loggerService";

// 配置 electron-log 性能优化
// 延迟配置，确保 transports 已初始化
function configureLog() {
  if (log.transports?.file) {
    // Always persist logs under userData/logs, independent from package.json name.
    log.transports.file.resolvePathFn = (vars: { userData?: string; libraryDefaultDir?: string; fileName?: string }) => {
      const baseDir = vars.userData || vars.libraryDefaultDir || process.cwd();
      const fileName = vars.fileName || "main.log";
      const sep = baseDir.includes("\\") ? "\\" : "/";
      const normalizedBase = baseDir.endsWith("/") || baseDir.endsWith("\\") ? baseDir.slice(0, -1) : baseDir;
      return `${normalizedBase}${sep}logs${sep}${fileName}`;
    };
    log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}';
    log.transports.file.level = 'info'; // 文件只记录 info 及以上级别
    log.transports.file.maxSize = 10 * 1024 * 1024; // 10MB
  }
  
  if (log.transports?.console) {
    log.transports.console.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}';
    log.transports.console.level = 'debug'; // 控制台记录所有级别
  }
}

// 立即尝试配置，如果失败则在首次使用时配置
try {
  configureLog();
} catch (e) {
  // 忽略初始化时的错误，会在首次使用时重试
}

class LoggerServiceMain implements LoggerServiceLike {
  private baseLogger: Logger;
  private windowSource: string | undefined;
  private configured = false;

  constructor(baseLogger: Logger) {
    this.baseLogger = baseLogger;
  }
  
  private ensureConfigured() {
    if (!this.configured) {
      try {
        configureLog();
        this.configured = true;
      } catch (e) {
        // 静默失败
      }
    }
  }

  initWindowSource(source: string) {
    this.windowSource = source;
  }

  setLevel(level: LogLevel) {
    this.baseLogger.transports.file.level = level;
    this.baseLogger.transports.console.level = level;
  }

  withContext(module: string) {
    this.ensureConfigured(); // 确保已配置
    const service = this;
    const ctx: LoggerContext = { module };
    return {
      error(message: string, extra?: unknown) {
        service.baseLogger.error(service.decorate(message, ctx), extra ?? "");
      },
      warn(message: string, extra?: unknown) {
        service.baseLogger.warn(service.decorate(message, ctx), extra ?? "");
      },
      info(message: string, extra?: unknown) {
        service.baseLogger.info(service.decorate(message, ctx), extra ?? "");
      },
      debug(message: string, extra?: unknown) {
        service.baseLogger.debug(service.decorate(message, ctx), extra ?? "");
      }
    };
  }

  private decorate(message: string, ctx: LoggerContext) {
    const source = this.windowSource ? `source=${this.windowSource}` : undefined;
    const module = ctx.module ? `module=${ctx.module}` : undefined;
    const prefix = [source, module].filter(Boolean).join(" ");
    return prefix ? `[${prefix}] ${message}` : message;
  }
}

export const loggerServiceMain = new LoggerServiceMain(log);
