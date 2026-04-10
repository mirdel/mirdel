import { defineConfig, mergeConfig } from "vitest/config";
import { baseVitestConfig } from "./vitest.config.base";

export default mergeConfig(baseVitestConfig, defineConfig({
  test: {
    include: [
      "src/main/services/**/__tests__/**/*.spec.ts",
    ],
    exclude: [
      "src/main/services/**/__tests__/*Data*.spec.ts",
      "src/main/services/chat/__tests__/messageData.spec.ts",
      "src/main/services/chat/__tests__/projectData.spec.ts",
      "src/main/services/chat/__tests__/sessionData*.spec.ts",
    ],
  },
}));
