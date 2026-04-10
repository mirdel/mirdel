import type { LogLevel, LoggerServiceLike } from "./loggerService";

type PreloadLogger = {
  send: (level: LogLevel, message: string, extra?: unknown) => void;
};

function getPreloadLogger(): PreloadLogger | null {
  const w = globalThis as unknown as { log?: PreloadLogger };
  return w?.log ?? null;
}

class LoggerServiceRenderer implements LoggerServiceLike {
  private windowSource: string | undefined;

  initWindowSource(source: string) {
    this.windowSource = source;
  }

  // renderer 侧级别控制交给 main；这里先保留接口
  setLevel(_level: LogLevel) {}

  /**
   * 序列化 extra 参数，确保可以通过 IPC 安全传输
   * 使用 JSON.parse(JSON.stringify()) 来移除不可序列化的属性（函数、循环引用、Vue 响应式代理等）
   */
  private serializeExtra(extra: unknown): unknown {
    if (extra === undefined || extra === null) {
      return extra;
    }
    
    // 如果是基本类型，直接返回
    if (typeof extra !== 'object') {
      return extra;
    }

    try {
      // 通过 JSON 序列化和反序列化来清理对象
      return JSON.parse(JSON.stringify(extra));
    } catch (error) {
      // 如果序列化失败（比如循环引用），返回错误信息
      return { _serializationError: String(error) };
    }
  }

  withContext(module: string) {
    const service = this;
    return {
      error(message: string, extra?: unknown) {
        const decorated = service.decorate(module, message);
        console.error(decorated, extra ?? "");
        getPreloadLogger()?.send("error", decorated, service.serializeExtra(extra));
      },
      warn(message: string, extra?: unknown) {
        const decorated = service.decorate(module, message);
        console.warn(decorated, extra ?? "");
        getPreloadLogger()?.send("warn", decorated, service.serializeExtra(extra));
      },
      info(message: string, extra?: unknown) {
        const decorated = service.decorate(module, message);
        console.info(decorated, extra ?? "");
        getPreloadLogger()?.send("info", decorated, service.serializeExtra(extra));
      },
      debug(message: string, extra?: unknown) {
        const decorated = service.decorate(module, message);
        console.debug(decorated, extra ?? "");
        getPreloadLogger()?.send("debug", decorated, service.serializeExtra(extra));
      }
    };
  }

  private decorate(module: string, message: string) {
    const source = this.windowSource ? `source=${this.windowSource}` : undefined;
    const mod = module ? `module=${module}` : undefined;
    const prefix = [source, mod].filter(Boolean).join(" ");
    return prefix ? `[${prefix}] ${message}` : message;
  }
}

export const loggerServiceRenderer = new LoggerServiceRenderer();


