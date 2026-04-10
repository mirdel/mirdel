import { tMain } from "../../../i18n";
import { aiSdkVideoAdapter } from "./aiSdkVideoAdapter";
import { zhipuVideoAdapter } from "./zhipuVideoAdapter";
import type { ResolvedVideoModel, VideoProviderAdapter } from "./types";

const adapters: VideoProviderAdapter[] = [zhipuVideoAdapter, aiSdkVideoAdapter];

export function resolveVideoProviderAdapter(resolved: ResolvedVideoModel): VideoProviderAdapter {
  const found = adapters.find((item) => item.canHandle(resolved));
  if (!found) {
    throw new Error(tMain("video.adapterNotFound", {
      providerId: resolved.providerId,
      modelId: resolved.modelId,
    }));
  }
  return found;
}
