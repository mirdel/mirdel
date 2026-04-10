import { loggerServiceMain } from "@shared";
import { tMain } from "../i18n";
import { proxyAwareFetch } from "./network/proxyRuntime";

const logger = loggerServiceMain.withContext("http");

export type HttpRequestConfig = {
  url?: string;
  method?: string;
  headers?: Record<string, string>;
  timeout?: number;
  data?: unknown;
};

type HttpResponse<T = unknown> = {
  status: number;
  statusText: string;
  data: T;
  headers: Headers;
  config: HttpRequestConfig;
};

class HttpError extends Error {
  code?: string;
  request?: { method?: string; url?: string };
  response?: { status: number; statusText: string; data: unknown };
  config?: HttpRequestConfig;
}

function isBodyInit(data: unknown): data is BodyInit {
  return typeof data === "string"
    || data instanceof ArrayBuffer
    || ArrayBuffer.isView(data)
    || (typeof Blob !== "undefined" && data instanceof Blob)
    || (typeof FormData !== "undefined" && data instanceof FormData)
    || data instanceof URLSearchParams
    || (typeof ReadableStream !== "undefined" && data instanceof ReadableStream);
}

async function parseResponseData(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json();
  }

  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function request<T = unknown>(config: HttpRequestConfig): Promise<HttpResponse<T>> {
  const method = (config.method || "GET").toUpperCase();
  const url = String(config.url || "").trim();
  const headers = { ...(config.headers || {}) };

  if (!url) {
    throw new Error("HTTP request url is required");
  }

  logger.info("HTTP Request", { method, url });

  const controller = new AbortController();
  const timeout = config.timeout ?? 30000;
  const timeoutId = timeout > 0
    ? setTimeout(() => controller.abort(new Error("timeout")), timeout)
    : null;

  try {
    const body = config.data === undefined
      ? undefined
      : isBodyInit(config.data)
        ? config.data
        : JSON.stringify(config.data);

    if (
      body
      && !headers["Content-Type"]
      && !headers["content-type"]
      && !(typeof FormData !== "undefined" && body instanceof FormData)
    ) {
      headers["Content-Type"] = "application/json";
    }
    if (!headers["User-Agent"] && !headers["user-agent"]) {
      headers["User-Agent"] = "mirdel";
    }

    const response = await proxyAwareFetch(url, {
      method,
      headers,
      body: method === "GET" || method === "HEAD" ? undefined : body,
      signal: controller.signal,
    });

    const data = await parseResponseData(response);
    logger.info("HTTP Response", { method, url, status: response.status });

    if (!response.ok) {
      const error = new HttpError(`HTTP ${response.status}: ${response.statusText}`);
      error.code = "ERR_BAD_RESPONSE";
      error.request = { method, url };
      error.config = config;
      error.response = {
        status: response.status,
        statusText: response.statusText,
        data,
      };
      throw error;
    }

    return {
      status: response.status,
      statusText: response.statusText,
      data: data as T,
      headers: response.headers,
      config,
    };
  } catch (error) {
    const httpError = error instanceof HttpError ? error : new HttpError(error instanceof Error ? error.message : String(error));
    httpError.request ??= { method, url };
    httpError.config ??= config;

    if (error instanceof Error && error.name === "AbortError") {
      httpError.code = "ECONNABORTED";
    }

    logger.error(httpError.response ? "HTTP Response Error" : "HTTP Request Error", {
      method,
      url,
      code: httpError.code,
      message: httpError.message,
      status: httpError.response?.status,
    });

    throw httpError;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

/**
 * 格式化错误消息，用于显示给用户
 */
export function formatHttpError(error: unknown): string {
  if (error instanceof HttpError) {
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data;

      if (typeof data === "string") {
        return `HTTP ${status}: ${data}`;
      }
      if (data && typeof data === "object") {
        let message = (data as any).error || (data as any).message || (data as any).msg || (data as any).error_message;
        if (message && typeof message === "object") {
          message = message.message || message.msg || JSON.stringify(message);
        }
        if (typeof message === "string" && message) {
          return `HTTP ${status}: ${message}`;
        }
        try {
          const dataStr = JSON.stringify(data);
          if (dataStr && dataStr !== "{}") {
            return `HTTP ${status}: ${dataStr}`;
          }
        } catch {
          // ignore stringify failure
        }
      }
      return `HTTP ${status}: ${error.response.statusText}`;
    }

    if (error.code === "ECONNABORTED") {
      return tMain("common.networkTimeout");
    }

    return error.message || tMain("common.networkError");
  }

  return error instanceof Error ? error.message : String(error);
}

export function isHttpError(error: unknown): error is HttpError {
  return error instanceof HttpError;
}

export function createRequest(config: HttpRequestConfig) {
  return request(config);
}

const http = {
  request,
  get<T = unknown>(url: string, config: Omit<HttpRequestConfig, "url" | "method" | "data"> = {}) {
    return request<T>({ ...config, url, method: "GET" });
  },
  post<T = unknown>(url: string, data?: unknown, config: Omit<HttpRequestConfig, "url" | "method" | "data"> = {}) {
    return request<T>({ ...config, url, method: "POST", data });
  },
};

export default http;
