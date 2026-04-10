import { markdownToPlain } from "@mirdel/markdown-to-plain";
import { copyToClipboard } from "@/utils/clipboard";
import { useMyToast } from "@/composables/useMyToast";
import { i18n } from "@/i18n";
import { toPng, toBlob } from "html-to-image";

export type ExportFormat = "markdown" | "plain" | "word" | "pdf" | "image";
export type CopyFormat = "markdown" | "plain" | "image";

export function useContentExport() {
  const toast = useMyToast();

  async function copyAsMarkdown(contentMd: string) {
    const ok = await copyToClipboard(contentMd);
    if (ok) toast.success(i18n.global.t("contentExport.copyMarkdownSuccess"));
    else toast.error(i18n.global.t("contentExport.copyFailed"));
    return ok;
  }

  async function copyAsPlainText(contentMd: string) {
    const plain = markdownToPlain(contentMd, { preserveLineBreaks: true });
    const ok = await copyToClipboard(plain);
    if (ok) toast.success(i18n.global.t("contentExport.copyPlainSuccess"));
    else toast.error(i18n.global.t("contentExport.copyFailed"));
    return ok;
  }

  const IMAGE_PADDING = 24;

  function getImageOptions(element: HTMLElement) {
    const rect = element.getBoundingClientRect();
    return {
      backgroundColor: "#ffffff",
      pixelRatio: 2,
      width: rect.width + IMAGE_PADDING * 2,
      height: rect.height + IMAGE_PADDING * 2,
      style: {
        padding: `${IMAGE_PADDING}px`,
        boxSizing: "content-box" as const,
      },
    };
  }

  async function copyAsImage(element: HTMLElement) {
    try {
      const blob = await toBlob(element, getImageOptions(element));
      if (!blob) {
        toast.error(i18n.global.t("contentExport.generateImageFailed"));
        return false;
      }
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": blob }),
      ]);
      toast.success(i18n.global.t("contentExport.copyImageSuccess"));
      return true;
    } catch (error) {
      toast.error({ title: i18n.global.t("contentExport.copyImageFailed"), description: String(error) });
      return false;
    }
  }

  async function exportAsFile(
    title: string,
    contentMd: string,
    format: "plain" | "markdown"
  ) {
    try {
      const result = await window.ipc("content:export", {
        title,
        contentMd,
        format,
      });
      if (!result || !("ok" in result)) throw new Error(i18n.global.t("contentExport.exportFailed"));
      if ("canceled" in result && result.canceled) return;
      if (!result.ok) throw new Error(i18n.global.t("contentExport.exportFailed"));
      toast.success({
        title: i18n.global.t("contentExport.exportSuccess"),
        description: format === "plain"
          ? i18n.global.t("contentExport.format.plain")
          : i18n.global.t("contentExport.format.markdown"),
      });
    } catch (error) {
      toast.error({ title: i18n.global.t("contentExport.exportFailed"), description: String(error) });
    }
  }

  async function exportAsWord(title: string, contentMd: string) {
    try {
      const result = await window.ipc("content:exportWord", {
        title,
        contentMd,
      });
      if (!result || !("ok" in result)) throw new Error(i18n.global.t("contentExport.exportFailed"));
      if ("canceled" in result && result.canceled) return;
      if (!result.ok) throw new Error(i18n.global.t("contentExport.exportFailed"));
      toast.success({
        title: i18n.global.t("contentExport.exportSuccess"),
        description: i18n.global.t("contentExport.format.word"),
      });
    } catch (error) {
      toast.error({ title: i18n.global.t("contentExport.exportFailed"), description: String(error) });
    }
  }

  async function exportAsPdf(title: string, contentMd: string) {
    try {
      const result = await window.ipc("content:exportPdf", {
        title,
        contentMd,
      });
      if (!result || !("ok" in result)) throw new Error(i18n.global.t("contentExport.exportFailed"));
      if ("canceled" in result && result.canceled) return;
      if (!result.ok) throw new Error(i18n.global.t("contentExport.exportFailed"));
      toast.success({
        title: i18n.global.t("contentExport.exportSuccess"),
        description: i18n.global.t("contentExport.format.pdf"),
      });
    } catch (error) {
      toast.error({ title: i18n.global.t("contentExport.exportFailed"), description: String(error) });
    }
  }

  async function exportAsImage(element: HTMLElement, title: string) {
    try {
      const dataUrl = await toPng(element, getImageOptions(element));
      const result = await window.ipc("content:saveImage", {
        title,
        dataUrl,
      });
      if (!result || !("ok" in result)) throw new Error(i18n.global.t("contentExport.exportFailed"));
      if ("canceled" in result && result.canceled) return;
      if (!result.ok) throw new Error(i18n.global.t("contentExport.exportFailed"));
      toast.success({
        title: i18n.global.t("contentExport.exportSuccess"),
        description: i18n.global.t("contentExport.format.png"),
      });
    } catch (error) {
      toast.error({ title: i18n.global.t("contentExport.exportFailed"), description: String(error) });
    }
  }

  return {
    copyAsMarkdown,
    copyAsPlainText,
    copyAsImage,
    exportAsFile,
    exportAsWord,
    exportAsPdf,
    exportAsImage,
  };
}
