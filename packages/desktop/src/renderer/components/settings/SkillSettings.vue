<template>
  <div class="flex min-w-0 flex-1 min-h-0 bg-default rounded-xl overflow-hidden">
    <!-- 左侧：技能列表 -->
    <section class="w-[240px] flex flex-col border-r border-default min-h-0">
      <div class="h-[45px] px-4 py-3 border-b border-default flex items-center justify-between shrink-0">
        <div class="text-sm font-medium">{{ t("settings.skill.title") }}</div>
        <UTooltip :text="t('settings.skill.refresh')">
          <UButton
            icon="i-lucide-refresh-cw"
            variant="ghost"
            color="neutral"
            size="xs"
            :loading="skillStore.isLoading"
            @click="skillStore.loadSkills()"
          />
        </UTooltip>
      </div>
      <div v-if="skills.length > 0" class="p-3 pb-2 shrink-0">
        <UInput
          v-model="skillListSearchQuery"
          :placeholder="t('settings.skill.listSearchPlaceholder')"
          icon="i-lucide-search"
          size="md"
          :ui="{ root: 'w-full' }"
        />
      </div>

      <UList
        v-if="skills.length > 0 && filteredSkills.length > 0"
        v-model="selectedSkillId"
        :items="filteredSkills"
        value-key="id"
        label-key="name"
        size="md"
        gap="md"
        padding="md"
        class="flex-1 min-h-0"
      >
        <template #item="{ item }">
          <div class="flex flex-col items-start gap-0.5 min-w-0 w-full">
            <UText :text="item.name" class="text-sm font-medium min-w-0 truncate w-full" />
            <UText
              v-if="item.description"
              :text="item.description"
              class="text-xs text-toned min-w-0 truncate w-full"
            />
          </div>
        </template>
      </UList>

      <div
        v-else-if="skills.length > 0 && skillListSearchQuery.trim()"
        class="flex-1 min-h-0 flex items-center justify-center p-2"
      >
        <UEmpty
          :title="t('common.listSearchNoResults')"
          icon="i-lucide-search"
          size="sm"
          variant="naked"
        />
      </div>

      <div v-else class="flex-1 flex flex-col items-center justify-center p-4 gap-3 min-h-0">
        <UEmpty
          icon="i-lucide-book-open"
          :title="t('settings.skill.emptyTitle')"
          :description="t('settings.skill.emptyDescription')"
          size="sm"
        />
        <UButton
          icon="i-lucide-refresh-cw"
          variant="soft"
          color="neutral"
          size="sm"
          :loading="skillStore.isLoading"
          @click="skillStore.loadSkills()"
        >
          {{ t("settings.skill.refresh") }}
        </UButton>
      </div>

      <div class="p-3 border-t border-default shrink-0">
        <UTooltip :text="t('settings.skill.addTooltip')">
          <UButton
            icon="i-lucide-plus"
            variant="soft"
            color="neutral"
            block
            @click="handleCreateSkill"
          >
            {{ t("settings.skill.add") }}
          </UButton>
        </UTooltip>
      </div>
    </section>

    <!-- 右侧：技能详情 -->
    <section class="flex-1 min-w-0 flex flex-col">
      <div v-if="!selectedSkill" class="h-full flex items-center justify-center">
        <div class="text-center opacity-70">
          <UIcon name="i-lucide-package" class="w-12 h-12 mx-auto mb-2" />
          <div class="text-sm">{{ t("settings.skill.selectPrompt") }}</div>
        </div>
      </div>

      <div v-else class="flex flex-col h-full">
        <div class="p-4 border-b border-default bg-muted">
          <div class="flex items-center justify-between gap-3 flex-1 min-w-0">
            <div class="flex items-center gap-3 min-w-0 flex-1">
              <h3 class="text-base font-semibold truncate">{{ detail?.name ?? selectedSkill.name }}</h3>
              <UBadge
                v-if="selectedSkill.isBuiltin"
                :label="t('settings.skill.builtin')"
                variant="subtle"
                size="sm"
              />
            </div>
            <UTooltip :text="t('settings.skill.uninstall')">
              <UButton
                icon="i-lucide-trash-2"
                variant="ghost"
                color="error"
                size="xs"
                :loading="uninstalling"
                @click="handleUninstall"
              />
            </UTooltip>
          </div>
          <p v-if="(detail ?? selectedSkill).description" class="mt-2 text-sm text-toned line-clamp-2">
            {{ (detail ?? selectedSkill).description }}
          </p>
        </div>

        <UTabs v-model="activeTab" :items="tabItems" size="sm" variant="link" class="pt-2 px-4" />

        <div class="flex-1 overflow-y-auto p-4">
          <div v-show="activeTab === 'body'">
            <div v-if="!detail?.bodyMarkdown" class="text-center py-8 opacity-70 text-sm">
              {{ t("settings.skill.noDescription") }}
            </div>
            <div v-else class="prose prose-sm max-w-none dark:prose-invert">
              <MarkdownBlock :content="detail.bodyMarkdown" />
            </div>
          </div>

          <div v-show="activeTab === 'scripts'">
            <div v-if="!scriptTree.length" class="text-center py-8 opacity-70 text-sm">
              {{ t("settings.skill.noScripts") }}
            </div>
            <UTree
              v-else
              :items="scriptTree"
              :get-key="getTreeKey"
              size="sm"
              @select="(_e, item) => onTreeSelect(item)"
            />
          </div>

          <div v-show="activeTab === 'references'">
            <div v-if="!referenceTree.length" class="text-center py-8 opacity-70 text-sm">
              {{ t("settings.skill.noReferences") }}
            </div>
            <UTree
              v-else
              :items="referenceTree"
              :get-key="getTreeKey"
              size="sm"
              @select="(_e, item) => onTreeSelect(item)"
            />
          </div>

          <div v-show="activeTab === 'assets'">
            <div v-if="!assetTree.length" class="text-center py-8 opacity-70 text-sm">
              {{ t("settings.skill.noAssets") }}
            </div>
            <UTree
              v-else
              :items="assetTree"
              :get-key="getTreeKey"
              size="sm"
              @select="(_e, item) => onTreeSelect(item)"
            />
          </div>

          <div v-show="activeTab === 'other'">
            <div v-if="!otherTree.length" class="text-center py-8 opacity-70 text-sm">
              {{ t("settings.skill.noOtherFiles") }}
            </div>
            <UTree
              v-else
              :items="otherTree"
              :get-key="getTreeKey"
              size="sm"
              @select="(_e, item) => onTreeSelect(item)"
            />
          </div>
        </div>
      </div>
    </section>

    <!-- 文件内容查看 Modal -->
    <UModal v-model:open="fileModalOpen" :title="fileModalFilename" :ui="{ content: 'max-w-3xl' }">
      <template #body>
        <div class="flex flex-col">
          <div class="flex-1 overflow-y-auto min-h-0 rounded border border-default p-3 bg-elevated/50">
            <div v-if="fileModalLoading" class="flex items-center justify-center py-8">
              <UIcon name="i-lucide-loader-2" class="w-6 h-6 animate-spin text-muted" />
            </div>
            <div v-else-if="fileModalError" class="text-sm text-red-600 dark:text-red-400">
              {{ fileModalError }}
            </div>
            <div v-else-if="!fileModalContent.trim()" class="py-8 text-center text-sm text-muted">
              {{ t("settings.skill.emptyFile") }}
            </div>
            <div v-else-if="fileModalIsMarkdown" class="prose prose-sm max-w-none dark:prose-invert">
              <MarkdownBlock :content="fileModalContent" />
            </div>
            <pre v-else class="text-sm whitespace-pre-wrap wrap-break-word font-mono text-default m-0">{{ fileModalContent }}</pre>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute, useRouter } from "vue-router";
import { useConfirm } from "@/composables/useConfirm";
import { useChatStore } from "@/stores/useChatStore";
import { useSkillStore } from "@/stores/useSkillStore";
import type { SkillDetail } from "@/stores/useSkillStore";
import UList from "@/components/UList.vue";
import UText from "@/components/UText.vue";
import MarkdownBlock from "@/components/MarkdownBlock.vue";

/** 带 path 的树节点（叶子为文件，path 为相对路径） */
interface SkillTreeItem {
  label: string;
  path?: string;
  children?: SkillTreeItem[];
  defaultExpanded?: boolean;
  icon?: string;
}

/** stripFirstSegment: 去掉首段（如 scripts/、references/），不在树里显示该层级 */
function pathsToTree(paths: string[], stripFirstSegment = false): SkillTreeItem[] {
  if (!paths.length) return [];
  const root: Record<string, { __path?: string; [k: string]: unknown }> = {};
  for (const p of paths) {
    const segments = p.split("/").filter(Boolean);
    const useSegments = stripFirstSegment && segments.length > 1 ? segments.slice(1) : segments;
    if (useSegments.length === 0) continue;
    let current = root;
    for (let i = 0; i < useSegments.length; i++) {
      const seg = useSegments[i];
      const isLast = i === useSegments.length - 1;
      if (isLast) {
        current[seg] = { __path: p };
      } else {
        if (!current[seg] || typeof (current[seg] as { __path?: string }).__path !== "undefined") {
          current[seg] = {};
        }
        current = current[seg] as Record<string, { __path?: string; [k: string]: unknown }>;
      }
    }
  }
  function toItems(node: Record<string, { __path?: string; [k: string]: unknown }>, _prefix: string): SkillTreeItem[] {
    const items: SkillTreeItem[] = [];
    for (const [name, val] of Object.entries(node)) {
      if (name === "__path") continue;
      const v = val as { __path?: string; [k: string]: unknown };
      if (v && typeof v === "object" && v.__path) {
        items.push({
          label: name,
          path: v.__path,
          icon: name.toLowerCase().endsWith(".md") ? "i-lucide-file-text" : "i-lucide-file",
        });
      } else {
        const children = toItems(v as Record<string, { __path?: string; [k: string]: unknown }>, name + "/");
        items.push({
          label: name + "/",
          defaultExpanded: true,
          children,
        });
      }
    }
    items.sort((a, b) => (a.children ? 0 : 1) - (b.children ? 0 : 1));
    return items;
  }
  return toItems(root);
}

function getTreeKey(item: SkillTreeItem): string {
  return item.path ?? item.label;
}

const chatStore = useChatStore();
const skillStore = useSkillStore();
const route = useRoute();
const router = useRouter();
const { confirm } = useConfirm();
const { t } = useI18n();
const uninstalling = ref(false);

const skills = computed(() => skillStore.skills);
const skillListSearchQuery = ref("");
const filteredSkills = computed(() => {
  const query = skillListSearchQuery.value.trim().toLowerCase();
  if (!query) return skills.value;
  return skills.value.filter(
    (s) =>
      s.name.toLowerCase().includes(query) ||
      s.id.toLowerCase().includes(query) ||
      (s.description && s.description.toLowerCase().includes(query))
  );
});
const selectedSkillId = ref("");
const selectedSkill = computed(() =>
  skills.value.find((s) => s.id === selectedSkillId.value) ?? null
);

const detail = ref<SkillDetail | null>(null);
const activeTab = ref("body");

const scriptTree = computed(() => pathsToTree(detail.value?.scriptPaths ?? [], true));
const referenceTree = computed(() => pathsToTree(detail.value?.referencePaths ?? [], true));
const assetTree = computed(() => pathsToTree(detail.value?.assetPaths ?? [], true));
const otherTree = computed(() => pathsToTree(detail.value?.otherFilePaths ?? [], false));

const tabItems = computed(() => {
  const d = detail.value;
  return [
    { value: "body", label: t("settings.skill.tab.body"), icon: "i-lucide-file-text" },
    {
      value: "scripts",
      label: t("settings.skill.tab.scripts", { count: d?.scriptPaths?.length ?? 0 }),
      icon: "i-lucide-square-terminal",
    },
    {
      value: "references",
      label: t("settings.skill.tab.references", { count: d?.referencePaths?.length ?? 0 }),
      icon: "i-lucide-book-marked",
    },
    {
      value: "assets",
      label: t("settings.skill.tab.assets", { count: d?.assetPaths?.length ?? 0 }),
      icon: "i-lucide-folder",
    },
    {
      value: "other",
      label: t("settings.skill.tab.other", { count: d?.otherFilePaths?.length ?? 0 }),
      icon: "i-lucide-files",
    },
  ];
});

const fileModalOpen = ref(false);
const fileModalFilename = ref("");
const fileModalContent = ref("");
const fileModalIsMarkdown = ref(false);
const fileModalLoading = ref(false);
const fileModalError = ref("");

async function onTreeSelect(item: SkillTreeItem | undefined) {
  if (!item?.path || !selectedSkillId.value) return;
  fileModalOpen.value = true;
  fileModalFilename.value = item.label;
  fileModalContent.value = "";
  fileModalError.value = "";
  fileModalLoading.value = true;
  fileModalIsMarkdown.value = item.label.toLowerCase().endsWith(".md");
  try {
    const result = await skillStore.readFile(selectedSkillId.value, item.path);
    if (result) {
      fileModalFilename.value = result.filename;
      fileModalContent.value = result.content;
      fileModalIsMarkdown.value = result.filename.toLowerCase().endsWith(".md");
    } else {
      fileModalError.value = t("settings.skill.readTextOnlyFailed");
    }
  } catch {
    fileModalError.value = t("settings.skill.readFailed");
  } finally {
    fileModalLoading.value = false;
  }
}

async function handleUninstall() {
  if (!selectedSkillId.value) return;
  const name = detail.value?.name ?? selectedSkill.value?.name ?? t("settings.skill.defaultName");
  const ok = await confirm({
    title: t("settings.skill.uninstallConfirmTitle"),
    content: t("settings.skill.uninstallConfirmContent", { name }),
    confirmText: t("settings.skill.uninstall"),
    confirmColor: "error",
    confirmIcon: "i-lucide-trash-2",
  });
  if (!ok) return;
  uninstalling.value = true;
  try {
    await skillStore.uninstall(selectedSkillId.value);
    selectedSkillId.value = "";
  } finally {
    uninstalling.value = false;
  }
}

watch(selectedSkillId, async (id) => {
  if (id) {
    detail.value = await skillStore.getDetail(id);
    if (route.query.skill !== id) {
      router.replace({ path: route.path, query: { ...route.query, skill: id } });
    }
  } else {
    detail.value = null;
  }
});

watch(skills, (list) => {
  if (!selectedSkillId.value && list.length > 0) {
    const q = route.query.skill as string;
    if (q && list.some((s) => s.id === q)) {
      selectedSkillId.value = q;
    } else {
      selectedSkillId.value = list[0].id;
    }
  }
}, { immediate: true });

async function handleCreateSkill() {
  const skillCreatorId = skillStore.skills.find(s => s.name === 'skill-creator')?.id;
  await chatStore.createNewSession();
  chatStore.pendingMode = 'agent';
  if (skillCreatorId) {
    chatStore.pendingManualSkillId = skillCreatorId;
  }
  router.push({ name: 'chat-new' });
}

onMounted(async () => {
  if (!skillStore.isInitialized) {
    await skillStore.initialize();
  }
});
</script>
