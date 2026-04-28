import { onScopeDispose, ref, watch, type Ref } from "vue";

type PersistentStateListener = (value: unknown, removed?: boolean) => void;

const values = new Map<string, unknown>();
const listeners = new Map<string, Set<PersistentStateListener>>();
let initialized = false;
let initPromise: Promise<void> | null = null;
let stopChangedListener: (() => void) | null = null;

function hasIpc() {
  return typeof window !== "undefined" && typeof window.ipc === "function";
}

function hasRendererStateIpc() {
  return hasIpc() && typeof window.rendererState?.onChanged === "function";
}

function normalizeStoredValue<T>(value: unknown, fallback: T): T {
  if (typeof value === "undefined") return fallback;
  return value as T;
}

function notifyListeners(key: string, value: unknown, removed?: boolean) {
  const set = listeners.get(key);
  if (!set) return;
  for (const listener of set) {
    listener(value, removed);
  }
}

function subscribePersistentState(key: string, listener: PersistentStateListener) {
  const set = listeners.get(key) ?? new Set<PersistentStateListener>();
  set.add(listener);
  listeners.set(key, set);
  return () => {
    set.delete(listener);
    if (set.size === 0) listeners.delete(key);
  };
}

export async function initPersistentState() {
  if (initialized) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    if (hasRendererStateIpc()) {
      const snapshot = await window.ipc("rendererState:getAll");
      for (const [key, value] of Object.entries(snapshot)) {
        values.set(key, value);
      }
      stopChangedListener = window.rendererState?.onChanged?.((event) => {
        if (event.removed) {
          values.delete(event.key);
          notifyListeners(event.key, undefined, true);
          return;
        }
        values.set(event.key, event.value);
        notifyListeners(event.key, event.value);
      }) ?? null;
    }
    initialized = true;
  })().finally(() => {
    initPromise = null;
  });

  return initPromise;
}

export function getPersistentValue<T>(key: string, fallback: T): T {
  if (values.has(key)) {
    return normalizeStoredValue(values.get(key), fallback);
  }
  return fallback;
}

export async function setPersistentValue(key: string, value: unknown): Promise<void> {
  values.set(key, value);
  notifyListeners(key, value);

  if (!hasRendererStateIpc()) return;

  await window.ipc("rendererState:set", { key, value });
}

export async function removePersistentValue(key: string): Promise<void> {
  values.delete(key);
  notifyListeners(key, undefined, true);

  if (!hasRendererStateIpc()) return;
  await window.ipc("rendererState:remove", { key });
}

export function setPersistentValueSoon(key: string, value: unknown) {
  void setPersistentValue(key, value).catch((error) => {
    console.warn("failed to persist renderer state", { key, error });
  });
}

export function removePersistentValueSoon(key: string) {
  void removePersistentValue(key).catch((error) => {
    console.warn("failed to remove renderer state", { key, error });
  });
}

export function usePersistentState<T>(key: string, fallback: T): Ref<T> {
  const state = ref(getPersistentValue(key, fallback)) as Ref<T>;
  let applyingExternalValue = false;

  const unsubscribe = subscribePersistentState(key, (value, removed) => {
    applyingExternalValue = true;
    state.value = removed ? fallback : normalizeStoredValue(value, fallback);
    applyingExternalValue = false;
  });

  watch(
    state,
    (value) => {
      if (applyingExternalValue) return;
      setPersistentValueSoon(key, value);
    },
    { deep: true }
  );

  onScopeDispose(unsubscribe);
  return state;
}

export function disposePersistentStateForTests() {
  stopChangedListener?.();
  stopChangedListener = null;
  listeners.clear();
  values.clear();
  initialized = false;
  initPromise = null;
}
