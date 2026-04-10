/**
 * 轻应用用 LLM：主进程侧实现，供子进程通过 IPC 请求。
 * 仅接受显式模型 ID（providerId::modelId），支持 generateText / streamText，参数与 AI SDK 对齐。
 */
import { generateText, streamText } from "ai";
import { resolveModelInvocation } from "../providers/modelInvocation";
import { loggerServiceMain } from "@shared";
import type { AppletLlmParams, AppletLlmMessage } from "@mirdel/applet-core";
import { tMain } from "../../i18n";
import { LOCAL_PROVIDER_ID } from "../providers/localModelConstants";
import { localModelRuntimeService } from "../model-server/localModelRuntimeService";

const logger = loggerServiceMain.withContext("appletLlm");

async function getModelClient(modelOverride: string): Promise<{
  modelId: string;
  client: ReturnType<typeof resolveModelInvocation>["client"];
}> {
  const rawModel = String(modelOverride || "").trim();
  const sep = rawModel.indexOf("::");
  if (!rawModel || sep <= 0 || sep >= rawModel.length - 2) {
    throw new Error(tMain("applet.invalidModelFormat", { model: rawModel || "(empty)" }));
  }
  const providerId = rawModel.slice(0, sep);
  const modelId = rawModel.slice(sep + 2);

  if (providerId === LOCAL_PROVIDER_ID) {
    await localModelRuntimeService.ensureModelReady(modelId);
  }

  const { client } = resolveModelInvocation({ providerId, modelId });
  return { modelId, client };
}

function buildMessages(params: AppletLlmParams): AppletLlmMessage[] {
  if (params.messages && params.messages.length > 0) {
    return params.messages;
  }
  if (params.prompt != null && params.prompt !== "") {
    return [{ role: "user", content: params.prompt }];
  }
  throw new Error(tMain("applet.promptOrMessagesRequired"));
}

function toAiSdkMessages(msgs: AppletLlmMessage[]): Array<{ role: "user" | "assistant" | "system"; content: string }> {
  return msgs.map((m) => ({ role: m.role, content: m.content }));
}

export type AppletLlmGenerateTextParams = AppletLlmParams & { abortSignal?: AbortSignal };

export async function appletLlmGenerateText(params: AppletLlmGenerateTextParams): Promise<string> {
  const { model, system, temperature, maxOutputTokens, abortSignal } = params;
  const messages = buildMessages(params);
  const { modelId, client } = await getModelClient(model);
  const { text } = await generateText({
    model: client(modelId),
    messages: toAiSdkMessages(messages),
    system: system ?? undefined,
    temperature: temperature ?? 0.7,
    maxOutputTokens: maxOutputTokens ?? 4096,
    abortSignal,
  });
  return text;
}

export type AppletLlmStreamTextParams = AppletLlmParams & {
  key?: string;
  statePath: string;
  onDelta?: (chunk: string) => void;
  abortSignal?: AbortSignal;
};

/** 流式生成并写入 state 路径 */
export async function appletLlmStreamText(params: AppletLlmStreamTextParams): Promise<string> {
  const { model, system, temperature, maxOutputTokens, onDelta, abortSignal } = params;
  const messages = buildMessages(params);
  const { modelId, client } = await getModelClient(model);
  const stream = streamText({
    model: client(modelId),
    messages: toAiSdkMessages(messages),
    system: system ?? undefined,
    temperature: temperature ?? 0.7,
    maxOutputTokens: maxOutputTokens ?? 4096,
    abortSignal,
  });
  let full = "";
  for await (const part of stream.fullStream) {
    if (part.type === "text-delta" && part.text) {
      full += part.text;
      onDelta?.(part.text);
    }
  }
  return full;
}
