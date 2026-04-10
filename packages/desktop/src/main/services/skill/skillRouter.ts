/**
 * 技能路由：根据用户消息与已安装技能列表，用轻量模型选出 0 或 1 个技能 id
 */
import { generateText, type ModelMessage } from "ai";
import { getDefaultModelByType } from "../settings/settingsData";
import { loggerServiceMain } from "@shared";
import type { SkillItem } from "@shared";
import { listSkills } from "./skillData";
import { resolveModelInvocation } from "../providers/modelInvocation";

const logger = loggerServiceMain.withContext("skillRouter");

const ROUTER_TIMEOUT_MS = 15_000;

/**
 * 根据对话上下文和已安装技能列表，调用轻量模型选出最匹配的一个技能 id，或不选
 * @param contextForRouter 对话上下文：可为「上一条助手回复（末尾）+ 用户消息」或仅用户消息
 * @returns skill_id 或 null；无技能、无可用模型、解析失败时返回 null
 */
export async function routeSkill(contextForRouter: string): Promise<string | null> {
  const skills = listSkills();
  if (skills.length === 0) {
    return null;
  }

  const modelRef = getDefaultModelByType("fast") ?? getDefaultModelByType("general");
  if (!modelRef?.providerId || !modelRef?.modelId) {
    logger.info("skillRouter: no fast/general model configured, skip routing");
    return null;
  }

  let client: ReturnType<typeof resolveModelInvocation>["client"];
  try {
    client = resolveModelInvocation({
      providerId: modelRef.providerId,
      modelId: modelRef.modelId,
    }).client;
  } catch (error) {
    logger.info("skillRouter: router model unavailable, skip routing", {
      providerId: modelRef.providerId,
      modelId: modelRef.modelId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }

  const skillListText = skills
    .map((s: SkillItem) => `- id: ${s.id}\n  name: ${s.name}\n  description: ${(s.description ?? "").trim() || "(none)"}`)
    .join("\n");

  // Internal routing prompt: keep in English to avoid locale-specific parsing drift.
  const systemPrompt = `You are a skill router.
Given the conversation context (which may include the tail of the previous assistant reply plus the current user message), choose at most one best-matching skill from the installed skill list.
If the user is confirming or continuing a previous answer (for example "let's do option 2"), use the assistant context to infer which skill was being discussed.

Rules:
- Output a skill id only when the user's intent clearly matches a skill's description or purpose.
- If there is no clear match, or the user is just chatting / asking a general question, output exactly: NULL
- Output only one skill id or NULL. No explanation, no markdown, no extra text.`;

  const userContent = `Conversation Context:\n${(contextForRouter ?? "").trim().slice(0, 2500)}\n\nInstalled Skills:\n${skillListText}`;

  const messages: ModelMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent },
  ];

  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), ROUTER_TIMEOUT_MS);

  try {
    const { text } = await generateText({
      model: client(modelRef.modelId),
      messages,
      temperature: 0,
      maxOutputTokens: 64,
      abortSignal: abort.signal,
    });
    clearTimeout(timer);
    const raw = (text ?? "").trim().toUpperCase();
    if (raw === "NULL" || !raw) {
      return null;
    }
    let id = (text ?? "").trim();
    let found = skills.some((s) => s.id === id);
    if (!found && id.length > 0) {
      const match = id.match(/(?:system|public)\/[^\s\]\[]+/);
      if (match) {
        const extracted = match[0].trim();
        if (skills.some((s) => s.id === extracted)) {
          id = extracted;
          found = true;
        }
      }
    }
    if (found) {
      logger.info("skillRouter: selected skill", { skillId: id });
      return id;
    }
    logger.info("skillRouter: model output not a valid skill id, ignoring", { raw: text });
    return null;
  } catch (err) {
    clearTimeout(timer);
    logger.warn("skillRouter: routing failed", { error: String(err) });
    return null;
  }
}
