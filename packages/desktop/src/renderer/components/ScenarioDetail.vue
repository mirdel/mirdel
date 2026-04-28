<template>
  <div class="flex-1 min-w-0 flex overflow-hidden h-full min-h-0">
    <!-- 详情左侧：配置类别 -->
    <div class="w-[200px] shrink-0 border-r border-default flex flex-col sticky top-0 h-full">
      <UList
        v-model="selectedConfigTab"
        :items="configTabs"
        value-key="id"
        label-key="name"
        size="md"
        gap="sm"
        padding="md"
        class="flex-1"
      >
        <template #item="{ item }">
          <div class="flex items-center gap-2 w-full">
            <UIcon :name="item.icon" class="w-4 h-4 shrink-0" />
            <UText :text="item.name" class="flex-1" />
            <!-- MCP 服务器数量 -->
            <!-- 知识库数量 -->
            <UBadge
              v-if="item.id === 'knowledge' && scenarioForm.kbIds.length > 0"
              :label="scenarioForm.kbIds.length"
              color="neutral"
              variant="outline"
              size="xs"
            />
          </div>
        </template>
      </UList>
    </div>

    <!-- 详情右侧：配置表单 -->
    <div class="flex-1 min-h-0 flex flex-col overflow-y-auto p-4">
      <!-- 基础设置 -->
      <div v-if="selectedConfigTab === 'base'" class="flex flex-col gap-5">
        <UFormField :label="t('scenario.form.mode')">
          <URadioGroup
            v-model="scenarioForm.mode"
            :items="modeOptions"
            variant="card"
            @update:model-value="handleFormChange"
          />
        </UFormField>

        <UFormField :label="t('scenario.form.selectModel')">
          <ModelSelector
            v-model="scenarioForm.model"
            @update:modelValue="handleModelChange"
          />
        </UFormField>

        <UFormField>
          <template #label>
            <div class="inline-flex items-center gap-1">
              <span>{{ t('scenario.form.contextCount') }}</span>
              <UTooltip :text="t('scenario.form.contextCountDesc')">
                <UIcon name="i-lucide-circle-question-mark" class="size-3.5 text-muted" />
              </UTooltip>
            </div>
          </template>
          <UInput
            v-model.number="scenarioForm.contextCount"
            type="number"
            :min="1"
            :max="100"
            @blur="handleFormChange"
          />
        </UFormField>
      </div>

      <!-- 模型参数 -->
      <div v-else-if="selectedConfigTab === 'params'" class="flex flex-col gap-5">
        <UFormField :description="getSamplerDescription(scenarioForm.temperature, scenarioForm.temperatureUseModelDefault)">
          <template #label>
            <div class="inline-flex items-center gap-1">
              <span>{{ t('scenario.form.modelTemperature') }}</span>
              <UTooltip :text="t('scenario.form.modelTemperatureDesc')">
                <UIcon name="i-lucide-circle-question-mark" class="size-3.5 text-muted" />
              </UTooltip>
            </div>
          </template>
          <template #hint>
            <USwitch
              class="shrink-0"
              :model-value="!scenarioForm.temperatureUseModelDefault"
              @update:model-value="(value: boolean) => handleSamplerDefaultToggle('temperature', !value)"
            />
          </template>
          <USlider
            v-if="!scenarioForm.temperatureUseModelDefault"
            v-model="scenarioForm.temperature"
            :min="0"
            :max="2"
            :step="0.1"
            size="xs"
            @change="handleFormChange"
          />
        </UFormField>

        <UFormField :description="getSamplerDescription(scenarioForm.topP, scenarioForm.topPUseModelDefault)">
          <template #label>
            <div class="inline-flex items-center gap-1">
              <span>Top P</span>
              <UTooltip :text="t('scenario.form.topPDesc')">
                <UIcon name="i-lucide-circle-question-mark" class="size-3.5 text-muted" />
              </UTooltip>
            </div>
          </template>
          <template #hint>
            <USwitch
              class="shrink-0"
              :model-value="!scenarioForm.topPUseModelDefault"
              @update:model-value="(value: boolean) => handleSamplerDefaultToggle('topP', !value)"
            />
          </template>
          <USlider
            v-if="!scenarioForm.topPUseModelDefault"
            v-model="scenarioForm.topP"
            :min="0"
            :max="1"
            :step="0.1"
            size="xs"
            @change="handleFormChange"
          />
        </UFormField>

        <UFormField>
          <template #label>
            <div class="inline-flex items-center gap-1">
              <span>{{ t('scenario.form.topK') }}</span>
              <UTooltip :text="t('scenario.form.topKDesc')">
                <UIcon name="i-lucide-circle-question-mark" class="size-3.5 text-muted" />
              </UTooltip>
            </div>
          </template>
          <UInput
            v-model.number="scenarioForm.topK"
            type="number"
            :min="1"
            :step="1"
            :placeholder="t('scenario.form.unset')"
            @blur="handleFormChange"
          />
        </UFormField>

        <UFormField :description="getSamplerDescription(scenarioForm.presencePenalty, scenarioForm.presencePenaltyUseModelDefault)">
          <template #label>
            <div class="inline-flex items-center gap-1">
              <span>{{ t('scenario.form.presencePenalty') }}</span>
              <UTooltip :text="t('scenario.form.presencePenaltyDesc')">
                <UIcon name="i-lucide-circle-question-mark" class="size-3.5 text-muted" />
              </UTooltip>
            </div>
          </template>
          <template #hint>
            <USwitch
              class="shrink-0"
              :model-value="!scenarioForm.presencePenaltyUseModelDefault"
              @update:model-value="(value: boolean) => handleSamplerDefaultToggle('presencePenalty', !value)"
            />
          </template>
          <USlider
            v-if="!scenarioForm.presencePenaltyUseModelDefault"
            v-model="scenarioForm.presencePenalty"
            :min="-1"
            :max="1"
            :step="0.1"
            size="xs"
            @change="handleFormChange"
          />
        </UFormField>

        <UFormField :description="getSamplerDescription(scenarioForm.frequencyPenalty, scenarioForm.frequencyPenaltyUseModelDefault)">
          <template #label>
            <div class="inline-flex items-center gap-1">
              <span>{{ t('scenario.form.frequencyPenalty') }}</span>
              <UTooltip :text="t('scenario.form.frequencyPenaltyDesc')">
                <UIcon name="i-lucide-circle-question-mark" class="size-3.5 text-muted" />
              </UTooltip>
            </div>
          </template>
          <template #hint>
            <USwitch
              class="shrink-0"
              :model-value="!scenarioForm.frequencyPenaltyUseModelDefault"
              @update:model-value="(value: boolean) => handleSamplerDefaultToggle('frequencyPenalty', !value)"
            />
          </template>
          <USlider
            v-if="!scenarioForm.frequencyPenaltyUseModelDefault"
            v-model="scenarioForm.frequencyPenalty"
            :min="-1"
            :max="1"
            :step="0.1"
            size="xs"
            @change="handleFormChange"
          />
        </UFormField>

        <UFormField>
          <template #label>
            <div class="inline-flex items-center gap-1">
              <span>{{ t('scenario.form.maxOutputTokens') }}</span>
              <UTooltip :text="t('scenario.form.maxOutputTokensDesc')">
                <UIcon name="i-lucide-circle-question-mark" class="size-3.5 text-muted" />
              </UTooltip>
            </div>
          </template>
          <UInput
            v-model.number="scenarioForm.maxOutputTokens"
            type="number"
            :min="1"
            :placeholder="t('scenario.form.unlimited')"
            @blur="handleFormChange"
          />
        </UFormField>

        <UFormField>
          <template #label>
            <div class="inline-flex items-center gap-1">
              <span>{{ t('scenario.form.seed') }}</span>
              <UTooltip :text="t('scenario.form.seedDesc')">
                <UIcon name="i-lucide-circle-question-mark" class="size-3.5 text-muted" />
              </UTooltip>
            </div>
          </template>
          <UInput
            v-model.number="scenarioForm.seed"
            type="number"
            :min="0"
            :step="1"
            :placeholder="t('scenario.form.unset')"
            @blur="handleFormChange"
          />
        </UFormField>

        <UFormField>
          <template #label>
            <div class="inline-flex items-center gap-1">
              <span>{{ t('scenario.form.stopSequences') }}</span>
              <UTooltip :text="t('scenario.form.stopSequencesDesc')">
                <UIcon name="i-lucide-circle-question-mark" class="size-3.5 text-muted" />
              </UTooltip>
            </div>
          </template>
          <UTextarea
            v-model="scenarioForm.stopSequencesText"
            :placeholder="t('scenario.form.stopSequencesPlaceholder')"
            class="w-full"
            @blur="handleFormChange"
          />
        </UFormField>

      </div>

      <!-- 系统提示词 -->
      <div v-else-if="selectedConfigTab === 'prompt'" class="flex flex-col gap-4 flex-1 min-h-0">
        <UFormField
          :ui="{
            container: 'h-full',
            labelWrapper: 'w-full min-w-0',
            label: 'min-w-0',
            hint: 'shrink-0 text-default'
          }"
          class="flex flex-col flex-1 min-h-0"
        >
          <template #label>
            <div class="inline-flex items-center gap-1 min-w-0">
              <span>{{ t('scenario.form.systemPrompt') }}</span>
              <UTooltip :text="t('scenario.form.systemPromptDesc')">
                <UIcon name="i-lucide-circle-question-mark" class="size-3.5 text-muted" />
              </UTooltip>
            </div>
          </template>
          <template #hint>
            <PromptLibraryInsertPopover
              v-model:open="scenarioPromptLibraryInsertOpen"
              @before-open="captureScenarioPromptInsertSelection"
              @insert="handleInsertPromptIntoSystemPrompt"
            >
              <UTooltip :text="t('chat.input.insertPrompt')">
                <UButton
                  icon="i-lucide-book-marked"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  square
                  class="shrink-0"
                />
              </UTooltip>
            </PromptLibraryInsertPopover>
          </template>
          <UTextarea
            ref="systemPromptTextareaRef"
            v-model="scenarioForm.systemPrompt"
            :placeholder="t('scenario.form.systemPromptPlaceholder')"
            class="w-full h-full resize-none"
            :ui="{
              base: 'h-full resize-none',
            }"
            @blur="handleFormChange"
          />
        </UFormField>
      </div>

      <!-- 知识库 -->
      <div v-else-if="selectedConfigTab === 'knowledge'" class="flex flex-col gap-4">
        <UFormField>
          <template #label>
            <div class="inline-flex items-center gap-1">
              <span>{{ t('scenario.form.knowledge') }}</span>
              <UTooltip :text="t('scenario.form.knowledgeDesc')">
                <UIcon name="i-lucide-circle-question-mark" class="size-3.5 text-muted" />
              </UTooltip>
            </div>
          </template>
          <div v-if="selectedKbs.length > 0" class="flex flex-wrap gap-2 mb-2">
            <UBadge
              v-for="kb in selectedKbs"
              :key="kb.id"
              :label="kb.name"
              variant="subtle"
              size="md"
            >
              <template #trailing>
                <UButton
                  icon="i-lucide-x"
                  size="2xs"
                  variant="ghost"
                  color="neutral"
                  @click="removeKb(kb.id)"
                />
              </template>
            </UBadge>
          </div>
          <KbSelector
            v-model:open="kbSelectorOpen"
            v-model:selected="scenarioForm.kbIds"
            class="w-80"
            @update:selected="handleFormChange"
          >
            <UButton
              icon="i-lucide-plus"
              :label="t('scenario.form.selectKnowledge')"
              variant="outline"
              size="sm"
            />
          </KbSelector>
        </UFormField>
        <UFormField :description="t('scenario.form.currentValue', { value: formatOptionalValue(scenarioForm.kbRecallTopK, 0) })">
          <template #label>
            <div class="inline-flex items-center gap-1">
              <span>{{ t('scenario.form.recallCount') }}</span>
              <UTooltip :text="t('scenario.form.recallCountTip')">
                <UIcon name="i-lucide-circle-question-mark" class="size-3.5 text-muted" />
              </UTooltip>
            </div>
          </template>
          <USlider
            v-model="scenarioForm.kbRecallTopK"
            :min="1"
            :max="50"
            :step="1"
            size="xs"
            @change="handleFormChange"
          />
        </UFormField>
        <UFormField :description="t('scenario.form.currentValue', { value: formatOptionalValue(scenarioForm.kbRecallMinScore) })">
          <template #label>
            <div class="inline-flex items-center gap-1">
              <span>{{ t('scenario.form.recallMinScore') }}</span>
              <UTooltip :text="t('scenario.form.recallMinScoreTip')">
                <UIcon name="i-lucide-circle-question-mark" class="size-3.5 text-muted" />
              </UTooltip>
            </div>
          </template>
          <USlider
            v-model="scenarioForm.kbRecallMinScore"
            :min="0"
            :max="1"
            :step="0.05"
            size="xs"
            @change="handleFormChange"
          />
        </UFormField>
      </div>

      <!-- Agent 设置 -->
      <div v-else-if="selectedConfigTab === 'agent'" class="flex flex-col gap-4">
        <UAlert
          color="neutral"
          variant="outline"
          icon="i-lucide-info"
          :title="t('scenario.form.agentOnlyTitle')"
        />

        <UFormField>
          <template #label>
            <div class="inline-flex items-center gap-1">
              <span>{{ t('scenario.form.selectSkill') }}</span>
              <UTooltip :text="t('scenario.form.selectSkillDesc')">
                <UIcon name="i-lucide-circle-question-mark" class="size-3.5 text-muted" />
              </UTooltip>
            </div>
          </template>
          <URadioGroup
            v-model="scenarioForm.skillPolicy"
            :items="[
              { label: t('scenario.form.skillPolicy.auto'), value: 'auto' },
              { label: t('scenario.form.skillPolicy.off'), value: 'off' }
            ]"
            @update:model-value="handleFormChange"
          />
        </UFormField>

        <UFormField>
          <template #label>
            <div class="inline-flex items-center gap-1">
              <span>{{ t('scenario.form.selectMcp') }}</span>
              <UTooltip :text="t('scenario.form.selectMcpDesc')">
                <UIcon name="i-lucide-circle-question-mark" class="size-3.5 text-muted" />
              </UTooltip>
            </div>
          </template>
          <URadioGroup
            v-model="scenarioForm.mcpPolicy"
            :items="[
              { label: t('scenario.form.mcpPolicy.auto'), value: 'auto' },
              { label: t('scenario.form.mcpPolicy.manual'), value: 'manual' },
              { label: t('scenario.form.mcpPolicy.off'), value: 'off' }
            ]"
            @update:model-value="handleMcpPolicyChange"
          />
        </UFormField>

        <UFormField
          v-if="scenarioForm.mcpPolicy === 'manual'"
        >
          <template #label>
            <div class="inline-flex items-center gap-1">
              <span>{{ t('scenario.form.mcpServers') }}</span>
              <UTooltip :text="t('scenario.form.mcpServersDesc')">
                <UIcon name="i-lucide-circle-question-mark" class="size-3.5 text-muted" />
              </UTooltip>
            </div>
          </template>
          <div
            v-if="availableMcpServers.length > 0"
            class="max-h-56 overflow-y-auto rounded-md border border-default divide-y divide-default"
          >
            <label
              v-for="server in availableMcpServers"
              :key="server.id"
              class="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-elevated/40"
            >
              <UCheckbox
                :model-value="scenarioForm.mcpServerIds.includes(server.id)"
                @update:model-value="(checked: boolean) => setMcpServerChecked(server.id, checked)"
              />
              <span class="flex-1 text-sm truncate">{{ server.name }}</span>
              <span
                :class="[
                  'size-2 rounded-full shrink-0',
                  server.enabled ? 'bg-green-500' : 'bg-inverted/30'
                ]"
              />
            </label>
          </div>
          <div v-else class="text-sm text-muted">{{ t("scenario.form.noMcpServers") }}</div>
        </UFormField>

        <UFormField>
          <template #label>
            <div class="inline-flex items-center gap-1">
              <span>{{ t('scenario.form.maxToolSteps') }}</span>
              <UTooltip :text="t('scenario.form.maxToolStepsDesc')">
                <UIcon name="i-lucide-circle-question-mark" class="size-3.5 text-muted" />
              </UTooltip>
            </div>
          </template>
          <UInput
            v-model.number="scenarioForm.maxToolSteps"
            type="number"
            :min="1"
            :max="20"
            @blur="handleFormChange"
          />
        </UFormField>

        <UFormField>
          <template #label>
            <div class="inline-flex items-center gap-1">
              <span>{{ t('scenario.form.workingDirs') }}</span>
              <UTooltip :text="t('scenario.form.workingDirsDesc')">
                <UIcon name="i-lucide-circle-question-mark" class="size-3.5 text-muted" />
              </UTooltip>
            </div>
          </template>
          <!-- 内置目录（始终允许，不可删） -->
          <div class="flex flex-col gap-2 mb-3">
            <div
              v-if="builtinWorkingDirPath"
              class="flex items-center gap-2 p-2 bg-elevated rounded-md"
            >
              <UIcon name="i-lucide-folder-lock" class="w-4 h-4 text-muted shrink-0" />
              <span class="flex-1 text-sm text-default truncate" :title="builtinWorkingDirPath">{{ builtinWorkingDirPath }}</span>
              <span class="text-xs text-muted shrink-0">{{ t("scenario.form.alwaysAllowed") }}</span>
            </div>
            <!-- 用户配置的目录 -->
            <div
              v-for="(dir, index) in scenarioForm.workingDirs"
              :key="index"
              class="flex items-center gap-2 p-2 bg-elevated rounded-md"
            >
              <UIcon name="i-lucide-folder" class="w-4 h-4 text-muted shrink-0" />
              <span class="flex-1 text-sm text-default truncate" :title="dir">{{ dir }}</span>
              <UButton
                icon="i-lucide-x"
                size="2xs"
                variant="ghost"
                color="neutral"
                @click="removeWorkingDir(index)"
              />
            </div>
          </div>
          
          <!-- 添加目录按钮 -->
          <UButton
            icon="i-lucide-folder-plus"
            :label="t('scenario.form.addDirectory')"
            variant="outline"
            size="sm"
            @click="addWorkingDir"
          />
        </UFormField>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onBeforeUnmount, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { loggerServiceRenderer } from "@shared";
import { useMyToast } from "@/composables/useMyToast";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { useMcpStore } from "@/stores/useMcpStore";
import { useKnowledge } from "@/composables/useKnowledge";
import type { Scenario } from "@/stores/useSettingsStore";
import UList from "@/components/UList.vue";
import UText from "@/components/UText.vue";
import ModelSelector from "@/components/ModelSelector.vue";
import KbSelector from "@/components/chat/KbSelector.vue";
import PromptLibraryInsertPopover from "@/components/chat/PromptLibraryInsertPopover.vue";

const logger = loggerServiceRenderer.withContext("ScenarioDetail");
const toast = useMyToast();
const { t } = useI18n();
const settingsStore = useSettingsStore();
const mcpStore = useMcpStore();
const { knowledgeBases } = useKnowledge();

const props = defineProps<{
  scenarioId: string
  initialTab?: string
}>();

// ===== 配置标签页 =====
const configTabs = computed(() => [
  { id: "base", name: t("scenario.tabs.base"), icon: "i-lucide-settings-2" },
  { id: "params", name: t("scenario.tabs.params"), icon: "i-lucide-sliders-horizontal" },
  { id: "prompt", name: t("scenario.tabs.prompt"), icon: "i-lucide-message-square" },
  { id: "knowledge", name: t("scenario.tabs.knowledge"), icon: "i-lucide-book-search" },
  { id: "agent", name: t("scenario.tabs.agent"), icon: "i-lucide-hammer" }
]);

function normalizeInitialTab(tab?: string) {
  if (tab === "model") return "base";
  if (tab === "mcp" || tab === "workingDirs") return "agent";
  return tab || "base";
}

const selectedConfigTab = ref(normalizeInitialTab(props.initialTab));

const modeOptions = computed(() => [
  {
    label: t("scenario.form.mode.chat"),
    value: "chat",
    description: t("chat.input.mode.chat.description")
  },
  {
    label: t("scenario.form.mode.agent"),
    value: "agent",
    description: t("chat.input.mode.agent.description")
  }
]);

// ===== 工作目录：内置目录（仅展示，不可删） =====
const builtinWorkingDirPath = ref("");

// ===== 场景数据 =====
const scenario = computed(() => 
  settingsStore.scenarios.find((s) => s.id === props.scenarioId)
);

const CONTEXT_COUNT_MIN = 1;
const CONTEXT_COUNT_MAX = 100;
const CONTEXT_COUNT_DEFAULT = 10;
const MAX_TOOL_STEPS_MIN = 1;
const MAX_TOOL_STEPS_MAX = 20;
const MAX_TOOL_STEPS_DEFAULT = 20;

// ===== 场景表单 =====
const scenarioForm = ref({
  mode: "chat" as "chat" | "agent",
  model: "__default__",
  temperature: 0.7,
  temperatureUseModelDefault: false,
  topP: 1.0,
  topPUseModelDefault: false,
  topK: undefined as number | undefined,
  presencePenalty: 0,
  presencePenaltyUseModelDefault: false,
  frequencyPenalty: 0,
  frequencyPenaltyUseModelDefault: false,
  contextCount: CONTEXT_COUNT_DEFAULT,
  maxOutputTokens: undefined as number | undefined,
  seed: undefined as number | undefined,
  stopSequencesText: "",
  systemPrompt: "",
  skillPolicy: "auto" as "auto" | "off",
  mcpPolicy: "auto" as "auto" | "manual" | "off",
  mcpServerIds: [] as string[],
  maxToolSteps: MAX_TOOL_STEPS_DEFAULT,
  workingDirs: [] as string[],
  kbIds: [] as string[],
  kbRecallTopK: 5,
  kbRecallMinScore: 0.75
});

// ===== 知识库配置 =====
const kbSelectorOpen = ref(false);

// ===== 系统提示词：从提示词库插入 =====
const systemPromptTextareaRef = ref<{ textareaRef?: HTMLTextAreaElement | null } | null>(null);
const scenarioPromptLibraryInsertOpen = ref(false);
const scenarioPromptInsertSavedSelection = ref<{ start: number; end: number } | null>(null);

watch(scenarioPromptLibraryInsertOpen, (open) => {
  if (!open) {
    scenarioPromptInsertSavedSelection.value = null;
  }
});

function getSystemPromptNativeTextarea(): HTMLTextAreaElement | null {
  return systemPromptTextareaRef.value?.textareaRef ?? null;
}

function captureScenarioPromptInsertSelection() {
  const el = getSystemPromptNativeTextarea();
  if (!el || document.activeElement !== el) {
    scenarioPromptInsertSavedSelection.value = null;
    return;
  }
  scenarioPromptInsertSavedSelection.value = {
    start: el.selectionStart,
    end: el.selectionEnd
  };
}

function handleInsertPromptIntoSystemPrompt(text: string) {
  const el = getSystemPromptNativeTextarea();
  const cur = scenarioForm.value.systemPrompt;
  let start: number;
  let end: number;

  if (el && document.activeElement === el) {
    start = el.selectionStart;
    end = el.selectionEnd;
  } else if (scenarioPromptInsertSavedSelection.value) {
    start = scenarioPromptInsertSavedSelection.value.start;
    end = scenarioPromptInsertSavedSelection.value.end;
    scenarioPromptInsertSavedSelection.value = null;
  } else {
    start = end = cur.length;
  }

  start = Math.max(0, Math.min(start, cur.length));
  end = Math.max(0, Math.min(end, cur.length));
  if (start > end) {
    const tmp = start;
    start = end;
    end = tmp;
  }

  scenarioForm.value.systemPrompt = cur.slice(0, start) + text + cur.slice(end);
  const caret = start + text.length;
  scenarioPromptInsertSavedSelection.value = null;
  scenarioPromptLibraryInsertOpen.value = false;
  handleFormChange();
  nextTick(() => {
    const ta = getSystemPromptNativeTextarea();
    ta?.focus();
    ta?.setSelectionRange(caret, caret);
  });
}
const selectedKbs = computed(() =>
  scenarioForm.value.kbIds
    .map((id) => knowledgeBases.value.find((k) => k.id === id))
    .filter((k): k is NonNullable<typeof k> => k !== undefined)
);
function removeKb(kbId: string) {
  const index = scenarioForm.value.kbIds.indexOf(kbId);
  if (index > -1) {
    scenarioForm.value.kbIds.splice(index, 1);
    handleFormChange();
  }
}

// 所有可用的 MCP 服务器
const availableMcpServers = computed(() => mcpStore.servers);

function handleMcpPolicyChange(value: string | number) {
  const policy = value as 'auto' | 'manual' | 'off';
  scenarioForm.value.mcpPolicy = policy;
  if (policy !== 'manual') {
    scenarioForm.value.mcpServerIds = [];
  }
  handleFormChange();
}

function setMcpServerChecked(serverId: string, checked: boolean) {
  const ids = [...scenarioForm.value.mcpServerIds];
  const index = ids.indexOf(serverId);
  if (checked && index === -1) {
    ids.push(serverId);
  } else if (!checked && index !== -1) {
    ids.splice(index, 1);
  }
  scenarioForm.value.mcpServerIds = ids;
  handleFormChange();
}

// ===== 工作目录配置 =====
const addWorkingDir = async () => {
  try {
    const result = await window.ipc('dialog:selectDirectory', { title: t('scenario.dialog.selectWorkingDir') });
    if (!result.canceled && result.filePath) {
      const dir = result.filePath;
      // 避免重复添加
      if (!scenarioForm.value.workingDirs.includes(dir)) {
        scenarioForm.value.workingDirs.push(dir);
        handleFormChange();
      }
    }
  } catch (error) {
    logger.error('select working dir failed', { error });
    toast.error({ title: t('scenario.toast.selectDirectoryFailed') });
  }
};

const removeWorkingDir = (index: number) => {
  scenarioForm.value.workingDirs.splice(index, 1);
  handleFormChange();
};

function createFormSnapshot() {
  return {
    model: scenarioForm.value.model,
    mode: scenarioForm.value.mode,
    temperature: scenarioForm.value.temperature,
    temperatureUseModelDefault: scenarioForm.value.temperatureUseModelDefault,
    topP: scenarioForm.value.topP,
    topPUseModelDefault: scenarioForm.value.topPUseModelDefault,
    topK: scenarioForm.value.topK,
    presencePenalty: scenarioForm.value.presencePenalty,
    presencePenaltyUseModelDefault: scenarioForm.value.presencePenaltyUseModelDefault,
    frequencyPenalty: scenarioForm.value.frequencyPenalty,
    frequencyPenaltyUseModelDefault: scenarioForm.value.frequencyPenaltyUseModelDefault,
    contextCount: scenarioForm.value.contextCount,
    maxOutputTokens: scenarioForm.value.maxOutputTokens,
    seed: scenarioForm.value.seed,
    stopSequencesText: scenarioForm.value.stopSequencesText,
    systemPrompt: scenarioForm.value.systemPrompt,
    skillPolicy: scenarioForm.value.skillPolicy,
    mcpPolicy: scenarioForm.value.mcpPolicy,
    mcpServerIds: [...scenarioForm.value.mcpServerIds],
    maxToolSteps: scenarioForm.value.maxToolSteps,
    workingDirs: [...scenarioForm.value.workingDirs],
    kbIds: [...scenarioForm.value.kbIds],
    kbRecallTopK: scenarioForm.value.kbRecallTopK,
    kbRecallMinScore: scenarioForm.value.kbRecallMinScore
  };
}

function hasUnsavedChanges() {
  return JSON.stringify(createFormSnapshot()) !== JSON.stringify(initialValues.value);
}

function buildScenarioUpdates(snapshot = createFormSnapshot()) {
  const stopSequences = parseStopSequences(snapshot.stopSequencesText);
  return {
    selectedModel: snapshot.model,
    mode: snapshot.mode,
    temperature: snapshot.temperatureUseModelDefault
      ? null
      : normalizeOptionalNumber(snapshot.temperature),
    topP: snapshot.topPUseModelDefault
      ? null
      : normalizeOptionalNumber(snapshot.topP),
    presencePenalty: snapshot.presencePenaltyUseModelDefault
      ? null
      : normalizeOptionalNumber(snapshot.presencePenalty),
    frequencyPenalty: snapshot.frequencyPenaltyUseModelDefault
      ? null
      : normalizeOptionalNumber(snapshot.frequencyPenalty),
    contextCount: normalizeBoundedInteger(snapshot.contextCount, {
      min: CONTEXT_COUNT_MIN,
      max: CONTEXT_COUNT_MAX,
      fallback: CONTEXT_COUNT_DEFAULT,
    }),
    topK: normalizeOptionalTopK(snapshot.topK) ?? null,
    maxOutputTokens: normalizeOptionalInteger(snapshot.maxOutputTokens) ?? null,
    seed: normalizeOptionalInteger(snapshot.seed) ?? null,
    stopSequences,
    systemPrompt: snapshot.systemPrompt,
    skillPolicy: snapshot.skillPolicy,
    mcpPolicy: snapshot.mcpPolicy,
    // 转换为普通数组，避免序列化问题
    mcpServerIds: snapshot.mcpPolicy === 'manual'
      ? [...snapshot.mcpServerIds]
      : [],
    maxToolSteps: normalizeBoundedInteger(snapshot.maxToolSteps, {
      min: MAX_TOOL_STEPS_MIN,
      max: MAX_TOOL_STEPS_MAX,
      fallback: MAX_TOOL_STEPS_DEFAULT,
    }),
    workingDirs: [...snapshot.workingDirs],
    kbIds: [...snapshot.kbIds],
    kbRecallTopK: snapshot.kbRecallTopK,
    kbRecallMinScore: snapshot.kbRecallMinScore
  };
}

// ===== 表单保存 =====
const initialValues = ref(createFormSnapshot());

// ===== 场景切换时同步表单 =====
watch(
  () => scenario.value,
  (newScenario) => {
    if (!newScenario) return;

    syncFormFromScenario(newScenario);
    initialValues.value = createFormSnapshot();
  },
  { immediate: true }
);

function syncFormFromScenario(scenario: Scenario) {
  scenarioForm.value.mode = scenario.mode ?? "chat";
  scenarioForm.value.model = scenario.selectedModel;
  scenarioForm.value.temperatureUseModelDefault = scenario.temperature === undefined;
  scenarioForm.value.temperature = scenario.temperature ?? 0.7;
  scenarioForm.value.topPUseModelDefault = scenario.topP === undefined;
  scenarioForm.value.topP = scenario.topP ?? 1.0;
  scenarioForm.value.topK = normalizeOptionalTopK(scenario.topK);
  scenarioForm.value.presencePenaltyUseModelDefault = scenario.presencePenalty === undefined;
  scenarioForm.value.presencePenalty = scenario.presencePenalty ?? 0;
  scenarioForm.value.frequencyPenaltyUseModelDefault = scenario.frequencyPenalty === undefined;
  scenarioForm.value.frequencyPenalty = scenario.frequencyPenalty ?? 0;
  scenarioForm.value.contextCount = normalizeBoundedInteger(scenario.contextCount, {
    min: CONTEXT_COUNT_MIN,
    max: CONTEXT_COUNT_MAX,
    fallback: CONTEXT_COUNT_DEFAULT,
  });
  scenarioForm.value.maxOutputTokens = scenario.maxOutputTokens;
  scenarioForm.value.seed = scenario.seed;
  scenarioForm.value.stopSequencesText = (scenario.stopSequences || []).join('\n');
  scenarioForm.value.systemPrompt = scenario.systemPrompt || "";
  scenarioForm.value.skillPolicy = scenario.skillPolicy ?? 'auto';
  scenarioForm.value.mcpPolicy = scenario.mcpPolicy ?? 'auto';
  scenarioForm.value.mcpServerIds =
    (scenario.mcpPolicy ?? 'auto') === 'manual' ? (scenario.mcpServerIds || []) : [];
  scenarioForm.value.maxToolSteps = normalizeBoundedInteger(scenario.maxToolSteps, {
    min: MAX_TOOL_STEPS_MIN,
    max: MAX_TOOL_STEPS_MAX,
    fallback: MAX_TOOL_STEPS_DEFAULT,
  });
  scenarioForm.value.workingDirs = scenario.workingDirs || [];
  scenarioForm.value.kbIds = scenario.kbIds || [];
  scenarioForm.value.kbRecallTopK = scenario.kbRecallTopK ?? 5;
  scenarioForm.value.kbRecallMinScore = scenario.kbRecallMinScore ?? 0.75;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let inFlightSave: Promise<void> | null = null;

const flushSave = async () => {
  if (!props.scenarioId) return;

  while (inFlightSave) {
    await inFlightSave;
  }
  if (!hasUnsavedChanges()) return;

  const snapshot = createFormSnapshot();

  const saveTask = (async () => {
    try {
      await settingsStore.updateScenario(props.scenarioId, buildScenarioUpdates(snapshot));
      initialValues.value = snapshot;
      logger.info("auto saved scenario config");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.warn("auto save failed", { msg });
      toast.error({
        title: t("scenario.toast.autoSaveFailed"),
        description: msg
      });
    } finally {
      inFlightSave = null;
    }
  })();

  inFlightSave = saveTask;
  await saveTask;
};

const scheduleAutoSave = () => {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void flushSave();
  }, 500);
};

type SamplerField = "temperature" | "topP" | "presencePenalty" | "frequencyPenalty";

function handleSamplerDefaultToggle(field: SamplerField, value: boolean) {
  const enabled = Boolean(value);
  if (field === "temperature") {
    scenarioForm.value.temperatureUseModelDefault = enabled;
  } else if (field === "topP") {
    scenarioForm.value.topPUseModelDefault = enabled;
  } else if (field === "presencePenalty") {
    scenarioForm.value.presencePenaltyUseModelDefault = enabled;
  } else {
    scenarioForm.value.frequencyPenaltyUseModelDefault = enabled;
  }
  scheduleAutoSave();
}

function getSamplerDescription(value: unknown, useModelDefault: boolean, digits = 1): string | undefined {
  if (useModelDefault) return t("scenario.form.useModelDefault");
  return t("scenario.form.currentValue", { value: formatOptionalValue(value, digits) });
}

function formatOptionalValue(value: unknown, digits = 1): string {
  const normalized = normalizeOptionalNumber(value);
  if (normalized === undefined) return t("scenario.form.unset");
  if (digits <= 0) return String(Math.round(normalized));
  return Number(normalized.toFixed(digits)).toString();
}

function toOptionalRawValue(value: unknown): unknown {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === null || raw === undefined) return undefined;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    return trimmed === "" ? undefined : trimmed;
  }
  return raw;
}

function normalizeOptionalNumber(value: unknown): number | undefined {
  const raw = toOptionalRawValue(value);
  if (raw === undefined) return undefined;
  const parsed = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeOptionalInteger(value: unknown): number | undefined {
  const raw = toOptionalRawValue(value);
  if (raw === undefined) return undefined;
  const parsed = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.floor(parsed);
}

function normalizeOptionalTopK(value: unknown): number | undefined {
  const normalized = normalizeOptionalInteger(value);
  if (normalized === undefined) return undefined;
  return normalized < 1 ? 1 : normalized;
}

function normalizeBoundedInteger(
  value: unknown,
  options: { min: number; max: number; fallback: number }
): number {
  const normalized = normalizeOptionalInteger(value);
  if (normalized === undefined) return options.fallback;
  return Math.min(options.max, Math.max(options.min, normalized));
}

function parseStopSequences(text: string): string[] {
  return text
    .split(/\r?\n|,/g)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function normalizeOptionalNumericFields() {
  scenarioForm.value.temperature = normalizeOptionalNumber(scenarioForm.value.temperature) ?? 0.7;
  scenarioForm.value.topP = normalizeOptionalNumber(scenarioForm.value.topP) ?? 1.0;
  scenarioForm.value.topK = normalizeOptionalTopK(scenarioForm.value.topK);
  scenarioForm.value.presencePenalty = normalizeOptionalNumber(scenarioForm.value.presencePenalty) ?? 0;
  scenarioForm.value.frequencyPenalty = normalizeOptionalNumber(scenarioForm.value.frequencyPenalty) ?? 0;
  scenarioForm.value.contextCount = normalizeBoundedInteger(scenarioForm.value.contextCount, {
    min: CONTEXT_COUNT_MIN,
    max: CONTEXT_COUNT_MAX,
    fallback: CONTEXT_COUNT_DEFAULT,
  });
  scenarioForm.value.maxToolSteps = normalizeBoundedInteger(scenarioForm.value.maxToolSteps, {
    min: MAX_TOOL_STEPS_MIN,
    max: MAX_TOOL_STEPS_MAX,
    fallback: MAX_TOOL_STEPS_DEFAULT,
  });
  scenarioForm.value.maxOutputTokens = normalizeOptionalInteger(scenarioForm.value.maxOutputTokens);
  scenarioForm.value.seed = normalizeOptionalInteger(scenarioForm.value.seed);
}

const handleFormChange = () => {
  normalizeOptionalNumericFields();
  scheduleAutoSave();
};

const handleModelChange = () => {
  scheduleAutoSave();
};

// ===== 生命周期 =====
onMounted(async () => {
  try {
    const res = await window.ipc("settings:getBuiltinWorkingDir") as { path: string };
    if (res?.path) builtinWorkingDirPath.value = res.path;
  } catch {
    // ignore
  }
});

onBeforeUnmount(() => {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  if (hasUnsavedChanges()) {
    void flushSave();
  }
});

// 初始化 MCP Store
if (!mcpStore.isInitialized) {
  mcpStore.initialize();
}
</script>
