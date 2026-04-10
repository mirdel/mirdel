import { tMain } from "../../../i18n";

export type VideoGenerationErrorCode =
  | "aborted"
  | "auth"
  | "permission"
  | "rate_limit"
  | "timeout"
  | "unsupported"
  | "model_not_found"
  | "validation"
  | "network"
  | "service_unavailable"
  | "empty_result"
  | "unknown";

export class VideoGenerationError extends Error {
  code: VideoGenerationErrorCode;
  statusCode?: number;
  retryable: boolean;

  constructor(input: {
    code: VideoGenerationErrorCode;
    message: string;
    statusCode?: number;
    retryable?: boolean;
  }) {
    super(input.message);
    this.name = "VideoGenerationError";
    this.code = input.code;
    this.statusCode = input.statusCode;
    this.retryable = !!input.retryable;
  }
}

export function isAbortLikeError(error: unknown) {
  if (!error) return false;
  if (error instanceof VideoGenerationError && error.code === "aborted") return true;
  const message = error instanceof Error ? error.message : String(error);
  return /abort|aborted|cancel/i.test(message);
}

export function toVideoGenerationError(error: unknown): VideoGenerationError {
  if (error instanceof VideoGenerationError) return error;

  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();

  if (isAbortLikeError(error)) {
    return new VideoGenerationError({ code: "aborted", message: tMain("video.aborted") });
  }
  if (lower.includes("api key") || lower.includes("unauthorized") || lower.includes("401")) {
    return new VideoGenerationError({ code: "auth", message: tMain("video.authFailed") });
  }
  if (lower.includes("forbidden") || lower.includes("403")) {
    return new VideoGenerationError({ code: "permission", message: tMain("video.permissionDenied") });
  }
  if (lower.includes("rate limit") || lower.includes("429")) {
    return new VideoGenerationError({ code: "rate_limit", message: tMain("video.rateLimit"), retryable: true });
  }
  if (lower.includes("timeout")) {
    return new VideoGenerationError({ code: "timeout", message: tMain("video.timeout"), retryable: true });
  }
  if (lower.includes("not support") || lower.includes("unsupported")) {
    return new VideoGenerationError({ code: "unsupported", message: tMain("video.unsupported") });
  }
  if (lower.includes("model") && lower.includes("not found")) {
    return new VideoGenerationError({ code: "model_not_found", message: tMain("video.modelUnavailable") });
  }
  if (lower.includes("no video") || lower.includes("未返回可用视频")) {
    return new VideoGenerationError({ code: "empty_result", message: tMain("video.noUsableVideo") });
  }
  return new VideoGenerationError({ code: "unknown", message: tMain("video.generationFailed", { message }) });
}
