<template>
  <UPopover :open="open" @update:open="handleOpenChange">
    <slot />

    <template #content>
      <div :class="[attrs.class, 'overflow-hidden']">
        <div class="h-80 flex flex-col">
          <div class="px-2 pt-2">
            <UTabs
              v-model="activeTab"
              :items="tabItems"
              :content="false"
              size="xs"
              class="w-full"
              @update:model-value="handleTabChange"
            />
          </div>

          <div v-if="activeTab === 'auto'" class="flex-1 min-h-0 px-4 text-sm text-muted text-center flex items-center justify-center">
            {{ t("chat.mcpSelector.autoHint") }}
          </div>
          <div v-else-if="activeTab === 'off'" class="flex-1 min-h-0 px-4 text-sm text-muted text-center flex items-center justify-center">
            {{ t("chat.mcpSelector.offHint") }}
          </div>
          <div v-else class="flex-1 min-h-0 p-2 flex flex-col">
            <div class="pb-2 shrink-0">
              <UInput
                v-model="searchTerm"
                :placeholder="t('chat.mcpSelector.search')"
                icon="i-lucide-search"
                size="xs"
                variant="outline"
                class="w-full"
              />
            </div>

            <div class="flex-1 min-h-24 overflow-y-auto">
              <template v-if="filteredServers.length > 0">
                <button
                  v-for="server in filteredServers"
                  :key="server.id"
                  class="w-full flex items-center gap-2 px-3 py-1.5 text-sm rounded-md hover:bg-elevated/50 transition-colors text-default"
                  @click="toggleServer(server.id)"
                >
                  <span
                    :class="[
                      'size-4 shrink-0 rounded-sm border flex items-center justify-center transition-colors',
                      selected.includes(server.id)
                        ? 'border-inverted bg-inverted text-inverted'
                        : 'border-default bg-default text-transparent'
                    ]"
                  >
                    <UIcon name="i-lucide-check" class="size-3" />
                  </span>

                  <UTooltip :text="getIndicatorTooltip(server)">
                    <span
                      :class="[
                        'size-4 shrink-0 flex items-center justify-center',
                        server.isBuiltin ? '' : 'cursor-pointer'
                      ]"
                      @click.stop="handleToggleEnabled(server.id, !server.enabled)"
                    >
                      <UIcon
                        v-if="loadingServers.has(server.id)"
                        name="i-lucide-loader-2"
                        class="size-3 text-muted animate-spin"
                      />
                      <span
                        v-else
                        :class="[
                          'size-2 rounded-full',
                          server.enabled ? 'bg-green-500' : 'bg-inverted/30'
                        ]"
                      />
                    </span>
                  </UTooltip>

                  <span class="flex-1 text-left truncate">{{ server.name }}</span>
                </button>
              </template>

              <div v-else class="px-3 py-4 text-sm text-muted text-center">
                {{ allServers.length > 0 ? t("chat.mcpSelector.emptySearch") : t("chat.mcpSelector.empty") }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </UPopover>
</template>

<script setup lang="ts">
import { computed, ref, useAttrs, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMcpStore } from '@/stores/useMcpStore'
import { useMyToast } from '@/composables/useMyToast'

defineOptions({
  inheritAttrs: false
})

const props = defineProps<{
  open: boolean
  selected: string[]
  policy: 'auto' | 'manual' | 'off'
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'update:selected': [value: string[]]
  'update:policy': [value: 'auto' | 'manual' | 'off']
}>()

type McpTab = 'auto' | 'manual' | 'off'

const attrs = useAttrs()
const mcpStore = useMcpStore()
const toast = useMyToast()
const { t } = useI18n()
const searchTerm = ref('')
const loadingServers = ref<Set<string>>(new Set())
const activeTab = ref<McpTab>(props.policy === 'manual' ? 'manual' : props.policy)

const tabItems = computed(() => [
  { value: 'auto', label: t('chat.mcpSelector.tab.auto'), icon: 'i-lucide-wand-sparkles' },
  { value: 'manual', label: t('chat.mcpSelector.tab.manual'), icon: 'i-gravity-ui:logo-mcp' },
  { value: 'off', label: t('chat.mcpSelector.tab.off'), icon: 'i-lucide-ban' }
])

const allServers = computed(() => mcpStore.servers)

const filteredServers = computed(() => {
  const keyword = searchTerm.value.trim().toLowerCase()
  let servers = allServers.value
  if (keyword) {
    servers = servers.filter(s => s.name.toLowerCase().includes(keyword))
  }
  return [...servers].sort((a, b) => {
    if (a.isBuiltin !== b.isBuiltin) return a.isBuiltin ? 1 : -1
    if (a.enabled !== b.enabled) return a.enabled ? -1 : 1
    return b.updatedAt - a.updatedAt
  })
})

watch(
  () => [props.policy, props.selected.length, props.open],
  ([policy, selectedLen]) => {
    if (selectedLen > 0) {
      activeTab.value = 'manual'
      return
    }
    // Keep manual tab while popover is open, even if empty selection maps to off policy.
    if (props.open && activeTab.value === 'manual') {
      return
    }
    activeTab.value = policy === 'manual' ? 'manual' : policy
  }
)

function handleTabChange(value: string | number) {
  const tab = value as McpTab
  if (tab === 'manual') return
  emit('update:selected', [])
  emit('update:policy', tab)
}

function handleOpenChange(value: boolean) {
  if (!value && activeTab.value === 'manual' && props.selected.length === 0) {
    emit('update:policy', 'off')
  }
  emit('update:open', value)
}

function toggleServer(serverId: string) {
  const ids = [...props.selected]
  const index = ids.indexOf(serverId)
  if (index > -1) ids.splice(index, 1)
  else ids.push(serverId)

  emit('update:selected', ids)
  emit('update:policy', ids.length > 0 ? 'manual' : 'off')
}

function getIndicatorTooltip(server: typeof allServers.value[0]) {
  if (server.isBuiltin) return t('chat.mcpSelector.builtin')
  if (loadingServers.value.has(server.id)) return server.enabled ? t('chat.mcpSelector.disabling') : t('chat.mcpSelector.enabling')
  return server.enabled ? t('chat.mcpSelector.clickToDisable') : t('chat.mcpSelector.clickToEnable')
}

async function handleToggleEnabled(serverId: string, enabled: boolean) {
  const server = allServers.value.find(s => s.id === serverId)
  if (server?.isBuiltin) return

  loadingServers.value.add(serverId)
  try {
    await mcpStore.setEnabled(serverId, enabled)
    toast.success({
      title: enabled
        ? t('chat.mcpSelector.enabled', { name: server?.name || '' })
        : t('chat.mcpSelector.disabled', { name: server?.name || '' })
    })
  } catch (error) {
    toast.error({
      title: enabled ? t('chat.mcpSelector.enableFailed') : t('chat.mcpSelector.disableFailed'),
      description: String(error)
    })
  } finally {
    loadingServers.value.delete(serverId)
  }
}
</script>
