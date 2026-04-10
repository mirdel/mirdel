<template>
  <div class="mb-3 leading-7 group">
    <!-- 系统消息 -->
    <div>
      <!-- 系统提示词头部：图标 + 标题 -->
      <div class="mb-2 flex items-center gap-2.5">
        <!-- 系统设置图标 -->
        <UAvatar icon="i-lucide-settings" size="md" />
        <!-- 标题文本 -->
        <div class="flex items-center gap-2 text-xs select-none">
          <span class="truncate">{{ t("scenario.tabs.prompt") }}</span>
        </div>
      </div>
      
      <div class="flex-1 min-w-0">
        <!-- 内容：可折叠 -->
        <div 
          class="px-4 py-3 rounded-xl border border-default text-sm relative overflow-hidden"
        >
          <div 
            ref="contentRef"
            class="whitespace-pre-wrap transition-all duration-300 ease-in-out overflow-hidden"
            :style="{ maxHeight: contentMaxHeight }"
          >
            {{ content }}
          </div>
          
          <!-- 渐变遮罩：未展开时显示 -->
          <Transition
            enter-active-class="transition-opacity duration-300 ease-in-out"
            leave-active-class="transition-opacity duration-300 ease-in-out"
            enter-from-class="opacity-0"
            enter-to-class="opacity-100"
            leave-from-class="opacity-100"
            leave-to-class="opacity-0"
          >
            <div 
              v-if="!expanded && shouldShowToggle"
              class="absolute bottom-0 left-0 right-0 h-8 bg-linear-to-t from-primary-50 to-transparent pointer-events-none"
            />
          </Transition>
          
          <!-- 展开/收起按钮（内容超过阈值时显示） -->
          <div 
            v-if="shouldShowToggle"
            class="mt-2 text-xs text-default cursor-pointer flex items-center gap-1 select-none transition-colors"
            @click="toggleExpand"
          >
            <UIcon 
              name="i-lucide-chevron-down" 
              class="w-3 h-3 transition-transform duration-300"
              :class="{ 'rotate-180': expanded }"
            />
            <span>{{ expanded ? t('notes.common.collapse') : t('notes.common.expand') }}</span>
          </div>
        </div>
        
        <!-- 工具栏 -->
        <div class="mt-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <!-- 编辑按钮 -->
          <UTooltip :text="t('chat.systemPrompt.edit')">
            <UButton
              icon="i-lucide-square-pen"
              size="sm"
              color="neutral"
              variant="ghost"
              square
              @click="handleEdit"
            />
          </UTooltip>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const props = defineProps<{
  content: string
}>()

const emit = defineEmits<{
  edit: []
}>()

const expanded = ref(false)
const contentRef = ref<HTMLElement | null>(null)
const fullHeight = ref<number>(0)

// 判断是否需要显示展开/收起按钮（内容超过3行或150字符）
const shouldShowToggle = computed(() => {
  const lineCount = props.content.split('\n').length
  const charCount = props.content.length
  return lineCount > 3 || charCount > 150
})

// 计算内容的最大高度（用于过渡动画）
const contentMaxHeight = computed(() => {
  if (!shouldShowToggle.value) {
    return 'none'
  }
  return expanded.value ? `${fullHeight.value}px` : '80px'
})

// 切换展开/收起
function toggleExpand() {
  expanded.value = !expanded.value
}

// 编辑功能
function handleEdit() {
  emit('edit')
}

// 挂载后计算完整高度
onMounted(() => {
  nextTick(() => {
    if (contentRef.value) {
      fullHeight.value = contentRef.value.scrollHeight
    }
  })
})
</script>
