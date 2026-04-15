<template>
  <div
    class="h-screen flex bg-[linear-gradient(to_right,var(--ui-color-neutral-600)_0%,var(--ui-color-neutral-400)_20%,var(--ui-color-neutral-400)_100%)] dark:bg-[linear-gradient(to_right,var(--ui-color-neutral-800)_0%,var(--ui-color-neutral-600)_20%,var(--ui-color-neutral-600)_100%)]"
  >
    <!-- 第一列：全局导航（页面背景色） -->
    <aside class="shrink-0">
      <GlobalSidebar @open-search="openGlobalSearch" />
    </aside>

    <!-- 页面内容区：由各路由页面渲染第二/三列 -->
    <main class="flex-1 min-w-0 py-[6px] pr-[6px]">
      <RouterView />
    </main>

    <!-- 全局确认对话框 -->
    <ConfirmDialog />
    <GlobalSearchModal
      v-model:open="searchOpen"
      :preset="searchPreset"
    />
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue"
import { useI18n } from "vue-i18n"
import { useRoute, useRouter } from "vue-router"
import GlobalSidebar from "@/components/GlobalSidebar.vue"
import ConfirmDialog from "@/components/ConfirmDialog.vue"
import GlobalSearchModal from "@/components/GlobalSearchModal.vue"
import { useMyToast } from "@/composables/useMyToast"
import { useChatStore } from "@/stores/useChatStore"
import emitter from "@/utils/emitter"

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const toast = useMyToast()
const chatStore = useChatStore()
const searchOpen = ref(false)
const searchPreset = ref<{
  scope?: "all" | "messages" | "sessions" | "translations" | "notes" | "knowledge";
  onlyCurrentSession?: boolean;
  messageTimeRange?: "all" | "today" | "3d" | "7d" | "30d";
} | null>(null)

let unsubscribeStream: (() => void) | null = null

function isViewingSession(sessionId: string): boolean {
  return route.name === 'chat' && route.params.sessionId === sessionId
}

function gotoSession(sessionId: string) {
  void router.push({ name: 'chat', params: { sessionId } })
}

function openGlobalSearch() {
  searchPreset.value = null
  searchOpen.value = true
}

function openGlobalSearchWithPreset(preset: {
  scope?: "all" | "messages" | "sessions" | "translations" | "notes" | "knowledge";
  onlyCurrentSession?: boolean;
  messageTimeRange?: "all" | "today" | "3d" | "7d" | "30d";
}) {
  searchPreset.value = { ...preset }
  searchOpen.value = true
}

defineShortcuts({
  meta_k: {
    usingInput: true,
    handler: openGlobalSearch
  }
})

onMounted(() => {
  emitter.on('global-search:open', openGlobalSearchWithPreset)

  unsubscribeStream = window.chat.onStream((evt) => {
    if (evt.chunk.type !== 'finish') return
    if (isViewingSession(evt.sessionId)) return

    const session = chatStore.sessionById.get(evt.sessionId)
    if (session?.isTemporary) return

    chatStore.markSessionCompletedUnread(evt.sessionId)
    toast.success({
      title: t('layout.chatReplyComplete.title'),
      description: session?.title || t('layout.chatReplyComplete.fallbackDescription'),
      duration: 5000,
      onClick: () => gotoSession(evt.sessionId)
    })
  })
})

onUnmounted(() => {
  emitter.off('global-search:open', openGlobalSearchWithPreset)
  unsubscribeStream?.()
  unsubscribeStream = null
})
</script>
