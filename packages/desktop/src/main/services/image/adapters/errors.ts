import { tMain } from "../../../i18n";

export type ImageGenerationErrorCode =
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

export class ImageGenerationError extends Error {
  code: ImageGenerationErrorCode;
  statusCode?: number;
  retryable: boolean;

  constructor(input: {
    code: ImageGenerationErrorCode;
    message: string;
    statusCode?: number;
    retryable?: boolean;
  }) {
    super(input.message);
    this.name = "ImageGenerationError";
    this.code = input.code;
    this.statusCode = input.statusCode;
    this.retryable = !!input.retryable;
  }
}

export function isAbortLikeError(error: unknown) {
  if (!error) return false;
  if (error instanceof ImageGenerationError && error.code === "aborted") return true;
  const message = error instanceof Error ? error.message : String(error);
  return /abort|aborted|cancel/i.test(message);
}

export function toImageGenerationError(error: unknown): ImageGenerationError {
  if (error instanceof ImageGenerationError) return error;

  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();

  if (isAbortLikeError(error)) {
    return new ImageGenerationError({ code: "aborted", message: tMain("image.aborted") });
  }
  if (lower.includes("api key") || lower.includes("unauthorized") || lower.includes("401")) {
    return new ImageGenerationError({ code: "auth", message: tMain("image.authFailed") });
  }
  if (lower.includes("forbidden") || lower.includes("403")) {
    return new ImageGenerationError({ code: "permission", message: tMain("image.permissionDenied") });
  }
  if (lower.includes("rate limit") || lower.includes("429")) {
    return new ImageGenerationError({ code: "rate_limit", message: tMain("image.rateLimit"), retryable: true });
  }
  if (lower.includes("timeout")) {
    return new ImageGenerationError({ code: "timeout", message: tMain("image.timeout"), retryable: true });
  }
  if (lower.includes("not support") || lower.includes("unsupported")) {
    return new ImageGenerationError({ code: "unsupported", message: tMain("image.unsupported") });
  }
  if (lower.includes("model") && lower.includes("not found")) {
    return new ImageGenerationError({ code: "model_not_found", message: tMain("image.modelUnavailable") });
  }
  if (lower.includes("未返回可用图片") || lower.includes("no usable image")) {
    return new ImageGenerationError({ code: "empty_result", message: tMain("image.noUsableImage") });
  }
  return new ImageGenerationError({ code: "unknown", message: tMain("image.generationFailed", { message }) });
}
