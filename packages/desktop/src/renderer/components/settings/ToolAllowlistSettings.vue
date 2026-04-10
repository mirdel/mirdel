<template>
  <section class="flex-1 min-w-0 bg-default rounded-xl overflow-y-auto">
    <div class="p-4 flex flex-col gap-4">
      <div class="flex items-center justify-end">
        <span class="text-sm text-toned mr-auto">{{ t('settings.toolAllowlist.total', { count: allowlistItems.length }) }}</span>
        <UButton
          size="sm"
          color="error"
          variant="ghost"
          icon="i-lucide-trash-2"
          :disabled="allowlistItems.length === 0 || isClearingAllowlist"
          :loading="isClearingAllowlist"
          @click="handleClearAllowlist"
        >
          {{ t('settings.toolAllowlist.clearAll') }}
        </UButton>
      </div>

      <div v-if="isLoadingAllowlist" class="text-xs text-toned">{{ t('applet.loading') }}</div>

      <template v-else>
        <div class="rounded-xl border border-default p-4 flex flex-col gap-3">
          <div class="flex items-center gap-2">
            <div class="text-sm font-medium text-toned">{{ t('settings.toolAllowlist.commandTitle') }}</div>
            <UBadge size="sm" color="neutral" variant="soft">{{ commandAllowlistItems.length }}</UBadge>
          </div>
          <div v-if="commandAllowlistItems.length === 0" class="text-sm text-toned">{{ t('settings.toolAllowlist.commandEmpty') }}</div>
          <div v-else class="flex flex-wrap gap-2">
            <div
              v-for="item in commandAllowlistItems"
              :key="itemKey(item)"
              class="inline-flex items-center gap-1 px-2.5 pr-1 py-1 rounded-full border border-default bg-muted text-xs"
            >
              <span class="truncate max-w-[480px]">{{ itemLabel(item) }}</span>
              <button
                type="button"
                class="inline-flex items-center justify-center w-4 h-4 rounded-full text-toned hover:text-toned hover:bg-elevated disabled:opacity-50 disabled:cursor-not-allowed"
                :disabled="isRemovingItem(item)"
                @click="handleRemoveAllowlistItem(item)"
              >
                <UIcon v-if="isRemovingItem(item)" name="i-lucide-loader-2" class="w-3 h-3 animate-spin" />
                <UIcon v-else name="i-lucide-x" class="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>

        <div class="rounded-xl border border-default p-4 flex flex-col gap-3">
          <div class="flex items-center gap-2">
            <div class="text-sm font-medium text-toned">{{ t('settings.toolAllowlist.mcpTitle') }}</div>
            <UBadge size="sm" color="neutral" variant="soft">{{ mcpAllowlistItems.length }}</UBadge>
          </div>
          <div v-if="mcpAllowlistItems.length === 0" class="text-sm text-toned">{{ t('settings.toolAllowlist.mcpEmpty') }}</div>
          <div v-else class="flex flex-wrap gap-2">
            <div
              v-for="item in mcpAllowlistItems"
              :key="itemKey(item)"
              class="inline-flex items-center gap-1 px-2.5 pr-1 py-1 rounded-full border border-default bg-muted text-xs"
            >
              <span class="truncate max-w-[480px]">{{ itemLabel(item) }}</span>
              <button
                type="button"
                class="inline-flex items-center justify-center w-4 h-4 rounded-full text-toned hover:text-toned hover:bg-elevated disabled:opacity-50 disabled:cursor-not-allowed"
                :disabled="isRemovingItem(item)"
                @click="handleRemoveAllowlistItem(item)"
              >
                <UIcon v-if="isRemovingItem(item)" name="i-lucide-loader-2" class="w-3 h-3 animate-spin" />
                <UIcon v-else name="i-lucide-x" class="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>
      </template>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useConfirm } from '@/composables/useConfirm'
import { useMyToast } from '@/composables/useMyToast'

type AllowlistItem = { type: 'tool' | 'shell'; key: string }

const toast = useMyToast()
const { confirm } = useConfirm()
const { t } = useI18n()
const allowlistItems = ref<AllowlistItem[]>([])
const isLoadingAllowlist = ref(false)
const isClearingAllowlist = ref(false)
const removingAllowlistItemKeys = ref<Set<string>>(new Set())
const commandAllowlistItems = computed(() => allowlistItems.value.filter(item => item.type === 'shell'))
const mcpAllowlistItems = computed(() => allowlistItems.value.filter(item => item.type === 'tool'))

function itemKey(item: AllowlistItem) {
  return `${item.type}:${item.key}`
}

function itemLabel(item: AllowlistItem) {
  if (item.type === 'shell') return item.key
  return item.key
}

function isRemovingItem(item: AllowlistItem) {
  return removingAllowlistItemKeys.value.has(itemKey(item))
}

async function loadAllowlist() {
  isLoadingAllowlist.value = true
  try {
    const rows = await window.ipc('toolAllowlist:list')
    allowlistItems.value = rows as AllowlistItem[]
  } catch (error) {
    toast.error(error instanceof Error ? error.message : String(error))
  } finally {
    isLoadingAllowlist.value = false
  }
}

async function handleRemoveAllowlistItem(item: AllowlistItem) {
  const key = itemKey(item)
  if (removingAllowlistItemKeys.value.has(key)) return
  const next = new Set(removingAllowlistItemKeys.value)
  next.add(key)
  removingAllowlistItemKeys.value = next
  try {
    await window.ipc('toolAllowlist:remove', {
      type: item.type,
      key: item.key
    })
    allowlistItems.value = allowlistItems.value.filter((row) => itemKey(row) !== key)
  } catch (error) {
    toast.error(error instanceof Error ? error.message : String(error))
  } finally {
    const done = new Set(removingAllowlistItemKeys.value)
    done.delete(key)
    removingAllowlistItemKeys.value = done
  }
}

async function handleClearAllowlist() {
  if (allowlistItems.value.length === 0) return
  const confirmed = await confirm({
    title: t('settings.toolAllowlist.clearConfirmTitle'),
    content: t('settings.toolAllowlist.clearConfirmContent'),
    confirmText: t('settings.toolAllowlist.clearAll'),
    cancelText: t('common.cancel'),
    confirmColor: 'error',
    confirmIcon: 'i-lucide-trash-2'
  })
  if (!confirmed) return
  isClearingAllowlist.value = true
  try {
    await window.ipc('toolAllowlist:clear')
    allowlistItems.value = []
  } catch (error) {
    toast.error(error instanceof Error ? error.message : String(error))
  } finally {
    isClearingAllowlist.value = false
  }
}

onMounted(() => {
  void loadAllowlist()
})
</script>
