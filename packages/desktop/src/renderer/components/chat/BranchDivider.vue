<template>
  <div class="my-6">
    <div class="flex items-center gap-3">
      <!-- 左侧虚线 -->
      <div class="flex-1 h-px bg-linear-to-r from-transparent via-gray-300 to-gray-300 border-t border-dashed border-default"></div>
      
      <!-- 中间内容 -->
      <div 
        class="flex items-center gap-1 px-1 py-2 transition-all"
        :class="{ 
          'cursor-pointer': canNavigate 
        }"
        @click="handleGoToParent"
      >
        <UIcon name="i-lucide-git-branch" class="w-3.5 h-3.5 text-muted" />
        <span class="text-xs text-default">
          {{ t("chat.branchDivider.prefix") }}
          <span class="font-medium text-default">{{ parentTitle }}</span>
          {{ t("chat.branchDivider.suffix") }}
        </span>
      </div>
      
      <!-- 右侧虚线 -->
      <div class="flex-1 h-px bg-linear-to-l from-transparent via-gray-300 to-gray-300 border-t border-dashed border-default"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useChatStore } from '@/stores/useChatStore'

const { t } = useI18n()
const router = useRouter()
const chatStore = useChatStore()

const currentSession = computed(() => chatStore.currentSession)

// 父会话信息
const parentSession = computed(() => {
  if (!currentSession.value?.parentSessionId) return null
  return chatStore.sessions.find(s => s.id === currentSession.value.parentSessionId)
})

const parentTitle = computed(() => {
  return parentSession.value?.title || t('chat.branchDivider.mainSession')
})

const canNavigate = computed(() => {
  return !!currentSession.value?.parentSessionId
})

function handleGoToParent() {
  if (!canNavigate.value) return
  
  const parentId = currentSession.value?.parentSessionId
  if (parentId) {
    router.push({ 
      name: 'chat', 
      params: { sessionId: parentId }
    })
  }
}
</script>
