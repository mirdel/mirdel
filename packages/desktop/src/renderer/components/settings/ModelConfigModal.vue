<template>
  <UModal v-model:open="isOpen" :title="isEditMode ? t('settings.modelConfig.editTitle', { id: form.id }) : t('settings.modelConfig.createTitle')" :ui="{ footer: 'justify-end' }">
    <template #body>
      <div class="flex flex-col gap-4">
        <UFormField :label="t('settings.modelConfig.modelId')">
          <UInput
            ref="modelIdInputRef"
            v-model="form.id"
            :disabled="isEditMode"
            :placeholder="t('settings.modelConfig.modelIdPlaceholder')"
            :ui="{ root: 'w-full' }"
          />
        </UFormField>

        <UFormField
          v-if="!isEditMode"
          :label="t('settings.modelConfig.copyFromModel')"
          :description="t('settings.modelConfig.copyFromModelDescription')"
        >
          <USelect
            v-model="copyFromModelId"
            :items="copyFromModelOptions"
            value-key="value"
            :placeholder="t('settings.modelConfig.copyFromModelPlaceholder')"
            class="w-full"
          />
        </UFormField>

        <template v-if="isEditMode">
          <UFormField :label="t('settings.modelConfig.modelType')">
            <USelect
              v-model="form.modelType"
              :items="modelTypeOptions"
              value-key="value"
              :placeholder="t('settings.modelConfig.modelTypePlaceholder')"
              class="w-full"
            />
          </UFormField>

          <UFormField
            v-if="form.modelType === 'generative'"
            :label="t('settings.modelConfig.inputModalities')"
            :description="t('settings.modelConfig.inputModalitiesDescription')"
          >
            <div class="grid grid-cols-3 gap-2">
              <label
                v-for="item in modalityOptions"
                :key="`in-${item.value}`"
                class="flex items-center gap-2 px-2 py-1.5 rounded border border-default"
              >
                <UCheckbox
                  :model-value="form.inputModalities.includes(item.value)"
                  @update:model-value="(checked: boolean) => setModality('input', item.value, checked)"
                />
                <span class="text-sm">{{ item.label }}</span>
              </label>
            </div>
          </UFormField>

          <UFormField
            v-if="form.modelType === 'generative'"
            :label="t('settings.modelConfig.outputModalities')"
            :description="t('settings.modelConfig.outputModalitiesDescription')"
          >
            <div class="grid grid-cols-3 gap-2">
              <label
                v-for="item in modalityOptions"
                :key="`out-${item.value}`"
                class="flex items-center gap-2 px-2 py-1.5 rounded border border-default"
              >
                <UCheckbox
                  :model-value="form.outputModalities.includes(item.value)"
                  @update:model-value="(checked: boolean) => setModality('output', item.value, checked)"
                />
                <span class="text-sm">{{ item.label }}</span>
              </label>
            </div>
          </UFormField>

          <div v-if="form.modelType === 'generative' && form.outputModalities.includes('image')" class="flex flex-col gap-3 p-3 rounded-lg border border-default">
            <div class="text-sm font-medium">{{ t('settings.modelConfig.imageCapabilities') }}</div>

            <UFormField :label="t('settings.modelConfig.imageTasks')">
              <div class="grid grid-cols-2 gap-2">
                <label
                  v-for="item in imageTaskOptions"
                  :key="`task-${item.value}`"
                  class="flex items-center gap-2 px-2 py-1.5 rounded border border-default"
                >
                  <UCheckbox
                    :model-value="form.imageTasks.includes(item.value)"
                    @update:model-value="(checked: boolean) => setImageTask(item.value, checked)"
                  />
                  <span class="text-sm">{{ item.label }}</span>
                </label>
              </div>
            </UFormField>

            <UTabs
              v-if="imageCapabilityTaskTabs.length > 1"
              v-model="activeImageCapabilityTask"
              :items="imageCapabilityTaskTabs"
              variant="pill"
              color="neutral"
              size="sm"
              :content="false"
            />

            <template v-if="activeImageTaskConfig">
              <UFormField :label="t('settings.modelConfig.sizeMode')">
                <USelect
                  v-model="activeImageTaskConfig.sizeMode"
                  :items="imageSizeModeOptions"
                  value-key="value"
                  class="w-full"
                />
              </UFormField>

              <UFormField :label="t('settings.modelConfig.supportedAspectRatios')">
                <div class="flex flex-col gap-2">
                  <USwitch v-model="activeImageTaskConfig.aspectRatio.enabled" />
                  <div v-for="(value, index) in activeImageTaskConfig.aspectRatio.options" :key="`ar-${index}`" class="flex items-center gap-2">
                    <UInput
                      v-model="activeImageTaskConfig.aspectRatio.options[index]"
                      :placeholder="t('settings.modelConfig.aspectRatioPlaceholder')"
                      :disabled="!activeImageTaskConfig.aspectRatio.enabled"
                      class="flex-1"
                    />
                    <UButton
                      icon="i-lucide-trash-2"
                      variant="ghost"
                      color="neutral"
                      :disabled="!activeImageTaskConfig.aspectRatio.enabled"
                      @click="removeImageOption('aspectRatio', index)"
                    />
                  </div>
                  <div class="flex items-center gap-2">
                    <UButton
                      icon="i-lucide-plus"
                      variant="outline"
                      color="neutral"
                      size="sm"
                      :disabled="!activeImageTaskConfig.aspectRatio.enabled"
                      @click="addImageOption('aspectRatio')"
                    >
                      {{ t('settings.modelConfig.addAspectRatio') }}
                    </UButton>
                    <UInput
                      v-model="activeImageTaskConfig.aspectRatio.default"
                      :placeholder="t('settings.modelConfig.defaultValue')"
                      :disabled="!activeImageTaskConfig.aspectRatio.enabled"
                      class="w-40"
                    />
                  </div>
                </div>
              </UFormField>

              <UFormField :label="t('settings.modelConfig.supportedSizes')">
                <div class="flex flex-col gap-2">
                  <USwitch v-model="activeImageTaskConfig.size.enabled" />
                  <div v-for="(value, index) in activeImageTaskConfig.size.options" :key="`size-${index}`" class="flex items-center gap-2">
                    <UInput
                      v-model="activeImageTaskConfig.size.options[index]"
                      :placeholder="t('settings.modelConfig.sizePlaceholder')"
                      :disabled="!activeImageTaskConfig.size.enabled"
                      class="flex-1"
                    />
                    <UButton
                      icon="i-lucide-trash-2"
                      variant="ghost"
                      color="neutral"
                      :disabled="!activeImageTaskConfig.size.enabled"
                      @click="removeImageOption('size', index)"
                    />
                  </div>
                  <div class="flex items-center gap-2">
                    <UButton
                      icon="i-lucide-plus"
                      variant="outline"
                      color="neutral"
                      size="sm"
                      :disabled="!activeImageTaskConfig.size.enabled"
                      @click="addImageOption('size')"
                    >
                      {{ t('settings.modelConfig.addSize') }}
                    </UButton>
                    <UInput
                      v-model="activeImageTaskConfig.size.default"
                      :placeholder="t('settings.modelConfig.defaultValue')"
                      :disabled="!activeImageTaskConfig.size.enabled"
                      class="w-40"
                    />
                  </div>
                </div>
              </UFormField>

              <UFormField :label="t('settings.modelConfig.allowCustomSize')">
                <USwitch v-model="activeImageTaskConfig.allowCustomSize" />
              </UFormField>

              <UFormField v-if="activeImageTaskConfig.allowCustomSize" :label="t('settings.modelConfig.customSizeHint')">
                <UTextarea
                  v-model="activeImageTaskConfig.customSizeHint"
                  :rows="2"
                  class="w-full"
                  :placeholder="t('settings.modelConfig.customSizeHintPlaceholder')"
                />
              </UFormField>

              <UFormField :label="t('settings.modelConfig.maxImageCount')">
                <div class="flex items-center gap-2">
                  <USwitch v-model="activeImageTaskConfig.n.enabled" />
                  <UInput
                    v-model.number="activeImageTaskConfig.n.min"
                    type="number"
                    placeholder="min"
                    :disabled="!activeImageTaskConfig.n.enabled"
                    class="w-20"
                  />
                  <UInput
                    v-model.number="activeImageTaskConfig.n.max"
                    type="number"
                    placeholder="max"
                    :disabled="!activeImageTaskConfig.n.enabled"
                    class="w-20"
                  />
                  <UInput
                    v-model.number="activeImageTaskConfig.n.default"
                    type="number"
                    placeholder="default"
                    :disabled="!activeImageTaskConfig.n.enabled"
                    class="w-24"
                  />
                </div>
              </UFormField>

              <UFormField label="Seed">
                <div class="flex items-center gap-2">
                  <USwitch v-model="activeImageTaskConfig.seed.enabled" />
                  <UInput
                    v-model.number="activeImageTaskConfig.seed.min"
                    type="number"
                    placeholder="min"
                    :disabled="!activeImageTaskConfig.seed.enabled"
                    class="w-28"
                  />
                  <UInput
                    v-model.number="activeImageTaskConfig.seed.max"
                    type="number"
                    placeholder="max"
                    :disabled="!activeImageTaskConfig.seed.enabled"
                    class="w-28"
                  />
                </div>
              </UFormField>

              <USeparator />

              <UFormField :label="t('settings.modelConfig.negativePrompt')">
                <div class="flex items-center gap-2">
                  <USwitch v-model="activeImageTaskConfig.negativePrompt.enabled" />
                  <UInput
                    v-model="activeImageTaskConfig.negativePrompt.providerKey"
                    :placeholder="t('settings.modelConfig.providerKeyPlaceholder', { key: 'negative_prompt' })"
                    :disabled="!activeImageTaskConfig.negativePrompt.enabled"
                    class="flex-1"
                  />
                </div>
              </UFormField>

              <UFormField :label="t('settings.modelConfig.promptExtend')">
                <div class="flex items-center gap-2">
                  <USwitch v-model="activeImageTaskConfig.promptExtend.enabled" />
                  <UInput
                    v-model="activeImageTaskConfig.promptExtend.providerKey"
                    :placeholder="t('settings.modelConfig.providerKeyPlaceholder', { key: 'prompt_extend' })"
                    :disabled="!activeImageTaskConfig.promptExtend.enabled"
                    class="flex-1"
                  />
                  <label class="flex items-center gap-1 text-xs text-toned">
                    <USwitch v-model="activeImageTaskConfig.promptExtend.default" :disabled="!activeImageTaskConfig.promptExtend.enabled" />
                    {{ t('settings.modelConfig.enabledByDefault') }}
                  </label>
                </div>
              </UFormField>

              <UFormField :label="t('settings.modelConfig.watermark')">
                <div class="flex items-center gap-2">
                  <USwitch v-model="activeImageTaskConfig.watermark.enabled" />
                  <UInput
                    v-model="activeImageTaskConfig.watermark.providerKey"
                    :placeholder="t('settings.modelConfig.providerKeyPlaceholder', { key: 'watermark' })"
                    :disabled="!activeImageTaskConfig.watermark.enabled"
                    class="flex-1"
                  />
                  <label class="flex items-center gap-1 text-xs text-toned">
                    <USwitch v-model="activeImageTaskConfig.watermark.default" :disabled="!activeImageTaskConfig.watermark.enabled" />
                    {{ t('settings.modelConfig.enabledByDefault') }}
                  </label>
                </div>
              </UFormField>

              <UFormField :label="t('settings.modelConfig.referenceImages')">
                <div class="flex items-center gap-2">
                  <USwitch v-model="activeImageTaskConfig.referenceImages.enabled" />
                  <UInput
                    v-model.number="activeImageTaskConfig.referenceImages.max"
                    type="number"
                    :placeholder="t('settings.modelConfig.maxImageCountPlaceholder')"
                    :disabled="!activeImageTaskConfig.referenceImages.enabled"
                    class="w-32"
                  />
                </div>
              </UFormField>

              <UFormField label="Mask">
                <div class="flex items-center gap-2">
                  <USwitch v-model="activeImageTaskConfig.mask.enabled" />
                  <span class="text-sm text-toned">{{ t('settings.modelConfig.maskDescription') }}</span>
                </div>
              </UFormField>
            </template>
          </div>

          <div
            v-if="form.modelType === 'generative' && form.outputModalities.includes('image')"
            class="flex flex-col gap-2 p-3 rounded-lg border border-default"
          >
            <div class="flex items-center justify-between">
              <div class="text-sm font-medium">{{ t('settings.modelConfig.imageCustomParams') }}</div>
              <UButton icon="i-lucide-plus" size="sm" variant="outline" color="neutral" @click="addSchemaItem">
                {{ t('settings.modelConfig.add') }}
              </UButton>
            </div>
            <div v-if="form.imageOptionSchemaItems.length === 0" class="text-xs text-toned">{{ t('settings.modelConfig.noCustomParams') }}</div>
            <div
              v-for="(item, index) in form.imageOptionSchemaItems"
              :key="`schema-${index}`"
              class="rounded-lg border border-default p-2 space-y-2"
            >
              <div class="grid grid-cols-2 gap-2">
                <UFormField label="Key">
                  <UInput v-model="item.key" :placeholder="t('settings.modelConfig.schemaKeyPlaceholder')" class="w-full" />
                </UFormField>
                <UFormField :label="t('settings.customProvider.type')">
                  <USelect
                    :model-value="item.type"
                    :items="schemaTypeOptions"
                    value-key="value"
                    class="w-full"
                    @update:model-value="(value) => handleSchemaItemTypeChange(index, value)"
                  />
                </UFormField>
                <UFormField label="Label">
                  <UInput v-model="item.label" :placeholder="t('settings.modelConfig.schemaLabelPlaceholder')" class="w-full" />
                </UFormField>
                <UFormField :label="t('settings.mcpCapability.field.description')">
                  <UInput v-model="item.description" :placeholder="t('settings.modelConfig.optional')" class="w-full" />
                </UFormField>
                <UFormField :label="t('settings.modelConfig.defaultValue')">
                  <UInput v-model="item.defaultText" :placeholder="t('settings.modelConfig.optional')" class="w-full" />
                </UFormField>
                <UFormField :label="t('settings.mcpCapability.field.required')">
                  <USwitch v-model="item.required" />
                </UFormField>
              </div>
              <UFormField v-if="item.type === 'select'" required :label="t('settings.modelConfig.options')" :description="t('settings.modelConfig.optionsDescription')">
                <UTextarea
                  :ref="(el) => setSchemaOptionsTextareaRef(el, index)"
                  v-model="item.optionsText"
                  :rows="3"
                  :placeholder="t('settings.modelConfig.optionsPlaceholder')"
                  class="w-full font-mono text-xs"
                />
              </UFormField>
              <div class="flex justify-end">
                <UButton icon="i-lucide-trash-2" size="sm" variant="ghost" color="error" @click="removeSchemaItem(index)">
                  {{ t('common.delete') }}
                </UButton>
              </div>
            </div>
          </div>

          <UFormField
            v-if="form.modelType === 'generative'"
            :label="t('settings.modelConfig.nativeSearchMode')"
            :description="t('settings.modelConfig.nativeSearchModeDescription')"
          >
            <USelect
              v-model="form.nativeWebSearchMode"
              :items="nativeSearchModeOptions"
              value-key="value"
              label-key="label"
              class="w-full"
            />
          </UFormField>

          <UFormField
            v-if="form.modelType === 'generative' && form.nativeWebSearchMode === 'custom'"
            :label="t('settings.modelConfig.nativeSearchInjection')"
          >
            <USelect
              v-model="form.nativeWebSearchInject"
              :items="nativeSearchInjectOptions"
              value-key="value"
              label-key="label"
              class="w-full"
            />
          </UFormField>

          <UFormField
            v-if="form.modelType === 'generative' && form.nativeWebSearchMode === 'custom'"
            :label="t('settings.modelConfig.nativeSearchConfig')"
            :description="form.nativeWebSearchInject === 'providerOptions'
              ? t('settings.modelConfig.nativeSearchProviderOptionsDescription')
              : form.nativeWebSearchInject === 'sdkNative'
                ? t('settings.modelConfig.nativeSearchSdkNativeDescription')
                : t('settings.modelConfig.nativeSearchToolsDescription')"
          >
            <UTextarea
              v-model="form.nativeWebSearchCustomText"
              :rows="4"
              class="w-full font-mono text-sm"
              :placeholder="nativeSearchCustomPlaceholder"
            />
          </UFormField>

          <UFormField
            v-if="form.modelType === 'generative'"
            :label="t('settings.modelConfig.thinkingConfig')"
            :description="t('settings.modelConfig.thinkingConfigDescription')"
          >
            <div class="flex flex-col gap-2">
              <USwitch v-model="form.thinkingEnabled" />
              <UTextarea
                v-if="form.thinkingEnabled"
                v-model="form.thinkingConfigText"
                :rows="4"
                class="w-full font-mono text-sm"
                :placeholder="t('settings.modelConfig.thinkingConfigPlaceholder')"
              />
            </div>
          </UFormField>

          <UFormField
            :label="t('settings.modelService.customParams')"
            :description="t('settings.modelService.customParamsDescription')"
          >
            <UTextarea
              v-model="form.providerOptionsDefaultsText"
              :rows="4"
              class="w-full font-mono text-sm"
              placeholder='{"key": "value"}'
            />
          </UFormField>
        </template>
      </div>
    </template>
    <template #footer>
      <UButton variant="outline" color="neutral" @click="isOpen = false">{{ t('common.cancel') }}</UButton>
      <UButton
        v-if="isEditMode"
        variant="outline"
        color="neutral"
        @click="handleResetToDefault"
      >
        {{ t('settings.modelConfig.resetToDefault') }}
      </UButton>
      <UButton @click="handleSubmit">
        {{ isEditMode ? t('common.save') : t('settings.modelConfig.add') }}
      </UButton>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import {
  inferModelTypeFromId,
  loggerServiceRenderer,
  resolveImageTaskCapabilities,
  type ImageTaskCapabilities,
  type NativeWebSearchModelConfig,
  type ProviderModel,
  type ModelModality,
  type ModelType,
  type ImageTaskType,
  type ProviderOptionFieldSchema,
  type ThinkingConfig
} from "@shared";
import { useMyToast } from "@/composables/useMyToast";
import { useSettingsStore } from "@/stores/useSettingsStore";

const logger = loggerServiceRenderer.withContext("ModelConfigModal");
const { t } = useI18n();
const toast = useMyToast();
const settingsStore = useSettingsStore();

const props = defineProps<{
  open: boolean;
  providerId?: string;
  modelId?: string;
  initialModelId?: string;
  existingModelIds?: string[];
}>();

const emit = defineEmits<{
  "update:open": [value: boolean];
}>();

const isOpen = computed({
  get: () => props.open,
  set: (value) => emit("update:open", value),
});

const isEditMode = computed(() => Boolean(props.modelId?.trim()));

const modalityOptions = computed<Array<{ label: string; value: ModelModality }>>(() => [
  { label: t("settings.modelList.modality.text"), value: "text" },
  { label: t("settings.modelList.modality.image"), value: "image" },
  { label: t("settings.modelList.modality.audio"), value: "audio" },
  { label: t("settings.modelList.modality.video"), value: "video" },
  { label: t("settings.modelList.modality.file"), value: "file" },
  { label: "Mask", value: "mask" },
]);

const modelTypeOptions = computed<Array<{ label: string; value: ModelType }>>(() => [
  { label: t("settings.modelConfig.option.generative"), value: "generative" },
  { label: t("settings.modelConfig.option.embedding"), value: "embedding" },
  { label: t("settings.modelConfig.option.rerank"), value: "rerank" },
]);

const imageTaskOptions = computed<Array<{ label: string; value: ImageTaskType }>>(() => [
  { label: t("settings.modelConfig.imageTask.textToImage"), value: "text_to_image" },
  { label: t("settings.modelConfig.imageTask.imageToImage"), value: "image_to_image" },
  { label: t("settings.modelConfig.imageTask.imageEdit"), value: "image_edit" },
  { label: t("settings.modelConfig.imageTask.inpaint"), value: "inpaint" },
]);

const imageSizeModeOptions = computed(() => [
  { label: t("settings.modelConfig.imageSizeMode.size"), value: "size" },
  { label: t("settings.modelConfig.imageSizeMode.aspectRatio"), value: "aspectRatio" },
  { label: t("settings.modelConfig.imageSizeMode.both"), value: "both" },
]);

const schemaTypeOptions = computed(() => [
  { label: t("settings.modelConfig.schemaType.stringInput"), value: "string-input" },
  { label: t("settings.modelConfig.schemaType.stringTextarea"), value: "string-textarea" },
  { label: t("settings.modelConfig.schemaType.numberInput"), value: "number-input" },
  { label: t("settings.modelConfig.schemaType.booleanSwitch"), value: "boolean-switch" },
  { label: t("settings.modelConfig.schemaType.select"), value: "select" },
  { label: "JSON", value: "json-textarea" },
]);

const modelIdInputRef = ref<{ $el?: HTMLElement } | null>(null);
const schemaOptionsTextareaRefs = ref<Array<{ textareaRef?: { focus: () => void } } | null>>([]);
const copyFromModelId = ref("");

const copyFromModelOptions = computed<Array<{ label: string; value: string }>>(() => {
  if (!props.providerId) return [];
  const provider = settingsStore.providers.find((item) => item.id === props.providerId);
  const currentId = form.value.id.trim();
  return (provider?.models ?? [])
    .filter((item) => !currentId || item.id !== currentId)
    .map((item) => ({ label: item.id, value: item.id }));
});

function normalizeSelectValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "value" in (value as Record<string, unknown>)) {
    return String((value as Record<string, unknown>).value ?? "");
  }
  return String(value ?? "");
}

function setSchemaOptionsTextareaRef(el: unknown, index: number) {
  schemaOptionsTextareaRefs.value[index] = (el as { textareaRef?: { focus: () => void } } | null) ?? null;
}

function handleSchemaItemTypeChange(index: number, value: unknown) {
  const item = form.value.imageOptionSchemaItems[index];
  if (!item) return;
  const nextType = normalizeSelectValue(value) as typeof item.type;
  item.type = nextType;
  if (nextType !== "select") return;
  setTimeout(() => {
    schemaOptionsTextareaRefs.value[index]?.textareaRef?.focus();
  }, 200);
}

type FormImageTaskKey = "generate" | "edit";
type NativeSearchMode = "inherit" | "off" | "custom";
type NativeSearchInject = "providerOptions" | "tools" | "sdkNative";
const ALLOWED_THINKING_KEYS = new Set(["on", "off", "standard", "deep", "ultra"]);

function createDefaultImageTaskConfig() {
  return {
    sizeMode: "both" as "size" | "aspectRatio" | "both",
    aspectRatio: { enabled: false, options: ["1:1"], default: "" },
    size: { enabled: false, options: ["1024x1024"], default: "" },
    allowCustomSize: false,
    customSizeHint: "",
    n: { enabled: false, min: 1, max: 4, default: 1 },
    seed: { enabled: false, min: undefined as number | undefined, max: undefined as number | undefined },
    negativePrompt: { enabled: false, providerKey: "negative_prompt" },
    promptExtend: { enabled: false, providerKey: "prompt_extend", default: false },
    watermark: { enabled: false, providerKey: "watermark", default: false },
    referenceImages: { enabled: false, max: 1 },
    mask: { enabled: false },
  };
}

function createDefaultForm() {
  return {
    id: "",
    modelType: "generative" as ModelType,
    inputModalities: ["text"] as ModelModality[],
    outputModalities: ["text"] as ModelModality[],
    imageTasks: ["text_to_image"] as ImageTaskType[],
    image: {
      generate: createDefaultImageTaskConfig(),
      edit: createDefaultImageTaskConfig(),
    },
    imageOptionSchemaItems: [] as Array<{
      key: string;
      label: string;
      type: "string-input" | "string-textarea" | "number-input" | "boolean-switch" | "select" | "json-textarea";
      required: boolean;
      description: string;
      defaultText: string;
      optionsText: string;
    }>,
    providerOptionsDefaultsText: "",
    thinkingEnabled: false,
    thinkingConfigText: "",
    nativeWebSearchMode: "inherit" as NativeSearchMode,
    nativeWebSearchInject: "providerOptions" as NativeSearchInject,
    nativeWebSearchCustomText: "",
  };
}

const form = ref(createDefaultForm());
const thinkingWasDefinedAtLoad = ref(false);
const activeImageCapabilityTask = ref<FormImageTaskKey>("generate");
const nativeSearchModeOptions = computed<Array<{ label: string; value: NativeSearchMode }>>(() => [
  { label: t("settings.modelConfig.nativeSearchModeInherit"), value: "inherit" },
  { label: t("settings.modelConfig.nativeSearchModeOff"), value: "off" },
  { label: t("settings.modelConfig.nativeSearchModeCustom"), value: "custom" },
]);
const nativeSearchInjectOptions = computed<Array<{ label: string; value: NativeSearchInject }>>(() => [
  { label: t("settings.modelConfig.nativeSearchInjectionProviderOptions"), value: "providerOptions" },
  { label: t("settings.modelConfig.nativeSearchInjectionTools"), value: "tools" },
  { label: t("settings.modelConfig.nativeSearchInjectionSdkNative"), value: "sdkNative" },
]);
const nativeSearchCustomPlaceholder = computed(() => (
  form.value.nativeWebSearchInject === "providerOptions"
    ? '{"enable_search": true}'
    : form.value.nativeWebSearchInject === "sdkNative"
      ? '{"strategy":"anthropic_web_search","args":{"maxUses":5}}'
      : '[{"type": "web_search"}]'
));

function inferImageTasksFromModalities(inputModalities: ModelModality[], outputModalities: ModelModality[]): ImageTaskType[] {
  if (!outputModalities.includes("image")) return [];
  const tasks: ImageTaskType[] = ["text_to_image"];
  if (inputModalities.includes("image")) tasks.push("image_to_image", "image_edit");
  if (inputModalities.includes("mask")) tasks.push("inpaint");
  return Array.from(new Set(tasks));
}

function normalizeImageTasks(input: unknown, fallback: ImageTaskType[]): ImageTaskType[] {
  if (!Array.isArray(input)) return fallback;
  const next = input.filter((item): item is ImageTaskType => (
    item === "text_to_image" || item === "image_to_image" || item === "image_edit" || item === "inpaint"
  ));
  return next.length > 0 ? Array.from(new Set(next)) : fallback;
}

function hasGenerateTask(tasks: ImageTaskType[]) {
  return tasks.includes("text_to_image") || tasks.includes("image_to_image");
}

function hasEditTask(tasks: ImageTaskType[]) {
  return tasks.includes("image_edit") || tasks.includes("inpaint");
}

const imageCapabilityTaskTabs = computed(() => {
  const items: Array<{ label: string; value: FormImageTaskKey }> = [];
  if (hasGenerateTask(form.value.imageTasks)) items.push({ label: t("settings.modelConfig.generateParams"), value: "generate" });
  if (hasEditTask(form.value.imageTasks)) items.push({ label: t("settings.modelConfig.editParams"), value: "edit" });
  if (items.length === 0) items.push({ label: t("settings.modelConfig.generateParams"), value: "generate" });
  return items;
});

const activeImageTaskConfig = computed(() => form.value.image[activeImageCapabilityTask.value]);

function ensureActiveImageCapabilityTask() {
  const allowed = imageCapabilityTaskTabs.value.map((item) => item.value);
  if (!allowed.includes(activeImageCapabilityTask.value)) {
    activeImageCapabilityTask.value = allowed[0] || "generate";
  }
}

function setModality(kind: "input" | "output", modality: ModelModality, checked: boolean) {
  const list = kind === "input" ? form.value.inputModalities : form.value.outputModalities;
  const exists = list.includes(modality);
  if (checked && !exists) list.push(modality);
  if (!checked && exists) {
    const index = list.indexOf(modality);
    list.splice(index, 1);
  }
}

function setImageTask(task: ImageTaskType, checked: boolean) {
  const list = form.value.imageTasks;
  const exists = list.includes(task);
  if (checked && !exists) list.push(task);
  if (!checked && exists) {
    const index = list.indexOf(task);
    list.splice(index, 1);
  }
  ensureActiveImageCapabilityTask();
}

function normalizeOptionList(values: string[]): string[] {
  const cleaned = values.map((x) => x.trim()).filter(Boolean);
  return Array.from(new Set(cleaned));
}

function addImageOption(kind: "aspectRatio" | "size") {
  const target = kind === "aspectRatio" ? activeImageTaskConfig.value.aspectRatio.options : activeImageTaskConfig.value.size.options;
  target.push("");
}

function removeImageOption(kind: "aspectRatio" | "size", index: number) {
  const target = kind === "aspectRatio" ? activeImageTaskConfig.value.aspectRatio.options : activeImageTaskConfig.value.size.options;
  target.splice(index, 1);
}

function parseJsonObject(text: string, fieldName: string): Record<string, unknown> | undefined {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error(t("settings.modelConfig.invalidJson", { field: fieldName }));
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(t("settings.modelConfig.mustBeJsonObject", { field: fieldName }));
  }
  return parsed as Record<string, unknown>;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function parseSdkNativeConfig(value: unknown): { strategy: "anthropic_web_search" | "google_search"; args?: Record<string, unknown> } | undefined {
  if (!isPlainObject(value)) return undefined;
  const strategy = value.strategy;
  if (strategy !== "anthropic_web_search" && strategy !== "google_search") return undefined;
  const args = value.args;
  if (args !== undefined && !isPlainObject(args)) return undefined;
  return {
    strategy,
    ...(args ? { args } : {}),
  };
}

function resolveNativeSearchDraft(config: NativeWebSearchModelConfig | undefined): {
  mode: NativeSearchMode;
  inject: NativeSearchInject;
  text: string;
} {
  if (config === false) {
    return { mode: "off", inject: "providerOptions", text: "" };
  }
  if (config === true || config === undefined) {
    return { mode: "inherit", inject: "providerOptions", text: "" };
  }

  if (isPlainObject(config.providerOptions) && Object.keys(config.providerOptions).length > 0) {
    return {
      mode: "custom",
      inject: "providerOptions",
      text: JSON.stringify(config.providerOptions, null, 2),
    };
  }
  if (Array.isArray(config.tools) && config.tools.length > 0) {
    return {
      mode: "custom",
      inject: "tools",
      text: JSON.stringify(config.tools, null, 2),
    };
  }
  if (isPlainObject(config.sdkNative)) {
    return {
      mode: "custom",
      inject: "sdkNative",
      text: JSON.stringify(config.sdkNative, null, 2),
    };
  }

  return { mode: "inherit", inject: "providerOptions", text: "" };
}

function parseNativeWebSearchConfig(): NativeWebSearchModelConfig {
  if (form.value.nativeWebSearchMode === "inherit") {
    return true;
  }
  if (form.value.nativeWebSearchMode === "off") {
    return false;
  }

  const fieldName = t("settings.modelConfig.nativeSearchConfig");
  const text = form.value.nativeWebSearchCustomText.trim();
  if (!text) {
    throw new Error(t("settings.modelConfig.invalidJson", { field: fieldName }));
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(t("settings.modelConfig.invalidJson", { field: fieldName }));
  }

  if (form.value.nativeWebSearchInject === "providerOptions") {
    if (!isPlainObject(parsed)) {
      throw new Error(t("settings.modelConfig.mustBeJsonObject", { field: fieldName }));
    }
    return { providerOptions: parsed };
  }

  if (form.value.nativeWebSearchInject === "sdkNative") {
    const sdkNative = parseSdkNativeConfig(parsed);
    if (!sdkNative) {
      throw new Error(t("settings.modelConfig.invalidJson", { field: fieldName }));
    }
    return { sdkNative };
  }

  if (!Array.isArray(parsed) || parsed.some((item) => !isPlainObject(item))) {
    throw new Error(t("settings.modelConfig.nativeSearchToolsMustBeArray", { field: fieldName }));
  }
  return { tools: parsed as Array<Record<string, unknown>> };
}

function parseThinkingConfig(): ThinkingConfig | null | undefined {
  if (!form.value.thinkingEnabled) {
    return thinkingWasDefinedAtLoad.value ? null : undefined;
  }

  const fieldName = t("settings.modelConfig.thinkingConfig");
  const text = form.value.thinkingConfigText.trim();
  if (!text) {
    return {};
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(t("settings.modelConfig.invalidJson", { field: fieldName }));
  }
  if (!isPlainObject(parsed)) {
    throw new Error(t("settings.modelConfig.mustBeJsonObject", { field: fieldName }));
  }

  const result: ThinkingConfig = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (!ALLOWED_THINKING_KEYS.has(key)) {
      throw new Error(t("settings.modelConfig.thinkingInvalidKey", { key }));
    }
    if (!isPlainObject(value)) {
      throw new Error(t("settings.modelConfig.thinkingValueMustBeObject", { key }));
    }
    result[key as keyof ThinkingConfig] = value;
  }

  return result;
}

function addSchemaItem() {
  form.value.imageOptionSchemaItems.push({
    key: "",
    label: "",
    type: "string-input",
    required: false,
    description: "",
    defaultText: "",
    optionsText: "",
  });
}

function removeSchemaItem(index: number) {
  form.value.imageOptionSchemaItems.splice(index, 1);
  schemaOptionsTextareaRefs.value.splice(index, 1);
}

function schemaItemFromModel(item: ProviderOptionFieldSchema) {
  const optionsText = Array.isArray(item.options)
    ? item.options.map((opt) => `${opt.label}=${String(opt.value)}`).join("\n")
    : "";
  let editorType: "string-input" | "string-textarea" | "number-input" | "boolean-switch" | "select" | "json-textarea" = "string-input";
  if (item.type === "number") editorType = "number-input";
  else if (item.type === "boolean") editorType = "boolean-switch";
  else if (item.type === "select") editorType = "select";
  else if (item.type === "json") editorType = "json-textarea";
  else if (item.type === "string" && item.ui?.component === "textarea") editorType = "string-textarea";
  return {
    key: item.key || "",
    label: item.label || "",
    type: editorType,
    required: !!item.required,
    description: item.description || "",
    defaultText: item.default === undefined ? "" : (typeof item.default === "string" ? item.default : JSON.stringify(item.default)),
    optionsText,
  };
}

function parseSchemaItems() {
  if (form.value.imageOptionSchemaItems.length === 0) return undefined;
  const result: ProviderOptionFieldSchema[] = [];
  for (const item of form.value.imageOptionSchemaItems) {
    const key = item.key.trim();
    if (!key) continue;
    const schema: ProviderOptionFieldSchema = {
      key,
      type: item.type === "number-input"
        ? "number"
        : item.type === "boolean-switch"
        ? "boolean"
        : item.type === "select"
        ? "select"
        : item.type === "json-textarea"
        ? "json"
        : "string",
      ...(item.label.trim() ? { label: item.label.trim() } : {}),
      ...(item.required ? { required: true } : {}),
      ...(item.description.trim() ? { description: item.description.trim() } : {}),
    };
    const defaultText = item.defaultText.trim();
    if (defaultText) {
      if (item.type === "number-input") {
        const n = Number(defaultText);
        if (!Number.isFinite(n)) throw new Error(t("settings.modelConfig.schemaDefaultMustBeNumber", { key }));
        schema.default = n;
      } else if (item.type === "boolean-switch") {
        schema.default = defaultText === "true" || defaultText === "1" || defaultText === "on";
      } else if (item.type === "json-textarea") {
        try {
          schema.default = JSON.parse(defaultText);
        } catch {
          throw new Error(t("settings.modelConfig.schemaDefaultMustBeJson", { key }));
        }
      } else {
        schema.default = defaultText;
      }
    }
    if (item.type === "select") {
      const lines = item.optionsText.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
      const options = lines.map((line) => {
        const idx = line.indexOf("=");
        if (idx < 0) return { label: line, value: line };
        const label = line.slice(0, idx).trim();
        const value = line.slice(idx + 1).trim();
        return { label: label || value, value: value || label };
      }).filter((x) => x.label && x.value);
      if (options.length === 0) throw new Error(t("settings.modelConfig.schemaSelectOptionsRequired", { key }));
      schema.options = options;
    }
    if (item.type === "string-textarea") schema.ui = { component: "textarea" };
    if (item.type === "string-input") schema.ui = { component: "input" };
    if (item.type === "number-input") schema.ui = { component: "input" };
    if (item.type === "boolean-switch") schema.ui = { component: "switch" };
    if (item.type === "select") schema.ui = { component: "select" };
    if (item.type === "json-textarea") schema.ui = { component: "textarea" };
    result.push(schema);
  }
  return result.length > 0 ? result : undefined;
}

async function loadModelConfig() {
  if (!props.providerId || !props.modelId) {
    form.value = createDefaultForm();
    form.value.id = props.modelId ? props.modelId.trim() : (props.initialModelId?.trim() ?? "");
    copyFromModelId.value = "";
    thinkingWasDefinedAtLoad.value = false;
    activeImageCapabilityTask.value = "generate";
    return;
  }

  try {
    const details = (await settingsStore.getModelDetails(props.providerId, props.modelId)) as ProviderModel | null;
    if (!details) {
      toast.error({ title: t("settings.modelConfig.error"), description: t("settings.modelConfig.loadFailed") });
      return;
    }

    form.value = createDefaultForm();
    form.value.id = details.id;
    form.value.modelType = details.modelType ?? "generative";
    form.value.inputModalities = details.inputModalities?.length ? [...details.inputModalities] : ["text"];
    form.value.outputModalities = details.outputModalities?.length ? [...details.outputModalities] : ["text"];
    form.value.imageTasks = normalizeImageTasks(
      details.imageTasks,
      inferImageTasksFromModalities(form.value.inputModalities, form.value.outputModalities)
    );

    const applyImageTaskCapabilities = (
      target: ReturnType<typeof createDefaultImageTaskConfig>,
      source: ImageTaskCapabilities | undefined
    ) => {
      if (!source) return;
      if (source.sizeMode) target.sizeMode = source.sizeMode;
      if (source.aspectRatio) {
        target.aspectRatio.enabled = !!source.aspectRatio.enabled;
        target.aspectRatio.options = source.aspectRatio.options?.length ? [...source.aspectRatio.options] : [""];
        target.aspectRatio.default = source.aspectRatio.default ?? "";
      }
      if (source.size) {
        target.size.enabled = !!source.size.enabled;
        target.size.options = source.size.options?.length ? [...source.size.options] : [""];
        target.size.default = source.size.default ?? "";
      }
      target.allowCustomSize = !!source.allowCustomSize;
      target.customSizeHint = typeof source.customSizeHint === "string" ? source.customSizeHint : "";
      if (source.n) {
        target.n.enabled = !!source.n.enabled;
        target.n.min = source.n.min;
        target.n.max = source.n.max;
        target.n.default = source.n.default;
      }
      if (source.seed) {
        target.seed.enabled = !!source.seed.enabled;
        target.seed.min = source.seed.min;
        target.seed.max = source.seed.max;
      }
      if (source.negativePrompt) {
        target.negativePrompt.enabled = !!source.negativePrompt.enabled;
        target.negativePrompt.providerKey = source.negativePrompt.providerKey || "negative_prompt";
      }
      if (source.promptExtend) {
        target.promptExtend.enabled = !!source.promptExtend.enabled;
        target.promptExtend.providerKey = source.promptExtend.providerKey || "prompt_extend";
        target.promptExtend.default = !!source.promptExtend.default;
      }
      if (source.watermark) {
        target.watermark.enabled = !!source.watermark.enabled;
        target.watermark.providerKey = source.watermark.providerKey || "watermark";
        target.watermark.default = !!source.watermark.default;
      }
      if (source.referenceImages) {
        target.referenceImages.enabled = !!source.referenceImages.enabled;
        target.referenceImages.max = source.referenceImages.max;
      }
      if (source.mask) {
        target.mask.enabled = !!source.mask.enabled;
      }
    };

    applyImageTaskCapabilities(form.value.image.generate, resolveImageTaskCapabilities(details.image, "generate"));
    applyImageTaskCapabilities(form.value.image.edit, resolveImageTaskCapabilities(details.image, "edit"));
    ensureActiveImageCapabilityTask();

    form.value.imageOptionSchemaItems = Array.isArray(details.imageOptionSchema)
      ? details.imageOptionSchema.map(schemaItemFromModel)
      : [];
    schemaOptionsTextareaRefs.value = [];
    form.value.providerOptionsDefaultsText = details.providerOptionsDefaults
      ? JSON.stringify(details.providerOptionsDefaults, null, 2)
      : "";
    thinkingWasDefinedAtLoad.value = details.thinking !== undefined;
    form.value.thinkingEnabled = details.thinking !== undefined;
    form.value.thinkingConfigText = details.thinking !== undefined
      ? JSON.stringify(details.thinking, null, 2)
      : "";
    const nativeSearchDraft = resolveNativeSearchDraft(details.nativeWebSearch);
    form.value.nativeWebSearchMode = nativeSearchDraft.mode;
    form.value.nativeWebSearchInject = nativeSearchDraft.inject;
    form.value.nativeWebSearchCustomText = nativeSearchDraft.text;

    logger.info("loaded model config", { modelId: props.modelId });
  } catch (error) {
    logger.error("Failed to load model config", { error });
    toast.error({ title: t("settings.modelConfig.error"), description: String(error) });
  }
}

function validateImageTaskConfig(taskLabel: string, config: ReturnType<typeof createDefaultImageTaskConfig>) {
  if (!config.n.enabled) return;
  const { min, max, default: defaultValue } = config.n;
  if (min != null && max != null && min > max) throw new Error(t("settings.modelConfig.nMinGreaterThanMax", { task: taskLabel }));
  if (defaultValue != null && min != null && defaultValue < min) throw new Error(t("settings.modelConfig.nDefaultLessThanMin", { task: taskLabel }));
  if (defaultValue != null && max != null && defaultValue > max) throw new Error(t("settings.modelConfig.nDefaultGreaterThanMax", { task: taskLabel }));
}

function validateForm() {
  const trimmedId = form.value.id?.trim();
  if (!trimmedId) throw new Error(t("settings.modelConfig.enterModelId"));
  if (!isEditMode.value) return;
  if (form.value.modelType === "generative") {
    if (form.value.inputModalities.length === 0) throw new Error(t("settings.modelConfig.selectInputModality"));
    if (form.value.outputModalities.length === 0) throw new Error(t("settings.modelConfig.selectOutputModality"));
  }

  if (form.value.modelType === "generative" && form.value.outputModalities.includes("image")) {
    if (form.value.imageTasks.length === 0) throw new Error(t("settings.modelConfig.selectImageTask"));
    if (hasGenerateTask(form.value.imageTasks)) validateImageTaskConfig(t("settings.modelConfig.imageTaskGenerate"), form.value.image.generate);
    if (hasEditTask(form.value.imageTasks)) validateImageTaskConfig(t("settings.modelConfig.imageTaskEdit"), form.value.image.edit);
  }
}

function buildImageTaskCapabilities(config: ReturnType<typeof createDefaultImageTaskConfig>): ImageTaskCapabilities {
  return {
    sizeMode: config.sizeMode,
    aspectRatio: {
      enabled: config.aspectRatio.enabled,
      options: config.aspectRatio.enabled ? normalizeOptionList(config.aspectRatio.options) : undefined,
      default: config.aspectRatio.enabled ? config.aspectRatio.default || undefined : undefined,
    },
    size: {
      enabled: config.size.enabled,
      options: config.size.enabled ? normalizeOptionList(config.size.options) : undefined,
      default: config.size.enabled ? config.size.default || undefined : undefined,
    },
    allowCustomSize: !!config.allowCustomSize,
    customSizeHint: config.allowCustomSize ? (config.customSizeHint || "").trim() || undefined : undefined,
    n: {
      enabled: config.n.enabled,
      min: config.n.enabled ? config.n.min : undefined,
      max: config.n.enabled ? config.n.max : undefined,
      default: config.n.enabled ? config.n.default : undefined,
    },
    seed: {
      enabled: config.seed.enabled,
      min: config.seed.enabled ? config.seed.min : undefined,
      max: config.seed.enabled ? config.seed.max : undefined,
    },
    negativePrompt: {
      enabled: config.negativePrompt.enabled,
      providerKey: config.negativePrompt.enabled
        ? (config.negativePrompt.providerKey || "negative_prompt").trim() || "negative_prompt"
        : undefined,
    },
    promptExtend: {
      enabled: config.promptExtend.enabled,
      providerKey: config.promptExtend.enabled
        ? (config.promptExtend.providerKey || "prompt_extend").trim() || "prompt_extend"
        : undefined,
      default: config.promptExtend.enabled ? !!config.promptExtend.default : undefined,
    },
    watermark: {
      enabled: config.watermark.enabled,
      providerKey: config.watermark.enabled
        ? (config.watermark.providerKey || "watermark").trim() || "watermark"
        : undefined,
      default: config.watermark.enabled ? !!config.watermark.default : undefined,
    },
    referenceImages: {
      enabled: config.referenceImages.enabled,
      max: config.referenceImages.enabled ? config.referenceImages.max : undefined,
    },
    mask: {
      enabled: config.mask.enabled,
    },
  };
}

function buildUpdatePayload() {
  const isGenerative = form.value.modelType === "generative";
  const includesImageOutput = isGenerative && form.value.outputModalities.includes("image");
  const normalizedImageTasks = includesImageOutput
    ? normalizeImageTasks(form.value.imageTasks, inferImageTasksFromModalities(form.value.inputModalities, form.value.outputModalities))
    : undefined;
  const hasGenerate = normalizedImageTasks ? hasGenerateTask(normalizedImageTasks) : false;
  const hasEdit = normalizedImageTasks ? hasEditTask(normalizedImageTasks) : false;

  const image = includesImageOutput
    ? {
        ...(hasGenerate ? { generate: buildImageTaskCapabilities(form.value.image.generate) } : {}),
        ...(hasEdit ? { edit: buildImageTaskCapabilities(form.value.image.edit) } : {}),
      }
    : undefined;

  return {
    modelType: form.value.modelType,
    inputModalities: isGenerative ? [...form.value.inputModalities] : ["text"],
    outputModalities: isGenerative ? [...form.value.outputModalities] : ["text"],
    imageTasks: normalizedImageTasks,
    image,
    imageOptionSchema: includesImageOutput ? parseSchemaItems() : undefined,
    providerOptionsDefaults: parseJsonObject(form.value.providerOptionsDefaultsText, t("settings.modelService.customParams")),
    thinking: isGenerative ? parseThinkingConfig() : null,
    nativeWebSearch: isGenerative ? parseNativeWebSearchConfig() : false,
  };
}

function toSerializable<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

async function handleSubmit() {
  try {
    validateForm();
    if (!props.providerId) return;

    const trimmedId = form.value.id.trim();
    if (isEditMode.value) {
      await settingsStore.updateModelDetails(
        props.providerId,
        props.modelId!,
        toSerializable(buildUpdatePayload())
      );
      isOpen.value = false;
      toast.success({ title: t("settings.modelService.saved") });
      return;
    }

    const exists = props.existingModelIds?.includes(trimmedId);
    if (exists) {
      toast.error({ title: t("settings.modelConfig.modelExists"), description: t("settings.modelConfig.modelExistsDescription", { id: trimmedId }) });
      return;
    }

    await settingsStore.addModelToCommon(
      props.providerId,
      trimmedId,
      inferModelTypeFromId(trimmedId),
      {
        copyFromModelId: copyFromModelId.value.trim() || undefined,
      }
    );
    toast.success({ title: t("settings.modelService.added") });
    isOpen.value = false;
  } catch (error) {
    logger.error("Failed to submit model config", { error });
    toast.error({ title: t("settings.defaultModel.saveFailed"), description: String(error) });
  }
}

async function handleResetToDefault() {
  if (!props.providerId || !props.modelId) return;
  try {
    await settingsStore.resetModel(props.providerId, props.modelId);
    await loadModelConfig();
    toast.success({ title: t("settings.modelConfig.resetToDefaultSuccess") });
  } catch (error) {
    logger.error("Failed to reset model to default", { error });
    toast.error({ title: t("settings.defaultModel.saveFailed"), description: String(error) });
  }
}

watch(
  () => props.open,
  async (newVal) => {
    if (newVal) {
      await loadModelConfig();
      if (!isEditMode.value) {
        await nextTick();
        setTimeout(() => {
          const el = modelIdInputRef.value?.$el;
          const input = el?.querySelector?.("input") ?? (el instanceof HTMLInputElement ? el : null);
          input?.focus();
        }, 50);
      }
    }
  }
);
</script>
