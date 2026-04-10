<template>
  <UModal 
    v-model:open="isOpen" 
    :title="modalTitle"
    :ui="{ body: 'p-4' }"
  >
    <template #body>
      <div class="flex flex-col gap-4">
        <!-- 帮助说明：仅在创建模式显示 -->
        <UAlert
          v-if="!isEditMode"
          color="info"
          variant="soft"
          :description="t('projectForm.help')"
        />

        <!-- 项目名称 -->
        <UFormField :label="t('projectForm.name')" required>
          <UFieldGroup size="md" class="w-full">
            <IconColorSelector
              v-model:icon="formData.icon"
              v-model:color="formData.color"
              :icon-label="t('projectForm.icon')"
              :color-label="t('projectForm.color')"
            />

            <!-- 输入框 -->
            <UInput
              ref="nameInputRef"
              v-model="formData.name"
              :placeholder="t('projectForm.namePlaceholder')"
              color="neutral"
              variant="outline"
              class="flex-1"
            >
              <template #trailing>
                <span 
                  class="text-xs tabular-nums"
                  :class="nameUnits > MAX_NAME_UNITS ? 'text-error' : 'text-default'"
                >
                  {{ nameUnits }}/{{ MAX_NAME_UNITS }}
                </span>
              </template>
            </UInput>
          </UFieldGroup>
        </UFormField>

        <!-- 项目描述 -->
        <div class="flex flex-col gap-2">
          <label class="text-sm font-medium">
            {{ t("projectForm.description") }}
          </label>
          <UTextarea
            v-model="formData.description"
            :placeholder="t('projectForm.descriptionPlaceholder')"
            :rows="3"
          />
        </div>

        <!-- 绑定场景 -->
        <div class="flex flex-col gap-2">
          <label class="text-sm font-medium">
            {{ t("projectForm.scenario") }}
          </label>
          <USelect
            v-model="formData.scenarioId"
            :items="scenarioOptions"
            value-key="value"
            size="md"
          />
        </div>
      </div>
    </template>

    <template #footer>
      <div class="w-full flex justify-end gap-2">
        <UButton
          variant="outline"
          color="neutral"
          @click="handleCancel"
        >
          {{ t("notes.modal.cancel") }}
        </UButton>
        <UButton
          :disabled="!isValid"
          :loading="loading"
          @click="handleConfirm"
        >
          {{ t("notes.modal.confirm") }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { useProjectStore } from '@/stores/useProjectStore'
import { useMyToast } from '@/composables/useMyToast'
import { calculateTextUnits } from '@/utils/textLength'
import { DEFAULT_COLOR, DEFAULT_ICON } from '@/config/project-icon-config'
import type { Project } from '@/stores/useProjectStore'
import IconColorSelector from '@/components/common/IconColorSelector.vue'

// 分类名称最大单位数（一个汉字占2个单位，英文字母占1个单位）
const MAX_NAME_UNITS = 20

const props = defineProps<{
  modelValue: boolean
  project?: Project | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const settingsStore = useSettingsStore()
const projectStore = useProjectStore()
const toast = useMyToast()
const { t } = useI18n()

const nameInputRef = ref()

const isOpen = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

// 判断是否为编辑模式
const isEditMode = computed(() => !!props.project)

// 动态标题
const modalTitle = computed(() => isEditMode.value ? t('projectForm.editTitle') : t('projectForm.createTitle'))

const formData = ref({
  name: '',
  description: '',
  scenarioId: 'default-scenario',
  color: DEFAULT_COLOR,
  icon: DEFAULT_ICON
})

const loading = ref(false)

// 计算分类名称的单位数
const nameUnits = computed(() => calculateTextUnits(formData.value.name))

const scenarioOptions = computed(() => 
  settingsStore.scenarios.map(s => ({
    label: s.name,
    value: s.id
  }))
)

const isValid = computed(() => {
  return formData.value.name.trim().length > 0 && 
         formData.value.scenarioId.length > 0 &&
         nameUnits.value <= MAX_NAME_UNITS
})

// 监听 modal 打开和 project 变化，初始化表单
watch([() => props.modelValue, () => props.project], ([open, project]) => {
  if (open) {
    if (project) {
      // 编辑模式：初始化为项目数据
      formData.value = {
        name: project.name,
        description: project.description || '',
        scenarioId: project.scenarioId,
        color: project.color || DEFAULT_COLOR,
        icon: project.icon || DEFAULT_ICON
      }
    } else {
      // 创建模式：重置为默认值
      formData.value = {
        name: '',
        description: '',
        scenarioId: 'default-scenario',
        color: DEFAULT_COLOR,
        icon: DEFAULT_ICON
      }
    }
    
    // 自动聚焦到名称输入框
    nextTick(() => {
      if (nameInputRef.value) {
        const inputElement = nameInputRef.value.inputRef as HTMLInputElement
        if (inputElement) {
          inputElement.focus()
        }
      }
    })
  }
})

function handleCancel() {
  isOpen.value = false
}

async function handleConfirm() {
  if (!isValid.value) return
  
  loading.value = true
  try {
    if (isEditMode.value && props.project) {
      // 编辑模式
      await projectStore.updateProject(props.project.id, {
        name: formData.value.name.trim(),
        description: formData.value.description.trim() || undefined,
        scenarioId: formData.value.scenarioId,
        color: formData.value.color,
        icon: formData.value.icon
      })
      toast.success(t('projectForm.updateSuccess'))
    } else {
      // 创建模式
      await projectStore.createProject({
        name: formData.value.name.trim(),
        description: formData.value.description.trim() || undefined,
        scenarioId: formData.value.scenarioId,
        color: formData.value.color,
        icon: formData.value.icon
      })
      toast.success(t('projectForm.createSuccess'))
    }
    
    isOpen.value = false
  } catch (error) {
    toast.error({
      title: isEditMode.value ? t('projectForm.updateFailed') : t('projectForm.createFailed'),
      description: String(error)
    })
  } finally {
    loading.value = false
  }
}
</script>
