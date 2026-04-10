export type LogLevel = "error" | "warn" | "info" | "debug";

export type LoggerContext = {
  source?: string;
  module?: string;
};

export type LoggerLike = {
  error: (message: string, extra?: unknown) => void;
  warn: (message: string, extra?: unknown) => void;
  info: (message: string, extra?: unknown) => void;
  debug: (message: string, extra?: unknown) => void;
};

export type LoggerServiceLike = {
  initWindowSource: (source: string) => void;
  setLevel: (level: LogLevel) => void;
  withContext: (module: string) => LoggerLike;
};


