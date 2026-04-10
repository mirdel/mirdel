import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";

export interface ParsedSkillMd {
  name: string;
  description: string;
  bodyMarkdown: string;
}

/**
 * 解析 SKILL.md：使用 gray-matter 解析 YAML frontmatter + body
 */
export function parseSkillMd(filePath: string): ParsedSkillMd | null {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
  let parsed: { data: Record<string, unknown>; content: string };
  try {
    parsed = matter(raw);
  } catch {
    return null;
  }
  const data = parsed.data as Record<string, unknown>;
  const name = typeof data.name === "string" ? data.name.trim() : path.basename(path.dirname(filePath));
  const description = typeof data.description === "string" ? data.description.trim() : "";
  return {
    name,
    description,
    bodyMarkdown: parsed.content.trim(),
  };
}
