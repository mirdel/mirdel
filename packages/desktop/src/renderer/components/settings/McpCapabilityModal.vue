<template>
  <UModal v-model:open="isOpen" :title="modalTitle">
    <template #body>
      <!-- 工具详情 -->
      <div v-if="type === 'tool' && data" class="flex flex-col gap-4">
        <div>
          <div class="text-sm font-medium mb-1">{{ t('settings.mcpCapability.field.name') }}</div>
          <code class="text-sm bg-muted px-2 py-1 rounded">{{ data.name }}</code>
        </div>
        
        <div v-if="data.description">
          <div class="text-sm font-medium mb-1">{{ t('settings.mcpCapability.field.description') }}</div>
          <p class="text-sm opacity-70">{{ data.description }}</p>
        </div>
        
        <div v-if="data.inputSchema">
          <div class="text-sm font-medium mb-2">{{ t('settings.mcpCapability.field.inputSchema') }}</div>
          <div class="border border-default rounded overflow-hidden">
            <UScrollArea class="max-h-96">
              <pre class="text-xs p-3 bg-muted">{{ formatJson(data.inputSchema) }}</pre>
            </UScrollArea>
          </div>
        </div>
      </div>

      <!-- 提示详情 -->
      <div v-if="type === 'prompt' && data" class="flex flex-col gap-4">
        <div>
          <div class="text-sm font-medium mb-1">{{ t('settings.mcpCapability.field.name') }}</div>
          <code class="text-sm bg-muted px-2 py-1 rounded">{{ data.name }}</code>
        </div>
        
        <div v-if="data.description">
          <div class="text-sm font-medium mb-1">{{ t('settings.mcpCapability.field.description') }}</div>
          <p class="text-sm opacity-70">{{ data.description }}</p>
        </div>
        
        <div v-if="data.arguments && data.arguments.length > 0">
          <div class="text-sm font-medium mb-2">{{ t('settings.mcpCapability.field.arguments') }}</div>
          <div class="border border-default rounded overflow-hidden">
            <table class="w-full text-sm">
              <thead class="bg-muted">
                <tr>
                  <th class="text-left px-3 py-2 font-medium">{{ t('settings.mcpCapability.field.name') }}</th>
                  <th class="text-left px-3 py-2 font-medium">{{ t('settings.mcpCapability.field.required') }}</th>
                  <th class="text-left px-3 py-2 font-medium">{{ t('settings.mcpCapability.field.description') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="(arg, index) in data.arguments"
                  :key="index"
                  class="border-t border-default"
                >
                  <td class="px-3 py-2">
                    <code class="text-xs bg-muted px-1.5 py-0.5 rounded">{{ arg.name }}</code>
                  </td>
                  <td class="px-3 py-2">
                    <UBadge
                      :label="arg.required ? t('settings.mcpCapability.boolean.yes') : t('settings.mcpCapability.boolean.no')"
                      :variant="arg.required ? 'subtle' : 'subtle'"
                      size="xs"
                    />
                  </td>
                  <td class="px-3 py-2 opacity-70">{{ arg.description || t('settings.mcpCapability.empty') }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- 资源详情 -->
      <div v-if="type === 'resource' && data" class="flex flex-col gap-4">
        <div>
          <div class="text-sm font-medium mb-1">{{ t('settings.mcpCapability.field.name') }}</div>
          <div class="text-sm">{{ data.name }}</div>
        </div>
        
        <div>
          <div class="text-sm font-medium mb-1">{{ t('settings.mcpCapability.field.uri') }}</div>
          <code class="text-xs bg-muted px-2 py-1 rounded break-all">{{ data.uri }}</code>
        </div>
        
        <div v-if="data.mimeType">
          <div class="text-sm font-medium mb-1">{{ t('settings.mcpCapability.field.mimeType') }}</div>
          <UBadge :label="data.mimeType" variant="subtle" />
        </div>
        
        <div v-if="data.description">
          <div class="text-sm font-medium mb-1">{{ t('settings.mcpCapability.field.description') }}</div>
          <p class="text-sm opacity-70">{{ data.description }}</p>
        </div>
      </div>
    </template>

    <template #footer>
      <div class="w-full flex justify-end">
        <UButton
          :label="t('globalSearch.close')"
          @click="isOpen = false"
        />
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";

const props = defineProps<{
  open: boolean
  type: 'tool' | 'prompt' | 'resource'
  data: any
}>();
const { t } = useI18n();

const emit = defineEmits<{
  'update:open': [value: boolean]
}>();

const isOpen = computed({
  get: () => props.open,
  set: (value) => emit('update:open', value)
});

const modalTitle = computed(() => {
  const titles = {
    'tool': t('settings.mcpCapability.title.tool'),
    'prompt': t('settings.mcpCapability.title.prompt'),
    'resource': t('settings.mcpCapability.title.resource')
  };
  return titles[props.type] || t('settings.mcpCapability.title.default');
});

const formatJson = (obj: any) => {
  try {
    return JSON.stringify(obj, null, 2);
  } catch (e) {
    return String(obj);
  }
};
</script>
