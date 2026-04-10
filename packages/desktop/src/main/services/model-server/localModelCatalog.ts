import catalogJson from "./localModelCatalog.json";

export type LocalModelType = "embedding" | "generative" | "rerank";

export type LocalModelResourceRequirements = {
  minRamBytes?: number;
  recommendedRamBytes?: number;
};

export type LocalModelExtraFile = {
  fileName: string;
  sha256: string;
  sizeBytes?: number;
  downloadUrls: string[];
};

export type LocalModelCatalogEntry = {
  id: string;
  name: string;
  modelType: LocalModelType;
  fileName: string;
  sha256: string;
  sizeBytes?: number;
  projector?: LocalModelExtraFile;
  resourceRequirements?: LocalModelResourceRequirements;
  downloadUrls: string[];
};

type LocalModelCatalogFile = {
  version: number;
  models: LocalModelCatalogEntry[];
};

const catalog = catalogJson as LocalModelCatalogFile;

function normalizeCatalogEntry(entry: LocalModelCatalogEntry): LocalModelCatalogEntry {
  const normalizedMinRamBytes = normalizePositiveNumber(entry.resourceRequirements?.minRamBytes);
  const normalizedRecommendedRamBytes = normalizePositiveNumber(entry.resourceRequirements?.recommendedRamBytes);

  const resolvedMinRamBytes = normalizedMinRamBytes;
  const resolvedRecommendedRamBytes = normalizedRecommendedRamBytes && resolvedMinRamBytes
    ? Math.max(normalizedRecommendedRamBytes, resolvedMinRamBytes)
    : normalizedRecommendedRamBytes;

  const resourceRequirements = resolvedMinRamBytes || resolvedRecommendedRamBytes
    ? {
        ...(resolvedMinRamBytes ? { minRamBytes: resolvedMinRamBytes } : {}),
        ...(resolvedRecommendedRamBytes ? { recommendedRamBytes: resolvedRecommendedRamBytes } : {}),
      }
    : undefined;

  const projector = normalizeExtraFile(entry.projector);

  return {
    ...entry,
    id: String(entry.id || "").trim(),
    name: String(entry.name || "").trim(),
    modelType: entry.modelType,
    fileName: String(entry.fileName || "").trim(),
    sha256: String(entry.sha256 || "").trim().toLowerCase(),
    sizeBytes: typeof entry.sizeBytes === "number" && Number.isFinite(entry.sizeBytes) ? entry.sizeBytes : undefined,
    projector,
    resourceRequirements,
    downloadUrls: Array.isArray(entry.downloadUrls)
      ? entry.downloadUrls
          .map((url) => String(url || "").trim())
          .filter((url) => url.length > 0)
      : [],
  };
}

const modelList = (catalog.models || []).map(normalizeCatalogEntry).filter((entry) => (
  entry.id && entry.name && entry.fileName && entry.sha256 && entry.downloadUrls.length > 0
));

const modelMap = new Map(modelList.map((entry) => [entry.id, entry]));

export function listLocalModelCatalog(): LocalModelCatalogEntry[] {
  return modelList.map((entry) => ({
    ...entry,
    projector: entry.projector
      ? { ...entry.projector, downloadUrls: [...entry.projector.downloadUrls] }
      : undefined,
    resourceRequirements: entry.resourceRequirements ? { ...entry.resourceRequirements } : undefined,
    downloadUrls: [...entry.downloadUrls],
  }));
}

export function getLocalModelCatalogEntry(modelId: string): LocalModelCatalogEntry | null {
  const key = String(modelId || "").trim();
  if (!key) return null;
  const entry = modelMap.get(key);
  if (!entry) return null;
  return {
    ...entry,
    projector: entry.projector
      ? { ...entry.projector, downloadUrls: [...entry.projector.downloadUrls] }
      : undefined,
    resourceRequirements: entry.resourceRequirements ? { ...entry.resourceRequirements } : undefined,
    downloadUrls: [...entry.downloadUrls],
  };
}

function normalizePositiveNumber(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }
  return Math.round(value);
}

function normalizeExtraFile(value: unknown): LocalModelExtraFile | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const raw = value as Partial<LocalModelExtraFile>;
  const fileName = String(raw.fileName || "").trim();
  const sha256 = String(raw.sha256 || "").trim().toLowerCase();
  const downloadUrls = Array.isArray(raw.downloadUrls)
    ? raw.downloadUrls.map((url) => String(url || "").trim()).filter((url) => url.length > 0)
    : [];
  const sizeBytes = normalizePositiveNumber(raw.sizeBytes);

  if (!fileName || !sha256 || downloadUrls.length === 0) {
    return undefined;
  }

  return {
    fileName,
    sha256,
    sizeBytes,
    downloadUrls,
  };
}
