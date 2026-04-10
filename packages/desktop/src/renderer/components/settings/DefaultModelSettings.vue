<template>
  <!-- 直接占满空间，不需要第二栏 -->
  <section class="flex-1 min-w-0 bg-default rounded-xl overflow-y-auto">
    <div class="p-4 flex flex-col gap-3">
      <ListCell
        :title="t('settings.defaultModel.general.label')"
        :description="t('settings.defaultModel.general.description')"
      >
        <template #trailing>
          <ModelSelector
            v-model="defaultModels.general"
            :show-default="false"
            model-type="chat"
            @update:model-value="(val) => handleDefaultModelChange('general', val)"
          />
        </template>
      </ListCell>

      <ListCell
        :title="t('settings.defaultModel.fast.label')"
        :description="t('settings.defaultModel.fast.description')"
      >
        <template #trailing>
          <ModelSelector
            v-model="defaultModels.fast"
            :show-default="false"
            model-type="chat"
            @update:model-value="(val) => handleDefaultModelChange('fast', val)"
          />
        </template>
      </ListCell>

      <ListCell
        :title="t('settings.defaultModel.translate.label')"
        :description="t('settings.defaultModel.translate.description')"
      >
        <template #trailing>
          <ModelSelector
            v-model="defaultModels.translate"
            :show-default="false"
            model-type="chat"
            @update:model-value="(val) => handleDefaultModelChange('translate', val)"
          />
        </template>
      </ListCell>

      <ListCell
        :title="t('settings.defaultModel.embedding.label')"
        :description="t('settings.defaultModel.embedding.description')"
      >
        <template #trailing>
          <ModelSelector
            v-model="defaultModels.embedding"
            :show-default="false"
            model-type="embedding"
            @update:model-value="(val) => handleDefaultModelChange('embedding', val)"
          />
        </template>
      </ListCell>

      <ListCell
        :title="t('settings.defaultModel.imageGenerate.label')"
        :description="t('settings.defaultModel.imageGenerate.description')"
      >
        <template #trailing>
          <ModelSelector
            v-model="defaultModels.imageGenerate"
            :show-default="false"
            model-type="image-gen"
            image-intent="generate"
            @update:model-value="(val) => handleDefaultModelChange('imageGenerate', val)"
          />
        </template>
      </ListCell>

      <ListCell
        :title="t('settings.defaultModel.imageEdit.label')"
        :description="t('settings.defaultModel.imageEdit.description')"
      >
        <template #trailing>
          <ModelSelector
            v-model="defaultModels.imageEdit"
            :show-default="false"
            model-type="image-gen"
            image-intent="edit"
            @update:model-value="(val) => handleDefaultModelChange('imageEdit', val)"
          />
        </template>
      </ListCell>

      <ListCell
        :title="t('settings.defaultModel.videoGenerate.label')"
        :description="t('settings.defaultModel.videoGenerate.description')"
      >
        <template #trailing>
          <ModelSelector
            v-model="defaultModels.videoGenerate"
            :show-default="false"
            model-type="video-gen"
            @update:model-value="(val) => handleDefaultModelChange('videoGenerate', val)"
          />
        </template>
      </ListCell>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { loggerServiceRenderer } from "@shared";
import { useMyToast } from "@/composables/useMyToast";
import { useSettingsStore } from "@/stores/useSettingsStore";
import ListCell from "@/components/ListCell.vue";
import ModelSelector from "@/components/ModelSelector.vue";

const logger = loggerServiceRenderer.withContext("settings:default-model");
const { t } = useI18n();
const toast = useMyToast();
const settingsStore = useSettingsStore();

const defaultModelsFromStore = computed(() => settingsStore.defaultModels);

const defaultModels = ref<{
  general: string;
  fast: string;
  translate: string;
  embedding: string;
  imageGenerate: string;
  imageEdit: string;
  videoGenerate: string;
}>({
  general: '',
  fast: '',
  translate: '',
  embedding: '',
  imageGenerate: '',
  imageEdit: '',
  videoGenerate: '',
});

// 从 store 同步到本地表单
function syncFromStore() {
  const configs = defaultModelsFromStore.value;
  
  if (configs.general) {
    defaultModels.value.general = `${configs.general.providerId}::${configs.general.modelId}`;
  } else {
    defaultModels.value.general = '';
  }
  
  if (configs.fast) {
    defaultModels.value.fast = `${configs.fast.providerId}::${configs.fast.modelId}`;
  } else {
    defaultModels.value.fast = '';
  }
  
  if (configs.translate) {
    defaultModels.value.translate = `${configs.translate.providerId}::${configs.translate.modelId}`;
  } else {
    defaultModels.value.translate = '';
  }
  
  if (configs.embedding) {
    defaultModels.value.embedding = `${configs.embedding.providerId}::${configs.embedding.modelId}`;
  } else {
    defaultModels.value.embedding = '';
  }

  if (configs.imageGenerate) {
    defaultModels.value.imageGenerate = `${configs.imageGenerate.providerId}::${configs.imageGenerate.modelId}`;
  } else {
    defaultModels.value.imageGenerate = '';
  }

  if (configs.imageEdit) {
    defaultModels.value.imageEdit = `${configs.imageEdit.providerId}::${configs.imageEdit.modelId}`;
  } else {
    defaultModels.value.imageEdit = '';
  }

  if (configs.videoGenerate) {
    defaultModels.value.videoGenerate = `${configs.videoGenerate.providerId}::${configs.videoGenerate.modelId}`;
  } else {
    defaultModels.value.videoGenerate = '';
  }
}

// 监听 store 中的 defaultModels 变化，自动同步到本地表单
watch(
  () => defaultModelsFromStore.value,
  () => {
    syncFromStore();
  },
  { immediate: true, deep: true }
);

const typeLabels: Record<string, string> = {
  general: 'settings.defaultModel.type.general',
  fast: 'settings.defaultModel.type.fast',
  translate: 'settings.defaultModel.type.translate',
  embedding: 'settings.defaultModel.type.embedding',
  imageGenerate: 'settings.defaultModel.type.imageGenerate',
  imageEdit: 'settings.defaultModel.type.imageEdit',
  videoGenerate: 'settings.defaultModel.type.videoGenerate',
};

async function handleDefaultModelChange(type: 'general' | 'fast' | 'translate' | 'embedding' | 'imageGenerate' | 'imageEdit' | 'videoGenerate', value: string) {
  try {
    if (!value) {
      await settingsStore.setDefaultModel(type, { providerId: '', modelId: '' });
      logger.info('default model cleared', { type });
      toast.success({
        title: t('settings.defaultModel.saveSuccess'),
        description: t('settings.defaultModel.updated', { type: t(typeLabels[type] || type) })
      });
      return;
    }
    
    const [providerId, modelId] = value.split('::');
    if (!providerId || !modelId) return;
    
    await settingsStore.setDefaultModel(type, { providerId, modelId });
    
    logger.info('default model updated', { type, providerId, modelId });
    toast.success({
      title: t('settings.defaultModel.saveSuccess'),
      description: t('settings.defaultModel.updated', { type: t(typeLabels[type] || type) })
    });
  } catch (error) {
    logger.error('Failed to update default model', { error });
    toast.error({
      title: t('settings.defaultModel.saveFailed'),
      description: String(error)
    });
  }
}
</script>
