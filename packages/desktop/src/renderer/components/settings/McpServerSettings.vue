<template>
  <div class="flex min-w-0 flex-1 min-h-0 bg-default rounded-xl overflow-hidden">
    <!-- 第二栏：MCP 服务器列表 -->
    <section class="w-[240px] flex flex-col border-r border-default min-h-0">
      <div class="px-4 py-3 border-b border-default shrink-0">
        <div class="text-sm font-medium">{{ t("settings.category.mcpServers") }}</div>
      </div>
      <div v-if="servers.length > 0" class="p-3 pb-2 shrink-0">
        <UInput
          v-model="mcpListSearchQuery"
          :placeholder="t('settings.mcpServer.listSearchPlaceholder')"
          icon="i-lucide-search"
          size="md"
          :ui="{ root: 'w-full' }"
        />
      </div>
      
      <!-- 服务器列表 -->
      <UList
        v-if="servers.length > 0 && filteredServers.length > 0"
        v-model="selectedServerId"
        :items="filteredServers"
        value-key="id"
        label-key="name"
        size="md"
        gap="md"
        padding="md"
        class="flex-1 min-h-0"
      >
        <template #item="{ item }">
          <div class="flex flex-col items-start gap-1 min-w-0">
            <div class="flex items-center gap-1.5 w-full">
              <UText :text="item.name" class="text-sm font-medium flex-1 min-w-0" />
              <div
                :class="[
                  'w-2 h-2 rounded-full shrink-0',
                  item.enabled ? 'bg-green-500' : 'bg-inverted/30'
                ]"
              />
            </div>
            <div class="flex items-center gap-1.5">
              <UBadge
                v-if="item.isBuiltin"
                :label="t('settings.mcpServer.listBuiltin')"
                variant="subtle"
                size="xs"
              />
              <UBadge
                :label="getTypeLabel(item.type)"
                color="neutral"
                variant="outline"
                size="xs"
              />
            </div>
          </div>
        </template>
      </UList>
      <div
        v-else-if="servers.length > 0 && mcpListSearchQuery.trim()"
        class="flex-1 min-h-0 flex items-center justify-center p-2"
      >
        <UEmpty
          :title="t('common.listSearchNoResults')"
          icon="i-lucide-search"
          size="sm"
          variant="naked"
        />
      </div>
      
      <!-- 空状态 -->
      <div v-else class="flex-1 flex items-center justify-center p-4">
        <div class="text-center text-sm opacity-70">
          <div>{{ t("settings.mcpServer.empty") }}</div>
        </div>
      </div>
      
      <!-- 底部按钮 -->
      <div class="p-3 border-t border-default shrink-0">
        <UButton
          icon="i-lucide-plus"
          variant="soft"
          color="neutral"
          block
          @click="openAddModal"
        >
          {{ t("settings.mcpServer.createTitle") }}
        </UButton>
      </div>
    </section>

    <!-- 第三栏：服务器详情 -->
    <section class="flex-1 min-w-0 flex flex-col">
      <!-- 未选中状态 -->
      <div v-if="!selectedServer" class="h-full flex items-center justify-center">
        <div class="text-center opacity-70">
          <UIcon name="i-lucide-plug" class="w-12 h-12 mx-auto mb-2" />
          <div class="text-sm">{{ t("settings.mcpServer.selectPrompt") }}</div>
        </div>
      </div>

      <!-- 已选中服务器 -->
      <div v-else class="flex flex-col h-full">
        <!-- 固定顶部：服务器信息和操作 -->
        <div class="p-4 border-b border-default bg-muted">
          <div class="flex items-center justify-between gap-3">
            <!-- 左侧：服务器信息 -->
            <div class="flex items-center gap-3 flex-1 min-w-0">
              <h3 class="text-base font-semibold truncate">{{ selectedServer.name }}</h3>
              <UBadge
                v-if="selectedServer.isBuiltin"
                :label="t('settings.mcpServer.listBuiltin')"
                variant="subtle"
                size="sm"
              />
              <UBadge
                :label="getTypeLabel(selectedServer.type)"
                color="neutral"
                variant="outline"
                size="sm"
              />
              <!-- 启用开关（内置服务器不可禁用） -->
              <template v-if="!selectedServer.isBuiltin">
                <USwitch
                  :model-value="selectedServer.enabled"
                  :loading="isToggling"
                  :disabled="isToggling"
                  size="sm"
                  @update:model-value="handleToggleEnabled"
                />
                <span class="text-sm text-toned">
                  {{ selectedServer.enabled ? t("settings.mcpServer.enabledLabel") : t("settings.mcpServer.disabledLabel") }}
                </span>
              </template>
            </div>
            
            <!-- 右侧：操作按钮 -->
            <div class="flex items-center gap-2 shrink-0">
              <UButton
                v-if="selectedServer.enabled"
                icon="i-lucide-refresh-cw"
                variant="ghost"
                color="neutral"
                size="sm"
                :label="t('settings.mcpServer.refreshAction')"
                @click="handleRefreshRuntime"
              />
              <!-- 内置服务器不可编辑和删除 -->
              <template v-if="!selectedServer.isBuiltin">
                <UButton
                  icon="i-lucide-edit"
                  variant="ghost"
                  color="neutral"
                  size="sm"
                  :label="t('settings.mcpServer.editAction')"
                  @click="openEditModal"
                />
                <UButton
                  icon="i-lucide-trash-2"
                  variant="ghost"
                  size="sm"
                  color="error"
                  :label="t('common.delete')"
                  @click="handleDelete"
                />
              </template>
            </div>
          </div>
          
          <!-- 描述（如果有） -->
          <p v-if="selectedServer.description" class="mt-2 text-sm text-toned">
            {{ selectedServer.description }}
          </p>
        </div>

        <!-- Tab 导航 -->
        <UTabs v-model="activeTab" :items="tabItems" size="sm" variant="link" class="pt-2 px-4" />

        <!-- Tab 内容区域 -->
        <div class="flex-1 overflow-y-auto p-4">
          <!-- Tab 1: 工具 -->
          <div v-show="activeTab === 'tools'">
            <div v-if="!currentRuntime || currentRuntime.tools.length === 0" class="text-center py-8 opacity-70 text-sm">
              {{ currentRuntime ? t("settings.mcpServer.noTools") : t("settings.mcpServer.enableToView") }}
            </div>
            <div v-else class="flex flex-col gap-2">
              <UCard
                v-for="tool in currentRuntime.tools"
                :key="tool.name"
                class="hover:shadow-sm transition-shadow"
              >
                <div class="flex items-start justify-between gap-3">
                  <div class="flex-1 min-w-0">
                    <div class="font-medium text-sm mb-1">{{ tool.name }}</div>
                    <div v-if="tool.description" class="text-xs opacity-70 mb-2">
                      {{ tool.description }}
                    </div>
                    <div v-if="tool.inputSchema" class="text-xs">
                      <span class="opacity-70">{{ t("settings.mcpServer.paramLabel") }}</span>
                      <code class="bg-elevated px-1.5 py-0.5 rounded ml-1">
                        {{ formatSchema(tool.inputSchema) }}
                      </code>
                    </div>
                  </div>
                  <UButton
                    :label="t('settings.mcpServer.detail')"
                    variant="ghost"
                    color="neutral"
                    size="xs"
                    @click="openCapabilityModal('tool', tool)"
                  />
                </div>
              </UCard>
            </div>
          </div>

          <!-- Tab 2: 提示 -->
          <div v-show="activeTab === 'prompts'">
            <div v-if="!currentRuntime || currentRuntime.prompts.length === 0" class="text-center py-8 opacity-70 text-sm">
              {{ currentRuntime ? t("settings.mcpServer.noPrompts") : t("settings.mcpServer.enableToView") }}
            </div>
            <div v-else class="flex flex-col gap-2">
              <UCard
                v-for="prompt in currentRuntime.prompts"
                :key="prompt.name"
                class="hover:shadow-sm transition-shadow"
              >
                <div class="flex items-start justify-between gap-3">
                  <div class="flex-1 min-w-0">
                    <div class="font-medium text-sm mb-1">{{ prompt.name }}</div>
                    <div v-if="prompt.description" class="text-xs opacity-70">
                      {{ prompt.description }}
                    </div>
                  </div>
                  <UButton
                    :label="t('settings.mcpServer.detail')"
                    variant="ghost"
                    color="neutral"
                    size="xs"
                    @click="openCapabilityModal('prompt', prompt)"
                  />
                </div>
              </UCard>
            </div>
          </div>

          <!-- Tab 3: 资源 -->
          <div v-show="activeTab === 'resources'">
            <div v-if="!currentRuntime || currentRuntime.resources.length === 0" class="text-center py-8 opacity-70 text-sm">
              {{ currentRuntime ? t("settings.mcpServer.noResources") : t("settings.mcpServer.enableToView") }}
            </div>
            <div v-else class="flex flex-col gap-2">
              <UCard
                v-for="resource in currentRuntime.resources"
                :key="resource.uri"
                class="hover:shadow-sm transition-shadow"
              >
                <div class="flex items-start justify-between gap-3">
                  <div class="flex-1 min-w-0">
                    <div class="font-medium text-sm mb-1">{{ resource.name }}</div>
                    <div class="text-xs opacity-70 mb-1">
                      <code class="bg-muted px-1.5 py-0.5 rounded">{{ resource.uri }}</code>
                    </div>
                    <div v-if="resource.mimeType" class="text-xs opacity-70 mb-1">
                      {{ t("settings.mcpServer.resourceType") }}{{ resource.mimeType }}
                    </div>
                    <div v-if="resource.description" class="text-xs opacity-70">
                      {{ resource.description }}
                    </div>
                  </div>
                  <UButton
                    :label="t('settings.mcpServer.detail')"
                    variant="ghost"
                    color="neutral"
                    size="xs"
                    @click="openCapabilityModal('resource', resource)"
                  />
                </div>
              </UCard>
            </div>
          </div>

          <!-- Tab 4: 运行日志 -->
          <div v-show="activeTab === 'logs'">
            <div class="flex items-center justify-between mb-4">
              <h4 class="text-sm font-medium text-default">{{ t("settings.mcpServer.logs") }}</h4>
              <UButton
                icon="i-lucide-trash-2"
                variant="ghost"
                color="neutral"
                size="xs"
                :label="t('settings.mcpServer.clearLogs')"
                @click="handleClearLogs"
              />
            </div>

            <div v-if="!currentRuntime || currentRuntime.logs.length === 0" class="text-center py-8 opacity-70 text-sm">
              {{ t("settings.mcpServer.noLogs") }}
            </div>
            <div v-else class="space-y-1 font-mono text-xs">
              <div
                v-for="(log, index) in currentRuntime.logs"
                :key="index"
                :class="[
                  'px-3 py-1.5 rounded',
                  getLogColor(log.level)
                ]"
              >
                <span class="opacity-70">[{{ formatLogTime(log.timestamp) }}]</span>
                <span class="font-semibold mx-2">[{{ log.level.toUpperCase() }}]</span>
                <span>{{ log.message }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- 添加/编辑服务器 Modal -->
    <McpServerModal
      v-model:open="serverModalOpen"
      :server="editingServer"
      @saved="handleServerSaved"
    />

    <!-- 能力详情 Modal -->
    <McpCapabilityModal
      v-model:open="capabilityModalOpen"
      :type="capabilityModalType"
      :data="capabilityModalData"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute, useRouter } from "vue-router";
import { useMcpStore } from "@/stores/useMcpStore";
import type { McpServerConfig } from "@/stores/useMcpStore";
import { useConfirm } from "@/composables/useConfirm";
import { useMyToast } from "@/composables/useMyToast";
import UList from "@/components/UList.vue";
import UText from "@/components/UText.vue";
import McpServerModal from "./McpServerModal.vue";
import McpCapabilityModal from "./McpCapabilityModal.vue";

const mcpStore = useMcpStore();
const route = useRoute();
const router = useRouter();
const { confirm } = useConfirm();
const toast = useMyToast();
const { t, locale } = useI18n();

// ===== 服务器列表 =====
// 排序：用户服务器优先，然后已启用优先，最后按更新时间倒序
const servers = computed(() => {
  return [...mcpStore.servers].sort((a, b) => {
    // 内置服务器排在后面
    if (a.isBuiltin !== b.isBuiltin) {
      return a.isBuiltin ? 1 : -1;
    }
    if (a.enabled !== b.enabled) {
      return a.enabled ? -1 : 1;
    }
    return b.updatedAt - a.updatedAt;
  });
});

function getTypeLabel(type: string) {
  const labels: Record<string, string> = {
    stdio: "Stdio",
    "streamable-http": "HTTP Stream",
    "http-sse": "HTTP+SSE",
  };
  return labels[type] || type;
}

const mcpListSearchQuery = ref("");
const filteredServers = computed(() => {
  const query = mcpListSearchQuery.value.trim().toLowerCase();
  if (!query) return servers.value;
  return servers.value.filter(
    (s) =>
      s.name.toLowerCase().includes(query) ||
      s.id.toLowerCase().includes(query) ||
      (s.description && s.description.toLowerCase().includes(query)) ||
      getTypeLabel(s.type).toLowerCase().includes(query)
  );
});

const selectedServerId = ref<string>("");
const selectedServer = computed(() => 
  servers.value.find(s => s.id === selectedServerId.value) || null
);

// 当前服务器的运行时信息
const currentRuntime = computed(() => 
  selectedServerId.value ? mcpStore.serverRuntimes.get(selectedServerId.value) : null
);

// 初始化选中第一个服务器
watch(servers, (newServers) => {
  if (!selectedServerId.value && newServers.length > 0) {
    const queryServer = route.query.server as string;
    if (queryServer && newServers.some(s => s.id === queryServer)) {
      selectedServerId.value = queryServer;
    } else {
      selectedServerId.value = newServers[0].id;
    }
  }
}, { immediate: true });

// 选中服务器变化时加载运行时信息
watch(selectedServerId, async (id) => {
  if (id) {
    await mcpStore.loadServerRuntime(id);
    
    // 同步到 URL
    if (route.query.server !== id) {
      router.replace({ 
        path: route.path, 
        query: { ...route.query, server: id } 
      });
    }
  }
}, { immediate: true });

// ===== Tab 管理 =====
const activeTab = ref('logs');

// 根据服务器启用状态动态显示 tab
const tabItems = computed(() => {
  const isEnabled = selectedServer.value?.enabled;
  
  if (!isEnabled) {
    // 未启用时只显示日志
    return [
      { value: 'logs', label: t("settings.mcpServer.tab.logs"), icon: 'i-lucide-scroll-text' }
    ];
  }
  
  // 已启用时显示全部 tab
  return [
    { 
      value: 'tools', 
      label: t("settings.mcpServer.tab.tools", { count: currentRuntime.value?.tools.length || 0 }), 
      icon: 'i-lucide-wrench' 
    },
    { 
      value: 'prompts', 
      label: t("settings.mcpServer.tab.prompts", { count: currentRuntime.value?.prompts.length || 0 }), 
      icon: 'i-lucide-message-square' 
    },
    { 
      value: 'resources', 
      label: t("settings.mcpServer.tab.resources", { count: currentRuntime.value?.resources.length || 0 }), 
      icon: 'i-lucide-box' 
    },
    { 
      value: 'logs', 
      label: t("settings.mcpServer.tab.logs"), 
      icon: 'i-lucide-scroll-text' 
    }
  ];
});

// 监听 tabItems 变化，自动切换到第一个可用的 tab
watch(tabItems, (newItems) => {
  if (newItems.length > 0) {
    activeTab.value = newItems[0].value;
  }
}, { immediate: true });

// ===== Modal 管理 =====
const serverModalOpen = ref(false);
const editingServer = ref<McpServerConfig | null>(null);

const capabilityModalOpen = ref(false);
const capabilityModalType = ref<'tool' | 'prompt' | 'resource'>('tool');
const capabilityModalData = ref<any>(null);

// ===== 操作方法 =====
const isToggling = ref(false);

const openAddModal = () => {
  editingServer.value = null;
  serverModalOpen.value = true;
};

const openEditModal = () => {
  editingServer.value = selectedServer.value;
  serverModalOpen.value = true;
};

const handleServerSaved = async (serverId?: string) => {
  await mcpStore.loadServers();
  serverModalOpen.value = false;
  
  // 如果是新建服务器，选中它
  if (serverId) {
    selectedServerId.value = serverId;
  }
};

const handleToggleEnabled = async (enabled: boolean) => {
  if (!selectedServerId.value || isToggling.value) return;
  
  isToggling.value = true;
  try {
    await mcpStore.setEnabled(selectedServerId.value, enabled);
    toast.success({ 
      title: enabled ? t("settings.mcpServer.enabledToast") : t("settings.mcpServer.disabledToast")
    });
  } catch (error) {
    toast.error({ 
      title: enabled ? t("settings.mcpServer.enableFailed") : t("settings.mcpServer.disableFailed"),
      description: String(error) 
    });
  } finally {
    isToggling.value = false;
  }
};

const handleDelete = async () => {
  if (!selectedServer.value) return;
  
  const result = await confirm({
    title: t("settings.mcpServer.deleteConfirmTitle"),
    content: t("settings.mcpServer.deleteConfirmContent", { name: selectedServer.value.name }),
    confirmText: t("common.delete"),
    cancelText: t("common.cancel")
  });
  
  if (result) {
    try {
      await mcpStore.deleteServer(selectedServer.value.id);
      selectedServerId.value = '';
      toast.success({ title: t("settings.mcpServer.deleted") });
    } catch (error) {
      toast.error({ 
        title: t("settings.mcpServer.deleteFailed"),
        description: String(error) 
      });
    }
  }
};

const handleRefreshRuntime = async () => {
  if (!selectedServerId.value) return;
  try {
    // 刷新服务器能力
    await window.ipc('mcp:refreshServerCapabilities', { id: selectedServerId.value });
    // 重新加载运行时信息
    await mcpStore.loadServerRuntime(selectedServerId.value);
    toast.success({ title: t("settings.mcpServer.refreshed") });
  } catch (error) {
    toast.error({ 
      title: t("settings.mcpServer.refreshFailed"),
      description: String(error) 
    });
  }
};

const handleClearLogs = async () => {
  if (!selectedServerId.value) return;
  
  try {
    await mcpStore.clearServerLogs(selectedServerId.value);
    toast.success({ title: t("settings.mcpServer.logsCleared") });
  } catch (error) {
    toast.error({ 
      title: t("settings.mcpServer.actionFailed"),
      description: String(error) 
    });
  }
};

const openCapabilityModal = (type: 'tool' | 'prompt' | 'resource', data: any) => {
  capabilityModalType.value = type;
  capabilityModalData.value = data;
  capabilityModalOpen.value = true;
};

// ===== 辅助方法 =====
const formatLogTime = (timestamp: number) => {
  return new Date(timestamp).toLocaleString(locale.value, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
};

const getLogColor = (level: string) => {
  const colors: Record<string, string> = {
    'info': 'bg-blue-50 text-blue-900',
    'debug': 'bg-muted text-toned',
    'warn': 'bg-yellow-50 text-yellow-900',
    'error': 'bg-red-50 text-red-900'
  };
  return colors[level] || 'bg-muted';
};

const formatSchema = (schema: any) => {
  if (!schema || !schema.properties) return t("settings.mcpServer.none");
  const props = Object.keys(schema.properties);
  return props.length > 0 ? props.join(', ') : t("settings.mcpServer.none");
};

// 初始化
onMounted(async () => {
  if (!mcpStore.isInitialized) {
    await mcpStore.initialize();
  }
});
</script>
