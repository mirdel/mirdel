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
      <div class="h-full overflow-x-auto rounded-xl">
        <div class="h-full min-w-[1024px]">
          <RouterView v-slot="{ Component, route }">
            <KeepAlive include="AppWorkspaceView">
              <component :is="Component" :key="route.name === 'app-workspace' ? route.fullPath : route.name || route.fullPath" />
            </KeepAlive>
          </RouterView>
        </div>
      </div>
    </main>

    <!-- 全局确认对话框 -->
    <ConfirmDialog />
    <GlobalSearchModal
      v-model:open="searchOpen"
      :preset="searchPreset"
    />
    <PromptLibraryCreateModal />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue"
import { useI18n } from "vue-i18n"
import { useRoute, useRouter } from "vue-router"
import GlobalSidebar from "@/components/GlobalSidebar.vue"
import ConfirmDialog from "@/components/ConfirmDialog.vue"
import GlobalSearchModal from "@/components/GlobalSearchModal.vue"
import PromptLibraryCreateModal from "@/components/settings/PromptLibraryCreateModal.vue"
import { useMyToast } from "@/composables/useMyToast"
import { useChatStore } from "@/stores/useChatStore"
import { useOpenedAppStore } from "@/stores/useOpenedAppStore"
import emitter from "@/utils/emitter"

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const toast = useMyToast()
const chatStore = useChatStore()
const openedAppStore = useOpenedAppStore()
const searchOpen = ref(false)
const rendererDialogOpen = ref(false)
const searchPreset = ref<{
  scope?: "all" | "messages" | "sessions" | "translations" | "notes" | "knowledge";
  onlyCurrentSession?: boolean;
  messageTimeRange?: "all" | "today" | "3d" | "7d" | "30d";
} | null>(null)

let unsubscribeStream: (() => void) | null = null
let rendererDialogObserver: MutationObserver | null = null
let rendererDialogCheckFrame = 0
let occludedWebAppletId: string | null = null

const activeWebAppletId = computed(() => {
  if (route.name !== "app-workspace") return null
  const raw = route.params.id
  return typeof raw === "string" ? raw : Array.isArray(raw) ? (raw[0] ?? null) : null
})

const isActiveWebApplet = computed(() => {
  const appletId = activeWebAppletId.value
  if (!appletId) return false
  return openedAppStore.openedApplets.some((applet) => applet.id === appletId && applet.type === "web")
})

const shouldOccludeActiveWebApplet = computed(() => searchOpen.value || rendererDialogOpen.value)

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

function isRendererDialogVisible(element: Element) {
  if (!(element instanceof HTMLElement)) return false
  if (element.closest("[data-state='closed'], [aria-hidden='true']")) return false
  const style = window.getComputedStyle(element)
  if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false
  return element.getClientRects().length > 0
}

function hasVisibleRendererDialog() {
  return [...document.querySelectorAll("[role='dialog'], [data-reka-dialog-content]")]
    .some(isRendererDialogVisible)
}

function refreshRendererDialogOpen() {
  rendererDialogOpen.value = hasVisibleRendererDialog()
}

function scheduleRendererDialogCheck() {
  if (rendererDialogCheckFrame) return
  rendererDialogCheckFrame = requestAnimationFrame(() => {
    rendererDialogCheckFrame = 0
    refreshRendererDialogOpen()
  })
}

function startRendererDialogObserver() {
  if (rendererDialogObserver) return
  rendererDialogObserver = new MutationObserver(scheduleRendererDialogCheck)
  rendererDialogObserver.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["class", "style", "role", "data-state", "aria-hidden"],
  })
  refreshRendererDialogOpen()
}

function stopRendererDialogObserver() {
  rendererDialogObserver?.disconnect()
  rendererDialogObserver = null
  if (rendererDialogCheckFrame) {
    cancelAnimationFrame(rendererDialogCheckFrame)
    rendererDialogCheckFrame = 0
  }
}

function restoreOccludedWebApplet() {
  if (!occludedWebAppletId) return
  window.appWebView.setOccluded({ appletId: occludedWebAppletId, occluded: false })
  occludedWebAppletId = null
}

watch(
  [activeWebAppletId, isActiveWebApplet, shouldOccludeActiveWebApplet],
  ([appletId, isWebApplet, shouldOcclude]) => {
    if (!appletId || !isWebApplet || !shouldOcclude) {
      restoreOccludedWebApplet()
      if (appletId && isWebApplet) {
        window.appWebView.setOccluded({ appletId, occluded: false })
      }
      return
    }

    if (occludedWebAppletId && occludedWebAppletId !== appletId) {
      window.appWebView.setOccluded({ appletId: occludedWebAppletId, occluded: false })
    }
    window.appWebView.setOccluded({ appletId, occluded: true })
    occludedWebAppletId = appletId
  }
)

onMounted(() => {
  startRendererDialogObserver()
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
  stopRendererDialogObserver()
  restoreOccludedWebApplet()
  emitter.off('global-search:open', openGlobalSearchWithPreset)
  unsubscribeStream?.()
  unsubscribeStream = null
})
</script>
