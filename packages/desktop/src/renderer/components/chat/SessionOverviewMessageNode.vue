<template>
  <div
    :class="[
      'px-3 py-2 rounded-lg text-sm w-[220px] cursor-pointer',
      data.role === 'user' 
        ? 'bg-accented' 
        : 'bg-default border border-default'
    ]"
  >
    <div v-if="data.isDeleted" class="text-muted">
      {{ t("chat.sessionOverview.messageDeleted") }}
    </div>
    <MessagePreview 
      v-else
      :content="data.parts"
      :lines="2"
    />
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import MessagePreview from './MessagePreview.vue'

import type { MessageContentPart } from '@/utils/messageContentUtils'

const { t } = useI18n()

defineProps<{
  data: {
    messageId: string
    sessionId: string
    role: 'user' | 'assistant'
    parts: MessageContentPart[]
    isDeleted?: boolean
  }
}>()
</script>
