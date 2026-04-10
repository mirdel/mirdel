import type { SearchProvider } from "../types";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createCustomEngineMock,
  currentConfig,
  embedManyMock,
  embedMock,
  fetchPageMock,
  generateSearchPlanMock,
  getActiveProviderMock,
  getAppLanguagePreferenceMock,
  getDefaultModelByTypeMock,
  getSearchProviderMock,
  resolveAppLocaleMock,
  resolveModelInvocationMock,
  searxngSearchMock,
  setWebSearchConfigMock,
  listBuiltinSearchEnginesMock,
  tMainMock,
} = vi.hoisted(() => ({
  createCustomEngineMock: vi.fn(),
  currentConfig: {
    resultLimit: 3,
    selectedEngines: ["google", "bing"],
    timeRange: "month",
    safeSearch: 2,
    searchTimeout: 7,
    fetchTimeout: 5,
    pagePoolSize: 5,
    processMode: "truncate",
    embeddingModel: "__default__",
    embeddingDimension: null,
    ragTopN: 8,
    contentMaxLength: 12,
  },
  embedManyMock: vi.fn(),
  embedMock: vi.fn(),
  fetchPageMock: vi.fn(),
  generateSearchPlanMock: vi.fn(),
  getActiveProviderMock: vi.fn(),
  getAppLanguagePreferenceMock: vi.fn(),
  getDefaultModelByTypeMock: vi.fn(),
  getSearchProviderMock: vi.fn(),
  resolveAppLocaleMock: vi.fn(),
  resolveModelInvocationMock: vi.fn(),
  searxngSearchMock: vi.fn(),
  setWebSearchConfigMock: vi.fn((patch: Record<string, unknown>) => Object.assign({}, patch)),
  listBuiltinSearchEnginesMock: vi.fn(),
  tMainMock: vi.fn((key: string, params?: Record<string, unknown>) =>
    params ? `${key}:${JSON.stringify(params)}` : key
  ),
}));

vi.mock("../engines/SearxngEngine", () => ({
  searxngEngine: {
    search: searxngSearchMock,
    listWebSearchEngines: listBuiltinSearchEnginesMock,
  },
}));

vi.mock("../engines/CustomEngine", () => ({
  createCustomEngine: createCustomEngineMock,
}));

vi.mock("../PageFetcher", () => ({
  fetchPageContent: fetchPageMock,
}));

vi.mock("../webSearchData", () => ({
  DEFAULT_SELECTED_ENGINES: ["google", "bing", "duckduckgo", "baidu", "360search", "quark"],
  DEFAULT_WEB_SEARCH_CONFIG: currentConfig,
  ensureWebSearchConfig: vi.fn(() => currentConfig),
  getSearchProvider: getSearchProviderMock,
  getActiveProvider: getActiveProviderMock,
  setWebSearchConfig: setWebSearchConfigMock,
}));

vi.mock("../../settings/settingsData", () => ({
  getDefaultModelByType: getDefaultModelByTypeMock,
  getAppLanguagePreference: getAppLanguagePreferenceMock,
}));

vi.mock("../../providers/llmProviderFactory", () => ({
  getEmbeddingModel: vi.fn((client: unknown, modelId: string) => ({ client, modelId })),
}));

vi.mock("../../providers/modelInvocation", () => ({
  resolveModelInvocation: resolveModelInvocationMock,
}));

vi.mock("../searchPlannerService", () => ({
  generateSearchPlan: generateSearchPlanMock,
}));

vi.mock("ai", () => ({
  embed: embedMock,
  embedMany: embedManyMock,
}));

vi.mock("electron", () => ({
  app: {
    getPath: vi.fn(() => "/tmp/ai-client-x-vitest"),
    getAppPath: vi.fn(() => process.cwd()),
    getLocale: vi.fn(() => "zh-CN"),
  },
}));

vi.mock("@shared", () => ({
  loggerServiceMain: {
    withContext: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  },
  resolveAppLocale: resolveAppLocaleMock,
}));

vi.mock("../../../i18n", () => ({
  tMain: tMainMock,
}));

import { webSearchService } from "../WebSearchService";

function createProvider(overrides: Partial<SearchProvider> = {}): SearchProvider {
  return {
    id: "provider-1",
    type: "preset",
    name: "Remote Search",
    enabled: true,
    createdAt: 1,
    updatedAt: 1,
    presetId: "preset-1",
    apiKey: "secret",
    params: {},
    ...overrides,
  };
}

describe("WebSearchService", () => {
  beforeEach(() => {
    currentConfig.resultLimit = 3;
    currentConfig.selectedEngines = ["google", "bing"];
    currentConfig.timeRange = "month";
    currentConfig.safeSearch = 2;
    currentConfig.searchTimeout = 7;
    currentConfig.fetchTimeout = 5;
    currentConfig.pagePoolSize = 5;
    currentConfig.processMode = "truncate";
    currentConfig.embeddingModel = "__default__";
    currentConfig.embeddingDimension = null;
    currentConfig.ragTopN = 8;
    currentConfig.contentMaxLength = 12;

    searxngSearchMock.mockReset();
    listBuiltinSearchEnginesMock.mockReset();
    createCustomEngineMock.mockReset();
    fetchPageMock.mockReset();
    generateSearchPlanMock.mockReset();
    getActiveProviderMock.mockReset();
    getSearchProviderMock.mockReset();
    getAppLanguagePreferenceMock.mockReset();
    getDefaultModelByTypeMock.mockReset();
    resolveAppLocaleMock.mockReset();
    resolveModelInvocationMock.mockReset();
    setWebSearchConfigMock.mockClear();
    embedMock.mockReset();
    embedManyMock.mockReset();
    tMainMock.mockClear();

    getAppLanguagePreferenceMock.mockReturnValue("system");
    getDefaultModelByTypeMock.mockReturnValue({
      providerId: "mock",
      modelId: "embedding-model",
    });
    resolveAppLocaleMock.mockReturnValue("zh-CN");
    resolveModelInvocationMock.mockReturnValue({
      client: vi.fn(),
    });
    getActiveProviderMock.mockReturnValue(undefined);
    getSearchProviderMock.mockReturnValue(undefined);
    listBuiltinSearchEnginesMock.mockResolvedValue([
      { name: "google", categories: ["general"], enabled: true },
      { name: "bing", categories: ["general"], enabled: true },
    ]);
  });

  it("uses builtin searxng search with normalized locale and config options", async () => {
    searxngSearchMock.mockResolvedValue([
      { title: "Release Checklist", url: "https://example.com/release" },
    ]);

    const result = await webSearchService.search("release checklist", 2);

    expect(searxngSearchMock).toHaveBeenCalledWith("release checklist", 2, {
      language: "zh-CN",
      timeRange: "month",
      safeSearch: 2,
      engines: ["google", "bing"],
    });
    expect(result).toEqual({
      success: true,
      source: "searxng",
      results: [{ title: "Release Checklist", url: "https://example.com/release" }],
    });
  });

  it("returns a translated error when builtin search throws", async () => {
    searxngSearchMock.mockRejectedValue(new Error("network down"));

    await expect(webSearchService.search("status page")).resolves.toEqual({
      success: false,
      error: 'search.searchFailed:{"message":"network down"}',
    });
  });

  it("fetches builtin search results, truncates long content, and preserves fetch failures", async () => {
    currentConfig.contentMaxLength = 10;
    searxngSearchMock.mockResolvedValue([
      { title: "Alpha", url: "https://example.com/a" },
      { title: "Beta", url: "https://example.com/b" },
    ]);
    fetchPageMock.mockImplementation(async (url: string) => {
      if (url.endsWith("/a")) {
        return {
          title: "Alpha Page",
          realUrl: "https://example.com/a?ref=1",
          content: "0123456789ABCDE",
          byline: "Sky",
          siteName: "Example",
          publishedDate: "2026-04-09",
        };
      }
      throw new Error("fetch timeout");
    });

    const result = await webSearchService.searchWithContent("release");

    expect(fetchPageMock).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      success: true,
      source: "searxng",
      processMode: "truncate",
      searchDuration: expect.any(Number),
      duration: expect.any(Number),
      results: [
        {
          title: "Alpha Page",
          url: "https://example.com/a",
          realUrl: "https://example.com/a?ref=1",
          content: "0123456789",
          truncated: true,
          byline: "Sky",
          siteName: "Example",
          publishedDate: "2026-04-09",
          fetchSuccess: true,
          fetchDuration: expect.any(Number),
        },
        {
          title: "Beta",
          url: "https://example.com/b",
          content: "",
          truncated: false,
          fetchSuccess: false,
          fetchError: "fetch timeout",
          fetchDuration: expect.any(Number),
        },
      ],
      ragStats: undefined,
    });
  });

  it("uses third-party search content directly without fetching pages again", async () => {
    const provider = createProvider({ id: "remote", name: "Acme Search" });
    getActiveProviderMock.mockReturnValue(provider);
    createCustomEngineMock.mockReturnValue({
      supportsContent: true,
      searchWithContent: vi.fn().mockResolvedValue([
        {
          title: "Remote Hit",
          url: "https://remote.test/article",
          content: "Remote full content",
        },
      ]),
    });

    const result = await webSearchService.searchWithContent("deep research");

    expect(fetchPageMock).not.toHaveBeenCalled();
    expect(result).toEqual({
      success: true,
      source: "Acme Search",
      processMode: "truncate",
      searchDuration: expect.any(Number),
      duration: expect.any(Number),
      results: [
        {
          title: "Remote Hit",
          url: "https://remote.test/article",
          content: "Remote full ",
          truncated: true,
          fetchSuccess: true,
          fetchDuration: 0,
        },
      ],
      ragStats: undefined,
    });
  });

  it("returns planner errors for request-based search before any fetch starts", async () => {
    generateSearchPlanMock.mockResolvedValue({
      ok: false,
      error: "planner unavailable",
    });

    await expect(webSearchService.searchByRequest("find release blockers")).resolves.toEqual({
      success: false,
      error: "planner unavailable",
    });
    expect(searxngSearchMock).not.toHaveBeenCalled();
    expect(fetchPageMock).not.toHaveBeenCalled();
  });

  it("dedupes planned-query results by normalized url and fetches only missing content", async () => {
    generateSearchPlanMock.mockResolvedValue({
      ok: true,
      data: {
        queries: ["release checklist", "deployment runbook"],
        plannerModel: "mock::fast",
      },
    });
    searxngSearchMock
      .mockResolvedValueOnce([
        {
          title: "Release Guide",
          url: "https://example.com/release?utm_source=newsletter",
          content: "direct result content",
        },
        {
          title: "Missing Content",
          url: "https://example.com/deploy",
        },
      ])
      .mockResolvedValueOnce([
        {
          title: "Release Guide Duplicate",
          url: "https://example.com/release",
        },
      ]);
    fetchPageMock.mockResolvedValue({
      title: "Deploy Page",
      realUrl: "https://example.com/deploy",
      content: "deployment steps",
    });

    const result = await webSearchService.searchByRequest("prepare the release");

    expect(searxngSearchMock).toHaveBeenCalledTimes(2);
    expect(fetchPageMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        source: "searxng",
        processMode: "truncate",
        searchDuration: expect.any(Number),
        duration: expect.any(Number),
        ragStats: undefined,
        results: [
          expect.objectContaining({
            title: "Release Guide",
            url: "https://example.com/release",
            content: "direct resul",
            truncated: true,
            fetchSuccess: true,
            fetchDuration: 0,
          }),
          expect.objectContaining({
            title: "Deploy Page",
            url: "https://example.com/deploy",
            realUrl: "https://example.com/deploy",
            content: "deployment s",
            truncated: true,
            fetchSuccess: true,
            fetchDuration: expect.any(Number),
          }),
        ],
        plan: {
          request: "prepare the release",
          queries: [
            { query: "release checklist", resultCount: 2 },
            { query: "deployment runbook", resultCount: 1 },
          ],
          plannerModel: "mock::fast",
          rawResultCount: 3,
          uniqueUrlCount: 2,
          fetchedCount: 2,
        },
      })
    );
  });

  it("wraps page fetch failures in a user-facing error", async () => {
    fetchPageMock.mockRejectedValue(new Error("403 forbidden"));

    await expect(webSearchService.fetchPageContent("https://example.com/private")).resolves.toEqual({
      success: false,
      url: "https://example.com/private",
      error: 'search.fetchPageFailed:{"message":"403 forbidden"}',
    });
  });
});
