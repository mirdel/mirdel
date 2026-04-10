import path from "node:path";
import { defineConfig } from "vitest/config";

const rootDir = __dirname;

export const baseVitestConfig = defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(rootDir, "src/renderer"),
      "@shared": path.resolve(rootDir, "../shared/src/index.ts"),
      "@mirdel/markdown-to-plain": path.resolve(rootDir, "../markdown-to-plain/src/index.ts"),
      "@mirdel/tts-edge": path.resolve(rootDir, "../tts-edge/src/index.ts"),
      "@mirdel/applet-core": path.resolve(rootDir, "../applet-core/src/index.ts"),
    },
  },
  test: {
    globals: true,
    environment: "node",
    environmentMatchGlobs: [
      ["src/renderer/**/*.spec.ts", "jsdom"],
      ["src/renderer/**/*.test.ts", "jsdom"],
    ],
    setupFiles: ["./test/setup/index.ts"],
    restoreMocks: true,
    clearMocks: true,
    mockReset: false,
    testTimeout: 15000,
  },
});
