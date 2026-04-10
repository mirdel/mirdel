import type { ConfigText, ImageCapabilities, ImageTaskCapabilities, ProviderModel, VideoCapabilities } from "@shared";
import { getMainAppLocale, tMain } from "../../i18n";

function getTextFromMap(value: Exclude<ConfigText, string>): string {
  const locale = getMainAppLocale();
  if (locale === "zh-CN" || locale === "zh-TW") {
    return value.zhCn?.trim() || value.default?.trim() || "";
  }

  return value.default?.trim() || value.zhCn?.trim() || "";
}

export function resolveConfigText(value: ConfigText | undefined | null): string {
  if (!value) return "";
  if (typeof value === "string") {
    return value.trim();
  }
  return getTextFromMap(value);
}

export function resolveProviderName(input: {
  name: ConfigText;
}): string {
  return resolveConfigText(input.name) || tMain("provider.localModel");
}

export function resolveProviderHelpLabel(input: {
  helpLabel?: ConfigText;
  helpUrl?: string;
}): string | undefined {
  const resolved = resolveConfigText(input.helpLabel);
  if (resolved) {
    return resolved;
  }

  if (input.helpUrl) {
    return tMain("provider.help.getApiKey");
  }

  return undefined;
}

function resolveImageTaskCapabilitiesText(
  task: ImageTaskCapabilities | undefined
): ImageTaskCapabilities | undefined {
  if (!task) return task;

  return {
    ...task,
    customSizeHint: resolveConfigText(task.customSizeHint) || undefined,
  };
}

export function resolveProviderModelConfigText(model: ProviderModel): ProviderModel {
  const image = model.image;
  const video = model.video;
  if (!image && !video) return { ...model };

  const resolvedImage = image
    ? ({
        ...image,
        common:
          image.common && typeof image.common === "object" && !Array.isArray(image.common)
            ? resolveImageTaskCapabilitiesText(image.common as ImageTaskCapabilities)
            : image.common,
        customSizeHint: resolveConfigText(image.customSizeHint) || undefined,
        generate: resolveImageTaskCapabilitiesText(image.generate),
        edit: resolveImageTaskCapabilitiesText(image.edit),
      } satisfies ImageCapabilities)
    : undefined;

  const resolvedVideo = video
    ? ({
        ...video,
        customResolutionHint: resolveConfigText(video.customResolutionHint) || undefined,
      } satisfies VideoCapabilities)
    : undefined;

  return {
    ...model,
    ...(resolvedImage ? { image: resolvedImage } : {}),
    ...(resolvedVideo ? { video: resolvedVideo } : {}),
  };
}
