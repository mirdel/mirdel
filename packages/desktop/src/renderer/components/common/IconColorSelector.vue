<template>
  <UPopover v-model:open="iconPickerOpen" :content="{ side: 'bottom', align: 'start' }" :ui="{ content: 'p-4 w-80' }">
    <UButton color="neutral" variant="outline">
      <UIcon
        :name="modelIcon"
        class="w-4 h-4"
        :style="{ color: modelColor }"
      />
    </UButton>

    <template #content>
      <div class="flex flex-col gap-4">
        <div>
          <div class="text-sm font-medium mb-2">
            {{ colorLabel }}
          </div>

          <div class="flex flex-wrap gap-3">
            <button
              v-for="presetColor in colors"
              :key="presetColor"
              type="button"
              class="w-6 h-6 rounded-full cursor-pointer transition-all hover:scale-110"
              :style="{
                backgroundColor: presetColor,
                boxShadow: modelColor === presetColor ? `0 0 0 2px white, 0 0 0 4px ${presetColor}` : undefined
              }"
              @click="modelColor = presetColor"
            />

            <UPopover v-model:open="colorPickerOpen" :ui="{ content: 'p-2' }">
              <button
                type="button"
                class="w-6 h-6 rounded-full cursor-pointer transition-all hover:scale-110 flex items-center justify-center"
                :style="{
                  boxShadow: !colors.includes(modelColor) ? `0 0 0 2px white, 0 0 0 4px ${modelColor}` : undefined
                }"
              >
                <UIcon name="i-lucide-palette" class="w-6 h-6" />
              </button>

              <template #content>
                <UColorPicker
                  v-model="customColor"
                  size="sm"
                  @update:model-value="(value) => { modelColor = value }"
                />
              </template>
            </UPopover>
          </div>
        </div>

        <div>
          <div class="text-sm font-medium mb-2">
            {{ iconLabel }}
          </div>

          <div class="flex flex-wrap gap-0.5 max-h-52 overflow-y-auto -mr-4 pr-4">
            <button
              v-for="presetIcon in icons"
              :key="presetIcon"
              type="button"
              class="w-8.5 h-8.5 flex items-center justify-center rounded-lg hover:bg-elevated transition-colors"
              :class="modelIcon === presetIcon ? 'bg-elevated' : ''"
              @click="modelIcon = presetIcon"
            >
              <UIcon
                :name="presetIcon"
                class="w-5 h-5"
                :style="{ color: modelColor }"
              />
            </button>
          </div>
        </div>
      </div>
    </template>
  </UPopover>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { PRESET_COLORS, PRESET_ICONS, DEFAULT_COLOR, DEFAULT_ICON } from '@/config/project-icon-config'

const props = withDefaults(defineProps<{
  icon?: string
  color?: string
  icons?: string[]
  colors?: string[]
  iconLabel?: string
  colorLabel?: string
}>(), {
  icon: DEFAULT_ICON,
  color: DEFAULT_COLOR,
  icons: () => PRESET_ICONS,
  colors: () => PRESET_COLORS,
  iconLabel: 'Icon',
  colorLabel: 'Color'
})

const emit = defineEmits<{
  'update:icon': [value: string]
  'update:color': [value: string]
}>()

const iconPickerOpen = ref(false)
const colorPickerOpen = ref(false)
const customColor = ref(props.color || DEFAULT_COLOR)

const modelIcon = computed({
  get: () => props.icon || DEFAULT_ICON,
  set: (value: string) => emit('update:icon', value)
})

const modelColor = computed({
  get: () => props.color || DEFAULT_COLOR,
  set: (value: string) => {
    customColor.value = value
    emit('update:color', value)
  }
})

const icons = computed(() => props.icons || PRESET_ICONS)
const colors = computed(() => props.colors || PRESET_COLORS)
const iconLabel = computed(() => props.iconLabel || 'Icon')
const colorLabel = computed(() => props.colorLabel || 'Color')
</script>
