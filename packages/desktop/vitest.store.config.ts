import { defineConfig, mergeConfig } from "vitest/config";
import { baseVitestConfig } from "./vitest.config.base";

export default mergeConfig(baseVitestConfig, defineConfig({
  test: {
    include: [
      "src/renderer/stores/**/__tests__/**/*.spec.ts",
      "src/renderer/components/**/__tests__/**/*.spec.ts",
      "src/renderer/composables/**/__tests__/**/*.spec.ts",
      "src/renderer/views/**/__tests__/**/*.spec.ts",
    ],
  },
}));
