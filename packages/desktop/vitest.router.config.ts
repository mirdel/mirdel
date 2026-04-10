import { defineConfig, mergeConfig } from "vitest/config";
import { baseVitestConfig } from "./vitest.config.base";

export default mergeConfig(baseVitestConfig, defineConfig({
  test: {
    include: [
      "src/main/ipc/**/__tests__/**/*.spec.ts",
    ],
  },
}));
