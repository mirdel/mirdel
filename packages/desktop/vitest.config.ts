import { defineConfig, mergeConfig } from "vitest/config";
import { baseVitestConfig } from "./vitest.config.base";

export default mergeConfig(baseVitestConfig, defineConfig({
  test: {
    include: [
      "src/**/*.spec.ts",
      "src/**/*.test.ts",
      "test/**/*.spec.ts",
      "test/**/*.test.ts",
    ],
  },
}));
