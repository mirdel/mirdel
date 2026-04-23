import fs from "node:fs/promises";
import path from "node:path";
import { app } from "electron";
import { loggerServiceMain } from "@shared";
import {
  getLastSeenReleaseNotesVersion,
  setLastSeenReleaseNotesVersion,
} from "../settings/settingsData";

const logger = loggerServiceMain.withContext("changelog");

export type ChangelogSection = {
  title: string;
  items: string[];
};

export type ChangelogVersion = {
  version: string;
  date: string | null;
  sections: ChangelogSection[];
};

export type PendingReleaseNotes = {
  version: string;
  notes: ChangelogVersion | null;
};

function getDesktopDir() {
  return path.resolve(__dirname, "../..");
}

function getRepoRoot() {
  return path.resolve(getDesktopDir(), "../..");
}

function getPackagedReleaseNotesDir() {
  return path.join(process.resourcesPath, "release-notes");
}

function getChangelogFileName(locale?: string) {
  const normalizedLocale = String(locale || "").toLowerCase();
  if (normalizedLocale === "zh-cn" || normalizedLocale === "zh-tw") {
    return "CHANGELOG.zh-CN.md";
  }
  return "CHANGELOG.md";
}

async function readChangelogMarkdown(locale?: string) {
  const fileName = getChangelogFileName(locale);
  const candidates = app.isPackaged
    ? [
        path.join(getPackagedReleaseNotesDir(), fileName),
        path.join(getPackagedReleaseNotesDir(), "CHANGELOG.md"),
      ]
    : [
        path.join(getRepoRoot(), fileName),
        path.join(getRepoRoot(), "CHANGELOG.md"),
      ];

  for (const candidate of candidates) {
    try {
      return await fs.readFile(candidate, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") {
        logger.warn("failed to read changelog", { filePath: candidate, error });
      }
    }
  }

  return "";
}

function parseVersionHeading(line: string) {
  const match = line.match(/^##\s+(.+?)\s*$/);
  if (!match) return null;

  const title = match[1].trim();
  const versionMatch = title.match(/^(.+?)\s+-\s+(.+)$/);
  if (!versionMatch) {
    return { version: title, date: null };
  }

  return {
    version: versionMatch[1].trim(),
    date: versionMatch[2].trim(),
  };
}

function parseChangelog(markdown: string): ChangelogVersion[] {
  const versions: ChangelogVersion[] = [];
  let currentVersion: ChangelogVersion | null = null;
  let currentSection: ChangelogSection | null = null;

  for (const rawLine of markdown.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    const versionHeading = parseVersionHeading(line);
    if (versionHeading) {
      currentVersion = {
        version: versionHeading.version,
        date: versionHeading.date,
        sections: [],
      };
      versions.push(currentVersion);
      currentSection = null;
      continue;
    }

    const sectionMatch = line.match(/^###\s+(.+?)\s*$/);
    if (sectionMatch && currentVersion) {
      currentSection = {
        title: sectionMatch[1].trim(),
        items: [],
      };
      currentVersion.sections.push(currentSection);
      continue;
    }

    const bulletMatch = line.match(/^-\s+(.+?)\s*$/);
    if (bulletMatch && currentSection) {
      currentSection.items.push(bulletMatch[1].trim());
    }
  }

  return versions.filter((version) => version.version && !/unreleased/i.test(version.date || ""));
}

function compareVersions(a: string, b: string) {
  const parse = (value: string) =>
    value
      .replace(/^v/i, "")
      .split(/[.-]/)
      .map((part) => Number.parseInt(part, 10))
      .map((part) => (Number.isFinite(part) ? part : 0));
  const left = parse(a);
  const right = parse(b);
  const length = Math.max(left.length, right.length);

  for (let index = 0; index < length; index += 1) {
    const diff = (left[index] || 0) - (right[index] || 0);
    if (diff !== 0) return diff;
  }

  return 0;
}

export async function getChangelog(locale?: string): Promise<ChangelogVersion[]> {
  const markdown = await readChangelogMarkdown(locale);
  return parseChangelog(markdown);
}

export async function getPendingReleaseNotes(locale?: string): Promise<PendingReleaseNotes | null> {
  const currentVersion = app.getVersion();
  const lastSeenVersion = getLastSeenReleaseNotesVersion();

  if (!lastSeenVersion) {
    setLastSeenReleaseNotesVersion(currentVersion);
    return null;
  }

  if (compareVersions(currentVersion, lastSeenVersion) <= 0) {
    return null;
  }

  const changelog = await getChangelog(locale);
  return {
    version: currentVersion,
    notes: changelog.find((entry) => entry.version === currentVersion) || null,
  };
}

export function markReleaseNotesSeen(version?: string) {
  setLastSeenReleaseNotesVersion(version || app.getVersion());
  return { ok: true };
}
