<template>
  <UScrollArea 
    ref="scrollAreaRef"
    v-slot="{ item, index }"
    :items="items" 
    :virtualize="virtualize || false" 
    :class="containerClass"
  >
    <template v-if="item">
      <!-- 分割线 -->
      <div
        v-if="isDivider(item)"
        :data-session-id="`divider-${index}`"
        class="my-2 border-t border-default shrink-0"
      />
      <!-- 主项 -->
      <UListItem
        v-else
        :data-session-id="getItemValue(item, index)"
        :active="isActive(item)"
        :disabled="getItemDisabled(item)"
        :size="size"
        :collapsible="collapsible && hasChildren(item)"
        :expanded="isExpanded(item)"
        @click="handleItemClick(item)"
        @toggle="handleToggle(item)"
      >
        <slot name="item" :item="item" :index="index" :active="isActive(item)">
          {{ getItemLabel(item) }}
        </slot>
        
        <template v-if="$slots['item-trailing']" #trailing>
          <slot name="item-trailing" :item="item" :index="index" :active="isActive(item)" />
        </template>
      </UListItem>
      
      <!-- 子项面板 -->
      <UCollapsible
        v-if="collapsible && hasChildren(item)"
        v-model:open="expandedMap[getItemValue(item, index)]"
        disabled
      >
        <template #content>
          <div :class="childrenContainerClass">
            <UListItem
              v-for="(child, childIndex) in getChildren(item)"
              :key="getItemValue(child, childIndex)"
              :data-session-id="getItemValue(child, childIndex)"
              :active="isActive(child)"
              :disabled="getItemDisabled(child)"
              :size="size"
              @click="handleItemClick(child)"
            >
              <slot name="child-item" :item="child" :parent="item" :index="childIndex" :active="isActive(child)">
                <slot name="item" :item="child" :index="childIndex" :active="isActive(child)">
                  {{ getItemLabel(child) }}
                </slot>
              </slot>
              
              <template v-if="$slots['child-item-trailing'] || $slots['item-trailing']" #trailing>
                <slot name="child-item-trailing" :item="child" :parent="item" :index="childIndex" :active="isActive(child)">
                  <slot name="item-trailing" :item="child" :index="childIndex" :active="isActive(child)" />
                </slot>
              </template>
            </UListItem>
          </div>
        </template>
      </UCollapsible>
    </template>
  </UScrollArea>
</template>

<script setup lang="ts" generic="T extends Record<string, any>">
import { computed, reactive, ref } from 'vue'
import UListItem from './UListItem.vue'

interface ScrollAreaVirtualizeOptions {
  estimateSize?: number | ((index: number) => number)
  lanes?: number
  overscan?: number
  paddingStart?: number
  paddingEnd?: number
  scrollPaddingStart?: number
  scrollPaddingEnd?: number
  initialOffset?: number | (() => number)
  gap?: number
  scrollMargin?: number
  indexAttribute?: string
  isScrollingResetDelay?: number
  useScrollendEvent?: boolean
  useAnimationFrameWithResizeObserver?: boolean
}

interface Props {
  items: T[]
  modelValue?: string | number | null
  valueKey?: string
  labelKey?: string
  disabledKey?: string
  childrenKey?: string
  size?: 'sm' | 'md' | 'lg'
  gap?: 'none' | 'sm' | 'md' | 'lg'
  padding?: 'none' | 'sm' | 'md' | 'lg'
  collapsible?: boolean
  childrenIndent?: string
  expandedKeys?: (string | number)[]
  virtualize?: boolean | ScrollAreaVirtualizeOptions
}

const props = withDefaults(defineProps<Props>(), {
  valueKey: 'id',
  labelKey: 'label',
  disabledKey: 'disabled',
  childrenKey: 'children',
  size: 'md',
  gap: 'sm',
  padding: 'md',
  collapsible: false,
  childrenIndent: 'ml-2'
})

const emit = defineEmits<{
  'update:modelValue': [value: string | number | null]
  'update:expandedKeys': [keys: (string | number)[]]
  'select': [item: T]
  'toggle': [item: T, expanded: boolean]
}>()

// 展开状态映射表
const expandedMap = reactive<Record<string | number, boolean>>({})

// UScrollArea 的引用
const scrollAreaRef = ref()

// 初始化展开状态
if (props.expandedKeys) {
  props.expandedKeys.forEach(key => {
    expandedMap[key] = true
  })
}

const containerClass = computed(() => {
  const gapClasses = {
    none: '',
    sm: '',
    md: 'space-y-1',
    lg: 'space-y-2'
  }
  
  const paddingClasses = {
    none: '',
    sm: 'p-1',
    md: 'p-2',
    lg: 'p-3'
  }
  
  return [
    paddingClasses[props.padding],
    gapClasses[props.gap]
  ]
})

const childrenContainerClass = computed(() => {
  const gapClasses = {
    none: '',
    sm: '',
    md: 'space-y-1',
    lg: 'space-y-2'
  }
  
  return [
    props.childrenIndent,
    gapClasses[props.gap]
  ]
})

function isDivider(item: T): boolean {
  return item?.divider === true
}

function getItemValue(item: T, index: number): string | number {
  return item[props.valueKey] ?? index
}

function getItemLabel(item: T): string {
  return item[props.labelKey] ?? String(item)
}

function getItemDisabled(item: T): boolean {
  return item[props.disabledKey] ?? false
}

function hasChildren(item: T): boolean {
  const children = item[props.childrenKey]
  return Array.isArray(children) && children.length > 0
}

function getChildren(item: T): T[] {
  return item[props.childrenKey] ?? []
}

function isActive(item: T): boolean {
  return props.modelValue === getItemValue(item, 0)
}

function isExpanded(item: T): boolean {
  const key = getItemValue(item, 0)
  return expandedMap[key] ?? false
}

function handleItemClick(item: T) {
  if (getItemDisabled(item)) return
  
  const value = getItemValue(item, 0)
  emit('update:modelValue', value)
  emit('select', item)
}

function handleToggle(item: T) {
  const key = getItemValue(item, 0)
  const newValue = !expandedMap[key]
  expandedMap[key] = newValue
  
  emit('toggle', item, newValue)
  
  // 更新 expandedKeys
  const keys = Object.keys(expandedMap).filter(k => expandedMap[k])
  emit('update:expandedKeys', keys)
}

// 暴露方法供外部使用
defineExpose({
  expand(key: string | number) {
    expandedMap[key] = true
  },
  collapse(key: string | number) {
    expandedMap[key] = false
  },
  toggle(key: string | number) {
    expandedMap[key] = !expandedMap[key]
  },
  scrollToIndex(index: number, options?: { align?: 'start' | 'center' | 'end' | 'auto', behavior?: ScrollBehavior }) {
    // 如果启用了虚拟滚动，使用 virtualizer 的 scrollToIndex
    if (scrollAreaRef.value?.virtualizer) {
      scrollAreaRef.value.virtualizer.scrollToIndex(index, options)
    } else {
      // 没有启用虚拟滚动，尝试使用原生滚动
      const container = scrollAreaRef.value?.$el
      if (!container) return
      
      // 查找对应索引的元素
      const items = container.querySelectorAll('[data-session-id]')
      const targetElement = items[index]
      
      if (targetElement) {
        targetElement.scrollIntoView({
          behavior: options?.behavior || 'smooth',
          block: options?.align || 'start'
        })
      }
    }
  },
  $el: computed(() => scrollAreaRef.value?.$el)
})

</script>

