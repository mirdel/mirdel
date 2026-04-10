import { loggerServiceRenderer } from "@shared";

const logger = loggerServiceRenderer.withContext("clipboard");

/**
 * 复制文本到剪贴板
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    logger.info("Text copied to clipboard");
    return true;
  } catch (error) {
    logger.error("Failed to copy text", { error });
    return false;
  }
}

