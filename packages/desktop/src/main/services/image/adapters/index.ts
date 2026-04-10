import type { ImageProviderAdapter, ResolvedImageModel } from "./types";
import { dashscopeImageAdapter } from "./dashscopeImageAdapter";
import { minimaxImageAdapter } from "./minimaxImageAdapter";
import { zhipuImageAdapter } from "./zhipuImageAdapter";
import { doubaoImageAdapter } from "./doubaoImageAdapter";
import { aiSdkImageAdapter } from "./aiSdkImageAdapter";
import { tMain } from "../../../i18n";

const adapters: ImageProviderAdapter[] = [
  dashscopeImageAdapter,
  minimaxImageAdapter,
  zhipuImageAdapter,
  doubaoImageAdapter,
  aiSdkImageAdapter,
];

export function resolveImageProviderAdapter(resolved: ResolvedImageModel): ImageProviderAdapter {
  const found = adapters.find((item) => item.canHandle(resolved));
  if (!found) {
    throw new Error(tMain("image.adapterNotFound", {
      providerId: resolved.providerId,
      modelId: resolved.modelId
    }));
  }
  return found;
}
