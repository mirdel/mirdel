<template>
  <UModal 
    v-model:open="state.open" 
    :title="state.title" 
    :ui="{ footer: 'justify-end' }"
  >
    <template #body>
      <div class="text-sm leading-7" v-html="state.content"></div>
    </template>

    <template #footer>
      <UButton variant="outline" color="neutral" @click="handleCancel">
        {{ state.cancelText }}
      </UButton>
      <UButton :color="state.confirmColor" :icon="state.confirmIcon" icon-size="sm" @click="handleConfirm">
        {{ state.confirmText }}
      </UButton>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { useConfirm } from '@/composables/useConfirm';

const { state, handleConfirm, handleCancel } = useConfirm();
</script>

