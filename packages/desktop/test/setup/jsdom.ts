import { afterEach, beforeEach, vi } from "vitest";

if (typeof window !== "undefined") {
  beforeEach(() => {
    (globalThis as any).useToast = () => ({
      add: vi.fn(),
    });

    Object.defineProperty(window, "log", {
      configurable: true,
      writable: true,
      value: { send: vi.fn() },
    });
    Object.defineProperty(window, "ipc", {
      configurable: true,
      writable: true,
      value: vi.fn(async () => null),
    });
    Object.defineProperty(window, "chat", {
      configurable: true,
      writable: true,
      value: {
        onStream: vi.fn(() => () => {}),
        onTemporarySessionsDeleted: vi.fn(() => () => {}),
      },
    });
  });

  afterEach(() => {
    window.localStorage.clear();
  });
}
