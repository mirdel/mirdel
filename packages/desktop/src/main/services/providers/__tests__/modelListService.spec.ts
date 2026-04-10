import { beforeAll, describe, expect, it } from "vitest";
import { getModels, initializeConfigManager } from "../../models/ConfigManager";
import {
  addModelToCommon,
  getCommonModels,
  getModelFromCatalog,
  getModelOverride,
  removeModelFromCommon,
  resetModelToDefault,
  upsertModelOverride,
} from "../modelListService";
import { useTestDb } from "../../../../../test/helpers/testDb";

describe("modelListService", () => {
  useTestDb("model-list-service");

  beforeAll(async () => {
    await initializeConfigManager();
  });

  it("keeps hidden built-in models out of the common list until they are explicitly added", () => {
    const googleModels = getModels("google");

    expect(getCommonModels("google", googleModels).map((model) => model.id)).not.toContain(
      "imagen-4.0-generate-001"
    );

    const added = addModelToCommon("google", "imagen-4.0-generate-001");

    expect(added.model).toMatchObject({
      id: "imagen-4.0-generate-001",
      modelType: "generative",
      inputModalities: ["text"],
      outputModalities: ["image"],
      imageTasks: ["text_to_image"],
    });
    expect(getCommonModels("google", googleModels).map((model) => model.id)).toContain(
      "imagen-4.0-generate-001"
    );
  });

  it("copies base configuration for snapshot-like model ids", () => {
    const result = addModelToCommon("openai", "gpt-5-2025-08-07");

    expect(result.copiedFromBase).toBe(true);
    expect(result.baseModelId).toBe("gpt-5");
    expect(result.model).toMatchObject({
      id: "gpt-5-2025-08-07",
      modelType: "generative",
      inputModalities: ["text"],
      outputModalities: ["text"],
      nativeWebSearch: false,
    });
    expect(result.model.thinking).toBeTruthy();
    expect(getModelOverride("openai", "gpt-5-2025-08-07")).not.toBeNull();
  });

  it("removes built-in models from the common list and infers defaults for custom text models", () => {
    const openaiModels = getModels("openai");

    removeModelFromCommon("openai", "gpt-5");
    const added = addModelToCommon("openai", "team-reasoner");

    expect(added.model).toMatchObject({
      id: "team-reasoner",
      modelType: "generative",
      inputModalities: ["text"],
      outputModalities: ["text"],
      nativeWebSearch: true,
    });

    const commonModels = getCommonModels("openai", openaiModels);
    expect(commonModels.map((model) => model.id)).not.toContain("gpt-5");
    expect(commonModels.map((model) => model.id)).toContain("team-reasoner");
  });

  it("resets built-in models back to catalog defaults after local overrides", () => {
    upsertModelOverride("openai", "gpt-5", {
      type: "generative",
      detailsJson: JSON.stringify({
        nativeWebSearch: true,
        inputModalities: ["text", "image"],
      }),
    });

    expect(getModelFromCatalog("openai", "gpt-5", getModels("openai"))).toMatchObject({
      id: "gpt-5",
      nativeWebSearch: true,
      inputModalities: ["text", "image"],
    });

    const reset = resetModelToDefault("openai", "gpt-5");

    expect(reset).toMatchObject({
      id: "gpt-5",
      modelType: "generative",
      nativeWebSearch: false,
      inputModalities: ["text"],
      outputModalities: ["text"],
    });
    expect(getModelOverride("openai", "gpt-5")).toBeNull();
  });
});
