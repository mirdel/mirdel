<template>
  <UModal
    v-model:open="modalOpen"
    :title="props.applet?.name || t('applet.codeTitle')"
    :description="t('applet.fileTree.selectFileHint')"
    :ui="{ content: 'w-[90%] max-w-[calc(100vw-2rem)] h-[90%] max-h-[calc(100vh-2rem)]' }"
  >
    <span class="hidden" />
    <template #content>
      <div class="h-full flex flex-col">
        <div class="px-4 py-3 border-b border-default flex items-center justify-between">
          <div class="text-sm font-medium truncate">
            {{ props.applet?.name || t("applet.codeTitle") }}
          </div>
        </div>

        <div class="flex-1 min-h-0 flex">
          <aside class="w-80 border-r border-default p-2 overflow-auto">
            <div class="px-1 pb-2 flex items-center justify-end gap-1">
              <UTooltip :text="t('applet.fileTree.newFolder')">
                <UButton
                  size="xs"
                  variant="ghost"
                  color="neutral"
                  icon="i-lucide-folder-plus"
                  @click="createRootDirectory"
                />
              </UTooltip>
              <UTooltip :text="t('applet.fileTree.newFile')">
                <UButton
                  size="xs"
                  variant="ghost"
                  color="neutral"
                  icon="i-lucide-file-plus"
                  @click="createRootFile"
                />
              </UTooltip>
            </div>

            <div v-if="visibleNodes.length === 0" class="text-xs text-muted px-2 py-1">
              {{ t("applet.fileTree.empty") }}
            </div>

            <div
              v-for="node in visibleNodes"
              :key="node.path"
              class="group flex items-center gap-1 rounded-md px-1 py-1.5"
              :class="activeNodePath === node.path ? 'bg-primary/10 text-primary' : 'hover:bg-elevated text-default'"
            >
              <button
                type="button"
                class="w-4 h-4 inline-flex items-center justify-center shrink-0 text-muted"
                @click.stop="toggleDirectory(node)"
              >
                <UIcon
                  v-if="node.kind === 'dir' && node.hasChildren"
                  name="i-lucide-chevron-right"
                  class="w-3 h-3 transition-transform"
                  :class="isDirCollapsed(node.path) ? '' : 'rotate-90'"
                />
              </button>

              <div class="flex items-center gap-1 min-w-0 flex-1" :style="{ paddingLeft: `${node.depth * 14}px` }">
                <UIcon
                  :name="node.kind === 'dir' ? 'i-lucide-folder' : 'i-lucide-file-text'"
                  class="w-3.5 h-3.5 shrink-0 text-muted"
                />

                <UInput
                  v-if="renamingPath === node.path"
                  :model-value="renamingName"
                  variant="none"
                  size="xs"
                  class="w-full"
                  :ui="{ base: 'px-0 py-0 h-6 text-xs' }"
                  :ref="(el) => setRenameInputRef(node.path, el)"
                  @update:model-value="onRenameInput"
                  @click.stop
                  @blur="commitRename(node.path)"
                  @keydown.enter.prevent="commitRename(node.path)"
                  @keydown.esc.prevent="cancelRename"
                />

                <button
                  v-else
                  type="button"
                  class="text-left text-xs font-mono truncate min-w-0 flex-1"
                  :title="node.path"
                  @click="onNodeClick(node)"
                >
                  {{ node.name }}
                </button>
              </div>

              <UDropdownMenu v-if="renamingPath !== node.path" :items="getNodeMenuItems(node)" size="sm">
                <UButton
                  icon="i-lucide-more-horizontal"
                  variant="ghost"
                  color="neutral"
                  size="2xs"
                  class="opacity-0 group-hover:opacity-100 transition-opacity"
                />
              </UDropdownMenu>
            </div>
          </aside>

          <main class="flex-1 min-w-0 flex flex-col">
            <div class="px-3 py-2 border-b border-default flex items-center justify-between">
              <div class="text-xs font-mono truncate" :title="selectedFilePath">
                {{ selectedFilePath || t("applet.fileTree.noFileSelected") }}
              </div>
            </div>

            <div v-if="!selectedFilePath" class="flex-1 flex items-center justify-center text-muted text-sm">
              {{ t("applet.fileTree.selectFileHint") }}
            </div>
            <div v-else-if="!selectedFileIsText" class="flex-1 flex items-center justify-center text-muted text-sm">
              {{ t("applet.fileTree.binaryReadonly") }}
            </div>
            <div v-else class="flex-1 min-h-0">
              <SourceEditor
                ref="sourceEditorRef"
                v-model="fileEditorContent"
                :language="editorLanguage"
                :model-path="selectedFilePath"
                :related-files="editorRelatedFiles"
                class="h-full"
                @open-file="handleEditorOpenFile"
              />
            </div>
          </main>
        </div>

        <div class="px-4 py-3 border-t border-default flex items-center justify-between">
          <div class="text-xs text-muted">
            {{ t("applet.fileTree.autoSave") }}
          </div>
          <div class="flex items-center gap-2">
            <UButton variant="outline" color="neutral" @click="closeEditor">{{ t("common.close") }}</UButton>
          </div>
        </div>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useConfirm } from "@/composables/useConfirm";
import { useMyToast } from "@/composables/useMyToast";
import SourceEditor from "@/components/editor/SourceEditor.vue";

type AppletSummary = {
  id: string;
  name: string;
  entryFile: string;
};

type AppletFsEntry = {
  path: string;
  kind: "file" | "dir";
};

type TreeNode = AppletFsEntry & {
  name: string;
  depth: number;
  hasChildren: boolean;
};

const props = defineProps<{
  open: boolean;
  applet: AppletSummary | null;
}>();

const emit = defineEmits<{
  "update:open": [value: boolean];
  changed: [];
}>();

const modalOpen = computed({
  get: () => props.open,
  set: (value: boolean) => emit("update:open", value),
});

const { t } = useI18n();
const { confirm } = useConfirm();
const toast = useMyToast();

const entries = ref<AppletFsEntry[]>([]);
const collapsedDirs = ref<Set<string>>(new Set());
const activeNodePath = ref("");
const selectedFilePath = ref("");
const selectedFileIsText = ref(true);
const fileEditorContent = ref("");
const loadedFileContent = ref("");
const projectTextFileContents = ref<Record<string, string>>({});
const sourceEditorRef = ref<{ revealPosition: (line: number, column?: number) => void } | null>(null);

const renamingPath = ref<string | null>(null);
const renamingName = ref("");
const renamingBusy = ref(false);
const renameInputRefs = new Map<string, { inputRef?: HTMLInputElement }>();
const AUTO_SAVE_DELAY_MS = 600;
let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;
let pendingAutoSave: { path: string; content: string } | null = null;
let autoSaveInFlight: Promise<boolean> | null = null;

const appletId = computed(() => props.applet?.id ?? "");

const editorLanguage = computed(() => resolveEditorLanguage(selectedFilePath.value));
const editorRelatedFiles = computed(() =>
  Object.entries(projectTextFileContents.value).map(([path, content]) => ({ path, content }))
);

const normalizedEntries = computed<AppletFsEntry[]>(() => {
  const map = new Map<string, AppletFsEntry>();
  for (const entry of entries.value) {
    const normalized = normalizePath(entry.path);
    if (!normalized) continue;
    map.set(normalized, { path: normalized, kind: entry.kind });
    let parent = dirname(normalized);
    while (parent) {
      if (!map.has(parent)) map.set(parent, { path: parent, kind: "dir" });
      parent = dirname(parent);
    }
  }
  return Array.from(map.values());
});

const entryMap = computed(() => {
  const map = new Map<string, AppletFsEntry>();
  for (const entry of normalizedEntries.value) {
    map.set(entry.path, entry);
  }
  return map;
});

const childrenByParent = computed(() => {
  const map = new Map<string, AppletFsEntry[]>();
  for (const entry of normalizedEntries.value) {
    const parent = dirname(entry.path);
    const list = map.get(parent) ?? [];
    list.push(entry);
    map.set(parent, list);
  }
  for (const list of map.values()) {
    list.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "dir" ? -1 : 1;
      return basename(a.path).localeCompare(basename(b.path));
    });
  }
  return map;
});

const visibleNodes = computed<TreeNode[]>(() => {
  const result: TreeNode[] = [];

  const walk = (parent: string, depth: number) => {
    const children = childrenByParent.value.get(parent) ?? [];
    for (const child of children) {
      const hasChildren = (childrenByParent.value.get(child.path)?.length ?? 0) > 0;
      result.push({
        ...child,
        name: basename(child.path),
        depth,
        hasChildren,
      });
      if (child.kind === "dir" && !collapsedDirs.value.has(child.path)) {
        walk(child.path, depth + 1);
      }
    }
  };

  walk("", 0);
  return result;
});

watch(
  () => props.open,
  async (open) => {
    if (!open) {
      await flushAutoSave({ showErrorToast: true });
      resetEditorState();
      return;
    }
    if (props.applet?.id) {
      void initEditor();
    }
  }
);

watch(
  () => props.applet?.id,
  (id, previous) => {
    if (!props.open || !id || id === previous) return;
    void initEditor();
  }
);

watch(renamingPath, async (path) => {
  if (!path) return;
  await nextTick();
  const input = renameInputRefs.get(path)?.inputRef;
  if (!input) return;
  input.focus();
  input.select();
});

async function initEditor() {
  resetEditorState();
  await refreshEntries({ preferredPath: props.applet?.entryFile || "" });
}

function resetEditorState() {
  clearAutoSaveTimer();
  pendingAutoSave = null;
  entries.value = [];
  collapsedDirs.value = new Set();
  activeNodePath.value = "";
  selectedFilePath.value = "";
  selectedFileIsText.value = true;
  fileEditorContent.value = "";
  loadedFileContent.value = "";
  projectTextFileContents.value = {};
  renamingPath.value = null;
  renamingName.value = "";
  renamingBusy.value = false;
  renameInputRefs.clear();
}

function clearAutoSaveTimer() {
  if (autoSaveTimer) {
    clearTimeout(autoSaveTimer);
    autoSaveTimer = null;
  }
}

async function writeFileContent(path: string, content: string, options?: { showErrorToast?: boolean }): Promise<boolean> {
  if (!appletId.value) return false;
  const result = await window.ipc("applet:writeFile", {
    id: appletId.value,
    path,
    content,
  });
  if (!result?.ok) {
    if (options?.showErrorToast !== false) {
      toast.error({ title: t("applet.fileTree.saveFailed") });
    }
    return false;
  }

  if (selectedFilePath.value === path && fileEditorContent.value === content) {
    loadedFileContent.value = content;
  }
  projectTextFileContents.value = {
    ...projectTextFileContents.value,
    [path]: content,
  };
  return true;
}

function scheduleAutoSave(path: string, content: string) {
  pendingAutoSave = { path, content };
  clearAutoSaveTimer();
  autoSaveTimer = setTimeout(() => {
    void flushAutoSave({ showErrorToast: true });
  }, AUTO_SAVE_DELAY_MS);
}

async function flushAutoSave(options?: { showErrorToast?: boolean }): Promise<boolean> {
  clearAutoSaveTimer();
  if (autoSaveInFlight) {
    const ok = await autoSaveInFlight;
    if (!pendingAutoSave) return ok;
  }

  const pending = pendingAutoSave;
  if (!pending) return true;
  pendingAutoSave = null;

  autoSaveInFlight = writeFileContent(pending.path, pending.content, options);
  const ok = await autoSaveInFlight;
  autoSaveInFlight = null;
  if (!ok) return false;
  if (pendingAutoSave) return flushAutoSave(options);
  return true;
}

function normalizePath(input: string): string {
  return input
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "")
    .replace(/\/+/g, "/")
    .trim();
}

function resolveEditorLanguage(filePath: string): string {
  const normalized = normalizePath(filePath).toLowerCase();
  const ext = normalized.includes(".") ? normalized.slice(normalized.lastIndexOf(".") + 1) : "";
  if (!ext) return "plaintext";
  switch (ext) {
    case "ts":
      return "typescript";
    case "tsx":
      return "typescript";
    case "js":
    case "jsx":
    case "mjs":
    case "cjs":
      return "javascript";
    case "json":
      return "json";
    case "css":
      return "css";
    case "scss":
      return "scss";
    case "less":
      return "less";
    case "html":
    case "htm":
      return "html";
    case "xml":
      return "xml";
    case "md":
      return "markdown";
    case "yaml":
    case "yml":
      return "yaml";
    case "txt":
      return "plaintext";
    default:
      return "plaintext";
  }
}

function isTextFilePath(filePath: string): boolean {
  const normalized = normalizePath(filePath).toLowerCase();
  const ext = normalized.includes(".") ? normalized.slice(normalized.lastIndexOf(".") + 1) : "";
  if (!ext) return true;
  return new Set([
    "ts",
    "tsx",
    "js",
    "jsx",
    "mjs",
    "cjs",
    "json",
    "css",
    "scss",
    "less",
    "html",
    "htm",
    "xml",
    "md",
    "yaml",
    "yml",
    "txt",
  ]).has(ext);
}

function dirname(input: string): string {
  const normalized = normalizePath(input);
  const index = normalized.lastIndexOf("/");
  return index === -1 ? "" : normalized.slice(0, index);
}

function basename(input: string): string {
  const normalized = normalizePath(input);
  const index = normalized.lastIndexOf("/");
  return index === -1 ? normalized : normalized.slice(index + 1);
}

function joinPath(parent: string, name: string): string {
  const cleanParent = normalizePath(parent);
  const cleanName = normalizePath(name);
  if (!cleanParent) return cleanName;
  return `${cleanParent}/${cleanName}`;
}

function isSameOrDescendant(path: string, maybeAncestor: string): boolean {
  return path === maybeAncestor || path.startsWith(`${maybeAncestor}/`);
}

function setRenameInputRef(path: string, el: any) {
  if (!el) {
    renameInputRefs.delete(path);
    return;
  }
  renameInputRefs.set(path, el);
}

function onRenameInput(value: string | number) {
  renamingName.value = String(value ?? "");
}

function isDirCollapsed(path: string): boolean {
  return collapsedDirs.value.has(path);
}

function setDirCollapsed(path: string, collapsed: boolean) {
  const next = new Set(collapsedDirs.value);
  if (collapsed) next.add(path);
  else next.delete(path);
  collapsedDirs.value = next;
}

function expandAncestors(path: string) {
  const next = new Set(collapsedDirs.value);
  let current = dirname(path);
  while (current) {
    next.delete(current);
    current = dirname(current);
  }
  collapsedDirs.value = next;
}

function hasFile(path: string): boolean {
  return entryMap.value.get(path)?.kind === "file";
}

async function refreshEntries(options?: { preferredPath?: string }) {
  if (!appletId.value) return;
  const list = await window.ipc("applet:listEntries", { id: appletId.value });
  entries.value = (list ?? []) as AppletFsEntry[];
  await preloadProjectTextFiles();
  if (activeNodePath.value && !entryMap.value.has(activeNodePath.value)) {
    activeNodePath.value = "";
  }

  const fileEntries = normalizedEntries.value.filter((entry) => entry.kind === "file");
  if (fileEntries.length === 0) {
    selectedFilePath.value = "";
    selectedFileIsText.value = true;
    fileEditorContent.value = "";
    loadedFileContent.value = "";
    return;
  }

  const preferred = normalizePath(options?.preferredPath || "");
  if (preferred && hasFile(preferred)) {
    await selectFile(preferred, { force: true });
    return;
  }

  if (selectedFilePath.value && hasFile(selectedFilePath.value)) {
    return;
  }

  const entryFile = normalizePath(props.applet?.entryFile || "");
  if (entryFile && hasFile(entryFile)) {
    await selectFile(entryFile, { force: true });
    return;
  }

  await selectFile(fileEntries[0].path, { force: true });
}

async function selectFile(path: string, options?: { force?: boolean }) {
  if (!appletId.value) return;
  const normalized = normalizePath(path);
  if (!hasFile(normalized)) return;
  if (!options?.force && normalized === selectedFilePath.value) return;
  if (!(await flushAutoSave({ showErrorToast: true }))) return;

  const result = await window.ipc("applet:readFile", { id: appletId.value, path: normalized });
  if (!result) return;

  selectedFilePath.value = result.path;
  activeNodePath.value = result.path;
  selectedFileIsText.value = !!result.isText;
  loadedFileContent.value = result.content ?? "";
  fileEditorContent.value = result.content ?? "";
  if (result.isText) {
    projectTextFileContents.value = {
      ...projectTextFileContents.value,
      [result.path]: result.content ?? "",
    };
  }
  expandAncestors(normalized);
}

async function preloadProjectTextFiles() {
  if (!appletId.value) return;
  const fileEntries = normalizedEntries.value.filter((entry) => entry.kind === "file" && isTextFilePath(entry.path));
  const next: Record<string, string> = {};
  await Promise.all(fileEntries.map(async (entry) => {
    if (entry.path === selectedFilePath.value && selectedFileIsText.value) {
      next[entry.path] = fileEditorContent.value;
      return;
    }
    const result = await window.ipc("applet:readFile", { id: appletId.value, path: entry.path });
    if (!result?.isText || typeof result.path !== "string") return;
    next[result.path] = result.content ?? "";
  }));
  projectTextFileContents.value = next;
}

function getNextDefaultPath(parentDir: string, kind: "file" | "dir"): string {
  const cleanParentDir = normalizePath(parentDir);
  const siblingNames = new Set<string>();

  for (const entry of normalizedEntries.value) {
    if (dirname(entry.path) !== cleanParentDir) continue;
    siblingNames.add(basename(entry.path));
  }

  if (kind === "file") {
    let index = 0;
    while (true) {
      const name = index === 0 ? "new-file.ts" : `new-file-${index}.ts`;
      if (!siblingNames.has(name)) return joinPath(cleanParentDir, name);
      index += 1;
    }
  }

  let index = 0;
  while (true) {
    const name = index === 0 ? "new-folder" : `new-folder-${index}`;
    if (!siblingNames.has(name)) return joinPath(cleanParentDir, name);
    index += 1;
  }
}

function startRename(path: string) {
  renamingPath.value = path;
  renamingName.value = basename(path);
}

function cancelRename() {
  renamingPath.value = null;
  renamingName.value = "";
  renamingBusy.value = false;
}

async function createFile(parentDir = "") {
  if (!appletId.value) return;
  if (!(await flushAutoSave({ showErrorToast: true }))) return;

  const path = getNextDefaultPath(parentDir, "file");
  const result = await window.ipc("applet:createFile", { id: appletId.value, path, content: "" });
  if (!result?.ok) {
    toast.error({ title: t("applet.fileTree.createFileFailed") });
    return;
  }

  emit("changed");
  await refreshEntries({ preferredPath: result.result.path });
  startRename(result.result.path);
}

async function createDirectory(parentDir = "") {
  if (!appletId.value) return;
  if (!(await flushAutoSave({ showErrorToast: true }))) return;

  const path = getNextDefaultPath(parentDir, "dir");
  const result = await window.ipc("applet:createDir", { id: appletId.value, path });
  if (!result?.ok) {
    toast.error({ title: t("applet.fileTree.createFolderFailed") });
    return;
  }

  emit("changed");
  await refreshEntries({ preferredPath: selectedFilePath.value });
  expandAncestors(result.result.path);
  activeNodePath.value = result.result.path;
  startRename(result.result.path);
}

function createRootFile() {
  void createFile("");
}

function createRootDirectory() {
  void createDirectory("");
}

function toggleDirectory(node: TreeNode) {
  if (node.kind !== "dir" || !node.hasChildren) return;
  setDirCollapsed(node.path, !isDirCollapsed(node.path));
}

async function onNodeClick(node: TreeNode) {
  activeNodePath.value = node.path;
  if (node.kind === "dir") {
    toggleDirectory(node);
    return;
  }
  await selectFile(node.path);
}

async function handleEditorOpenFile(payload: { path: string; line: number; column: number }) {
  const targetPath = normalizePath(payload.path);
  if (!targetPath || !hasFile(targetPath)) return;
  await selectFile(targetPath, { force: true });
  if (selectedFilePath.value !== targetPath) return;
  await nextTick();
  sourceEditorRef.value?.revealPosition(payload.line, payload.column);
}

async function commitRename(path: string) {
  if (renamingBusy.value || !appletId.value) return;
  if (renamingPath.value !== path) return;

  const nextName = renamingName.value.trim();
  if (!nextName) {
    cancelRename();
    return;
  }

  const fromPath = normalizePath(path);
  const toPath = joinPath(dirname(fromPath), nextName);
  if (!toPath || toPath === fromPath) {
    cancelRename();
    return;
  }

  renamingBusy.value = true;
  const result = await window.ipc("applet:renameFile", {
    id: appletId.value,
    from: fromPath,
    to: toPath,
  });
  renamingBusy.value = false;

  if (!result?.ok) {
    toast.error({ title: t("applet.fileTree.renameFailed") });
    cancelRename();
    return;
  }

  const oldSelected = selectedFilePath.value;
  cancelRename();
  emit("changed");
  activeNodePath.value = toPath;

  let preferredPath = "";
  if (oldSelected && isSameOrDescendant(oldSelected, fromPath)) {
    preferredPath = `${toPath}${oldSelected.slice(fromPath.length)}`;
  } else if (result.result?.path) {
    preferredPath = result.result.path;
  }

  await refreshEntries({ preferredPath });
}

async function deleteNode(node: TreeNode) {
  if (!appletId.value) return;
  if (!(await flushAutoSave({ showErrorToast: true }))) return;

  const confirmed = await confirm({
    title: t("applet.fileTree.deleteTitle"),
    content: t("applet.fileTree.deleteContent", { name: node.name }),
    confirmText: t("common.delete"),
    cancelText: t("common.cancel"),
    confirmColor: "error",
  });
  if (!confirmed) return;

  const ok = await window.ipc("applet:deleteFile", { id: appletId.value, path: node.path });
  if (!ok?.ok) {
    toast.error({ title: t("applet.fileTree.deleteFailed") });
    return;
  }

  if (selectedFilePath.value && isSameOrDescendant(selectedFilePath.value, node.path)) {
    selectedFilePath.value = "";
    selectedFileIsText.value = true;
    fileEditorContent.value = "";
    loadedFileContent.value = "";
  }
  if (activeNodePath.value && isSameOrDescendant(activeNodePath.value, node.path)) {
    activeNodePath.value = "";
  }

  emit("changed");
  await refreshEntries({ preferredPath: props.applet?.entryFile || "" });
}

function getNodeMenuItems(node: TreeNode) {
  const deferMenuAction = (handler: () => void) => {
    queueMicrotask(() => handler());
  };

  const items = [
    {
      label: t("applet.fileTree.rename"),
      icon: "i-lucide-pencil",
      onClick: () => deferMenuAction(() => startRename(node.path)),
    },
    {
      label: t("common.delete"),
      icon: "i-lucide-trash-2",
      color: "error",
      onClick: () => {
        deferMenuAction(() => {
          void deleteNode(node);
        });
      },
    },
  ];
  if (node.kind === "dir") {
    items.unshift(
      {
        label: t("applet.fileTree.newFolder"),
        icon: "i-lucide-folder-plus",
        onClick: () => {
          deferMenuAction(() => {
            void createDirectory(node.path);
          });
        },
      },
      {
        label: t("applet.fileTree.newFile"),
        icon: "i-lucide-file-plus",
        onClick: () => {
          deferMenuAction(() => {
            void createFile(node.path);
          });
        },
      }
    );
  }
  return items;
}

async function closeEditor() {
  if (!(await flushAutoSave({ showErrorToast: true }))) return;
  modalOpen.value = false;
}

watch(
  [selectedFilePath, selectedFileIsText, fileEditorContent],
  ([path, isText, content]) => {
    if (!path || !isText) return;
    if (content === loadedFileContent.value) return;
    projectTextFileContents.value = {
      ...projectTextFileContents.value,
      [path]: content,
    };
    scheduleAutoSave(path, content);
  }
);
</script>
