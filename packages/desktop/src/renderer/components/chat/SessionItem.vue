<template>
  <div class="flex items-center gap-0.5 w-full pl-1.5">
    <UIcon
      v-if="!isEditing && item.isFavorite"
      name="i-heroicons-star-solid"
      class="flex-none w-4 h-4 shrink-0 text-warning"
    />

    <!-- 编辑模式 -->
    <UInput
      v-if="isEditing"
      v-model="localEditingTitle"
      variant="none"
      ref="editInputRef"
      size="md"
      class="w-full"
      :ui="{
        base: 'px-0 py-0.5'
      }"
      @click.stop
      @blur="handleSave"
      @keydown.enter="handleSave"
      @keydown.esc="$emit('cancel')"
    />
    
    <!-- 显示模式 -->
    <div v-else class="flex-1 min-w-0">
      <WaveSweep :active="isStreaming" class="min-w-0">
        <UText
          :text="item.title"
          content-class="text-sm inline-block max-w-full align-top"
          text-class="wave-sweep-text"
        />
      </WaveSweep>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import UText from '../UText.vue'
import WaveSweep from '../common/WaveSweep.vue'

const { t } = useI18n()

interface SessionItemProps {
  item: {
    id: string
    title: string
    isFavorite?: boolean
  }
  isEditing?: boolean
  isBranch?: boolean
  isStreaming?: boolean
}

const props = withDefaults(defineProps<SessionItemProps>(), {
  isEditing: false,
  isBranch: false,
  isStreaming: false,
})

const emit = defineEmits<{
  'save': [title: string]
  'cancel': []
  'toggleFavorite': []
}>()

// 组件内部的编辑状态
const localEditingTitle = ref('')

// 编辑输入框的 ref
const editInputRef = ref<any>(null)

// 防止重复触发保存
const isSaving = ref(false)

// 监听编辑状态，初始化本地状态并自动聚焦
watch(() => props.isEditing, (isEditing) => {
  if (isEditing) {
    // 从 item.title 初始化本地编辑状态
    localEditingTitle.value = props.item.title
    isSaving.value = false  // 重置保存状态
    
    nextTick(() => {
      if (editInputRef.value) {
        const inputElement = editInputRef.value.inputRef as HTMLInputElement
        if (inputElement) {
          inputElement.select()
        }
      }
    })
  }
})

// 内部保存方法
function handleSave() {
  // 防御：如果不在编辑状态或正在保存中，不处理
  if (!props.isEditing || isSaving.value) return
  
  isSaving.value = true
  
  // 通过事件把标题值传递给父组件
  emit('save', localEditingTitle.value)
  
  // 延迟重置，确保不会重复触发
  setTimeout(() => {
    isSaving.value = false
  }, 100)
}
</script>
