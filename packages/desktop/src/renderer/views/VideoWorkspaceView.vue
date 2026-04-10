<template>
  <div class="h-full flex gap-0 relative">
    <section class="w-50 h-full bg-default rounded-xl overflow-hidden flex flex-col">
      <div class="px-2 pt-3 pb-2">
        <div class="mb-3 text-sm font-medium text-toned flex items-center">
          <span class="ml-3 select-none whitespace-nowrap">{{ t("video.workspace.sidebar") }}</span>
        </div>
      </div>
      <UList
        :items="workspaces"
        :model-value="activeWorkspaceId"
        value-key="id"
        label-key="name"
        padding="md"
        gap="none"
        size="lg"
        class="flex-1"
        @select="(item) => selectWorkspace(item.id)"
      >
        <template #item="{ item }">
          <div class="flex items-center gap-2 w-full min-w-0">
            <UInput
              v-if="renamingWorkspaceId === item.id"
              v-model="renamingWorkspaceName"
              variant="none"
              autofocus
              size="md"
              class="w-full"
              :ui="{ base: 'px-0 py-0.5' }"
              @click.stop
              @keydown.enter="saveWorkspaceName(item.id)"
              @keydown.esc="cancelRenameWorkspace"
              @blur="saveWorkspaceName(item.id)"
            />
            <div v-else class="min-w-0 flex-1">
              <UText :text="item.name" class="text-sm" />
              <div class="text-xs text-toned mt-0.5">{{ workspaceSecondaryLine(item) }}</div>
            </div>
          </div>
        </template>

        <template #item-trailing="{ item }">
          <div v-if="renamingWorkspaceId !== item.id" class="relative flex items-center justify-end">
            <div
              class="text-xs text-muted tabular-nums transition-opacity group-hover:opacity-0"
              :class="{ 'opacity-0': openMenuWorkspaceId === item.id }"
            >
              {{ formatWorkspaceUpdatedAt(item.updatedAt) }}
            </div>
            <div
              class="absolute right-0 opacity-0 group-hover:opacity-100 transition-opacity"
              :class="{ 'opacity-100': openMenuWorkspaceId === item.id }"
            >
              <UDropdownMenu
                :items="getWorkspaceMenuItems(item.id)"
                size="md"
                @update:open="setWorkspaceMenuOpen(item.id, $event)"
              >
                <UButton icon="i-lucide-more-horizontal" variant="ghost" color="neutral" size="sm" square @click.stop />
              </UDropdownMenu>
            </div>
          </div>
        </template>
      </UList>

      <div class="px-2 pt-2 pb-3 border-t border-default">
        <UButton block size="lg" variant="soft" color="neutral" class="w-full" @click="createWorkspace">
          <UIcon name="i-lucide-plus" class="w-4 h-4 shrink-0" />
          <span class="whitespace-nowrap">{{ t("video.workspace.newWorkspace") }}</span>
        </UButton>
      </div>
    </section>

    <div class="flex-1 min-w-0 ml-[6px] flex gap-[6px]">
      <section class="min-w-0 h-full overflow-hidden flex-1 flex flex-col relative rounded-xl bg-elevated">
        <div
          ref="canvasScrollRef"
          :class="[
            'flex-1 min-h-0 overflow-y-auto px-4 py-4',
            detailModalOpen ? 'pr-[368px]' : ''
          ]"
        >
          <div v-if="activeGroups.length === 0" class="h-full flex items-center justify-center">
            <UEmpty icon="i-lucide-clapperboard" :title="t('video.workspace.empty')" variant="naked" />
          </div>

          <div v-else class="space-y-3">
            <article
              v-for="group in activeGroups"
              :key="group.id"
              class="px-1 py-1"
            >
              <div class="flex items-start gap-4 overflow-x-auto pb-1">
                <div
                  v-for="run in group.runs"
                  :key="run.id"
                  class="shrink-0"
                >
                  <div v-if="run.status === 'failed' || run.status === 'cancelled'" class="flex items-center justify-end mb-1">
                    <UButton
                      icon="i-lucide-refresh-cw"
                      size="xs"
                      variant="soft"
                      color="neutral"
                      @click="retryRun(group, run)"
                    >
                      {{ t('video.workspace.retry') }}
                    </UButton>
                  </div>

                  <div class="flex items-start gap-0 min-w-max">
                    <div
                      v-for="video in videosByRun(group, run)"
                      :key="video.id"
                      data-video-thumb
                      class="group relative shrink-0 max-w-full rounded-xl border border-default bg-black overflow-hidden"
                      :style="videoBoxStyle(video, run)"
                    >
                      <video
                        :src="toVideoSrc(video)"
                        controls
                        preload="metadata"
                        class="block w-full h-full bg-black"
                      />
                      <div class="absolute right-1.5 top-1.5 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <UButton
                          icon="i-lucide-info"
                          size="xs"
                          color="neutral"
                          variant="solid"
                          class="rounded-md bg-black/60 hover:bg-black/70 text-white"
                          @click.stop="openVideoDetail(group, video.id)"
                        >
                          {{ t("video.workspace.viewDetails") }}
                        </UButton>
                      </div>
                    </div>

                    <div
                      v-if="videosByRun(group, run).length === 0"
                      class="group shrink-0 max-w-full rounded-xl border border-default bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center relative text-xs text-toned"
                      :style="runPlaceholderStyle(run)"
                    >
                      <span v-if="run.status === 'running' || run.status === 'queued'">{{ t("video.workspace.running") }}</span>
                      <span v-else-if="run.status === 'failed'">{{ run.errorMessage || t("video.workspace.runFailed") }}</span>
                      <span v-else-if="run.status === 'cancelled'">{{ t("chat.store.aborted") }}</span>
                      <span v-else>-</span>
                    </div>
                  </div>
                  <div
                    v-if="run.warningMessage"
                    class="text-xs text-amber-700 mt-2 whitespace-pre-wrap break-all"
                  >
                    {{ run.warningMessage }}
                  </div>
                </div>
              </div>
            </article>
          </div>
        </div>
      </section>

      <aside
        v-if="activeWorkspace"
        class="shrink-0 w-[350px] h-full bg-default rounded-xl border border-default overflow-hidden flex flex-col"
      >
        <div class="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
          <UFormField :label="t('video.workspace.form.model')">
            <ModelSelector
              v-model="composer.modelKey"
              placement="bottom"
              align="end"
              model-type="video-gen"
              :show-default="false"
              :ghost="false"
              class="w-full"
            />
          </UFormField>

          <UFormField v-if="showAspectRatioInput" :label="t('video.workspace.form.aspectRatio')">
            <USelect
              v-if="aspectRatioItems.length > 0"
              v-model="composer.aspectRatio"
              :items="aspectRatioItems"
              value-key="value"
              size="sm"
              variant="outline"
              class="w-full"
            />
            <UInput
              v-else
              v-model="composer.aspectRatio"
              size="sm"
              variant="outline"
              class="w-full"
              :placeholder="t('video.workspace.form.aspectRatioPlaceholder')"
            />
          </UFormField>

          <UFormField v-if="showResolutionInput" :label="t('video.workspace.form.resolution')">
            <USelect
              v-if="resolutionItems.length > 0 && !allowCustomResolution"
              v-model="composer.resolution"
              :items="resolutionItems"
              value-key="value"
              size="sm"
              variant="outline"
              class="w-full"
            />
            <UInput
              v-else
              v-model="composer.resolution"
              size="sm"
              variant="outline"
              class="w-full"
              :placeholder="t('video.workspace.form.resolutionPlaceholder')"
            />
            <div v-if="allowCustomResolution && customResolutionHint" class="text-xs text-toned mt-1">
              {{ customResolutionHint }}
            </div>
          </UFormField>

          <UFormField v-if="showDurationInput" :label="t('video.workspace.form.duration')">
            <USelect
              v-if="durationItems.length > 0"
              v-model="composer.duration"
              :items="durationItems"
              value-key="value"
              size="sm"
              variant="outline"
              class="w-full"
            />
            <UInput
              v-else
              v-model.number="composer.duration"
              type="number"
              size="sm"
              variant="outline"
              class="w-full"
              :min="durationRange.min"
              :max="durationRange.max"
            />
          </UFormField>

          <UFormField v-if="showFpsInput" :label="t('video.workspace.form.fps')">
            <UInput
              v-model.number="composer.fps"
              type="number"
              size="sm"
              variant="outline"
              class="w-full"
              :min="fpsRange.min"
              :max="fpsRange.max"
            />
          </UFormField>

          <UFormField v-if="showCountInput" :label="t('video.workspace.form.count')">
            <UInput
              v-model.number="composer.count"
              type="number"
              size="sm"
              variant="outline"
              class="w-full"
              :min="countRange.min"
              :max="countRange.max"
            />
          </UFormField>

          <UFormField v-if="showSeedInput" label="Seed">
            <UInput
              v-model.number="composer.seed"
              type="number"
              size="sm"
              variant="outline"
              class="w-full"
              :min="seedRange.min"
              :max="seedRange.max"
              :placeholder="t('video.workspace.form.seedPlaceholder')"
            />
          </UFormField>

          <UFormField v-if="showNegativePromptInput" :label="t('video.workspace.form.negativePrompt')">
            <UTextarea
              v-model="composer.negativePrompt"
              :rows="3"
              :placeholder="t('video.workspace.form.negativePromptPlaceholder')"
            />
          </UFormField>

          <USeparator v-if="customParamSchema.length > 0" />

          <template v-for="field in customParamSchema" :key="`video-custom-${field.key}`">
            <UFormField :label="resolveCustomFieldLabel(field)">
              <template #label>
                <div class="inline-flex items-center gap-1">
                  <span>{{ resolveCustomFieldLabel(field) }}</span>
                  <UTooltip v-if="resolveCustomFieldDescription(field)" :text="resolveCustomFieldDescription(field)">
                    <UIcon name="i-lucide-info" class="size-3.5 text-muted" />
                  </UTooltip>
                </div>
              </template>

              <USwitch
                v-if="field.type === 'boolean'"
                :model-value="!!composer.providerOptions[field.key]"
                @update:model-value="(value) => { composer.providerOptions = { ...composer.providerOptions, [field.key]: !!value }; }"
              />

              <UInput
                v-else-if="field.type === 'number'"
                :model-value="composer.providerOptions[field.key] == null ? '' : String(composer.providerOptions[field.key])"
                type="number"
                size="sm"
                variant="outline"
                class="w-full"
                @update:model-value="(value) => { const n = Number(value); composer.providerOptions = { ...composer.providerOptions, [field.key]: Number.isFinite(n) ? n : undefined }; }"
              />

              <USelect
                v-else-if="field.type === 'select'"
                :model-value="composer.providerOptions[field.key] as any"
                :items="(field.options || []).map((item) => ({ label: resolveCustomFieldOptionLabel(field, item), value: item.value }))"
                value-key="value"
                size="sm"
                variant="outline"
                class="w-full"
                @update:model-value="(value) => { composer.providerOptions = { ...composer.providerOptions, [field.key]: value }; }"
              />

              <UTextarea
                v-else-if="field.type === 'json'"
                :model-value="typeof composer.providerOptions[field.key] === 'string' ? composer.providerOptions[field.key] as string : (composer.providerOptions[field.key] == null ? '' : JSON.stringify(composer.providerOptions[field.key], null, 2))"
                :rows="3"
                variant="outline"
                class="w-full font-mono text-xs"
                @update:model-value="(value) => { composer.providerOptions = { ...composer.providerOptions, [field.key]: value || undefined }; }"
              />

              <UTextarea
                v-else-if="field.ui?.component === 'textarea'"
                :model-value="composer.providerOptions[field.key] == null ? '' : String(composer.providerOptions[field.key])"
                :rows="3"
                variant="outline"
                class="w-full"
                @update:model-value="(value) => { composer.providerOptions = { ...composer.providerOptions, [field.key]: value || undefined }; }"
              />

              <UInput
                v-else
                :model-value="composer.providerOptions[field.key] == null ? '' : String(composer.providerOptions[field.key])"
                size="sm"
                variant="outline"
                class="w-full"
                @update:model-value="(value) => { composer.providerOptions = { ...composer.providerOptions, [field.key]: value || undefined }; }"
              />
            </UFormField>
          </template>
        </div>

        <div class="shrink-0 px-2.5 py-1.5 bg-default">
          <div
            :class="[
              'rounded-2xl bg-default overflow-hidden transition-all duration-200 border border-default',
              { 'shadow-sm': isInputFocused }
            ]"
          >
            <div class="relative">
              <div
                v-if="hasComposerAttachments"
                class="px-2.5 pt-2 pb-1.5 space-y-2"
              >
                <div v-if="composer.referenceImages.length > 0" class="flex flex-wrap gap-2">
                  <div
                    v-for="(item, idx) in composer.referenceImages"
                    :key="item.id || idx"
                    class="relative group h-14 w-14 rounded-lg border border-default bg-muted overflow-hidden flex items-center justify-center"
                  >
                    <UImage
                      :src="item.url"
                      :alt="item.name || `reference ${idx + 1}`"
                      :preview-name="item.name || `reference-${idx + 1}`"
                      class="h-full w-full object-cover"
                    />
                    <UButton
                      icon="i-lucide-x"
                      size="xs"
                      color="neutral"
                      square
                      class="p-0.5 rounded-full absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity"
                      @click.stop="removeReferenceImage(idx)"
                    />
                  </div>
                </div>
              </div>
              <UTextarea
                v-model="composer.prompt"
                :placeholder="t('video.workspace.form.promptPlaceholder')"
                size="lg"
                :rows="3"
                :maxrows="8"
                variant="none"
                autoresize
                :highlight="false"
                class="w-full px-0.5 py-1"
                @keydown="handlePromptKeydown"
                @focus="isInputFocused = true"
                @blur="isInputFocused = false"
              />
              <div class="flex items-center justify-between p-2">
                <UDropdownMenu
                  v-if="supportsReferenceImages"
                  :items="composerAttachmentMenuItems"
                  size="sm"
                  :content="{ side: 'top', align: 'start' }"
                >
                  <UButton
                    icon="i-lucide-plus"
                    color="neutral"
                    size="sm"
                    square
                    variant="ghost"
                    class="rounded-full"
                  />
                </UDropdownMenu>
                <div v-else />
                <UTooltip :text="t('video.workspace.submit')">
                  <UButton
                    icon="i-lucide-arrow-up"
                    color="neutral"
                    size="sm"
                    square
                    class="rounded-full"
                    :loading="submitting"
                    :disabled="submitting || !composer.prompt.trim()"
                    @click="submitGeneration"
                  />
                </UTooltip>
              </div>
            </div>
          </div>
          <div class="mt-1.5 flex justify-end text-[11px] text-muted select-none">
            <USelect
              v-model="sendShortcutMode"
              :items="sendShortcutOptions"
              size="xs"
              variant="ghost"
              @update:model-value="handleShortcutChange"
            />
          </div>
          <input
            ref="referenceImageInputRef"
            type="file"
            accept="image/*"
            multiple
            class="hidden"
            @change="handleReferenceImageUpload"
          />
        </div>
      </aside>
    </div>

    <Transition
      enter-active-class="transition-all duration-200 ease-out"
      leave-active-class="transition-all duration-150 ease-in"
      enter-from-class="opacity-0 translate-x-2"
      leave-to-class="opacity-0 translate-x-2"
    >
      <aside
        v-if="detailModalOpen && selectedVideo"
        ref="detailAsideRef"
        class="absolute right-[368px] top-5 bottom-5 w-[340px] bg-default rounded-xl border border-default shadow-lg overflow-hidden pointer-events-auto"
      >
        <div class="h-full flex flex-col">
          <div class="shrink-0 h-12 flex items-center justify-between px-3 border-b border-default">
            <div class="text-sm font-medium text-toned">{{ t("video.workspace.detail.title") }}</div>
            <UButton icon="i-lucide-x" size="sm" color="neutral" variant="ghost" square @click="clearVideoDetail" />
          </div>

          <div class="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
            <UFormField :label="t('video.workspace.detail.status')"><div class="text-sm text-default">{{ statusLabel(selectedVideoStatus) }}</div></UFormField>
            <UFormField :label="t('video.workspace.form.model')"><div class="text-sm text-default break-all">{{ resolveSelectedModelLabel(selectedVideoModel) }}</div></UFormField>
            <UFormField :label="t('video.workspace.detail.prompt')"><div class="text-sm text-default whitespace-pre-wrap break-all">{{ selectedVideoPrompt || "-" }}</div></UFormField>
            <UFormField :label="t('video.workspace.detail.videoTime')"><div class="text-sm text-default">{{ selectedVideoCreatedAtText }}</div></UFormField>
            <UFormField :label="t('video.workspace.detail.startedAt')"><div class="text-sm text-default">{{ selectedRunStartedAtText }}</div></UFormField>
            <UFormField :label="t('video.workspace.detail.completedAt')"><div class="text-sm text-default">{{ selectedRunCompletedAtText }}</div></UFormField>
            <UFormField :label="t('video.workspace.detail.duration')"><div class="text-sm text-default">{{ selectedRunDurationText }}</div></UFormField>
            <USeparator />
            <UFormField :label="t('video.workspace.form.aspectRatio')"><div class="text-sm text-default">{{ selectedVideoParams?.aspectRatio || "-" }}</div></UFormField>
            <UFormField :label="t('video.workspace.form.resolution')"><div class="text-sm text-default">{{ selectedVideoParams?.resolution || "-" }}</div></UFormField>
            <UFormField :label="t('video.workspace.form.duration')"><div class="text-sm text-default">{{ selectedVideoParams?.duration ?? "-" }}</div></UFormField>
            <UFormField :label="t('video.workspace.form.fps')"><div class="text-sm text-default">{{ selectedVideoParams?.fps ?? "-" }}</div></UFormField>
            <UFormField :label="t('video.workspace.form.count')"><div class="text-sm text-default">{{ selectedVideoParams?.count ?? "-" }}</div></UFormField>
            <UFormField label="seed"><div class="text-sm text-default">{{ selectedVideoParams?.seed ?? "-" }}</div></UFormField>
            <UFormField :label="t('video.workspace.form.negativePrompt')"><div class="text-sm text-default whitespace-pre-wrap break-all">{{ selectedVideoParams?.negativePrompt || "-" }}</div></UFormField>
            <UFormField :label="t('video.workspace.form.referenceImages')"><div class="text-sm text-default">{{ selectedVideoParams?.referenceImages?.length ?? 0 }}</div></UFormField>
            <UFormField :label="t('video.workspace.form.providerOptions')">
              <div class="text-sm text-default whitespace-pre-wrap break-all">{{ selectedVideoParams?.providerOptions ? JSON.stringify(selectedVideoParams.providerOptions, null, 2) : "-" }}</div>
            </UFormField>
            <UFormField v-if="selectedVideoWarning" :label="t('video.workspace.notice')">
              <div class="text-sm text-amber-700 whitespace-pre-wrap break-all">{{ selectedVideoWarning }}</div>
            </UFormField>
            <UFormField v-if="selectedRun?.errorMessage" :label="t('video.workspace.runFailed')">
              <div class="text-sm text-red-700 whitespace-pre-wrap break-all">{{ selectedRun.errorMessage }}</div>
            </UFormField>
          </div>

          <div class="shrink-0 border-t border-default p-3">
            <div class="grid grid-cols-3 gap-2">
              <UButton
                icon="i-lucide-download"
                size="sm"
                variant="soft"
                color="neutral"
                :disabled="!selectedVideo"
                @click="selectedVideo && downloadVideo(selectedVideo)"
              >
                {{ t('video.workspace.download') }}
              </UButton>
              <UButton
                icon="i-lucide-copy-plus"
                size="sm"
                variant="soft"
                color="neutral"
                :disabled="!selectedGroup"
                @click="selectedGroup && reuseVideoGroup(selectedGroup, selectedRun)"
              >
                {{ t('video.workspace.reuseParams') }}
              </UButton>
              <UButton
                icon="i-lucide-refresh-cw"
                size="sm"
                variant="soft"
                color="neutral"
                :disabled="!selectedGroup || !selectedRun || selectedRun.status === 'running' || selectedRun.status === 'queued'"
                @click="retrySelectedRun"
              >
                {{ t('video.workspace.regenerate') }}
              </UButton>
              <UButton
                icon="i-lucide-trash-2"
                size="sm"
                variant="soft"
                color="error"
                :disabled="!selectedGroup || !selectedVideo || selectedVideoStatus === 'queued' || selectedVideoStatus === 'running'"
                @click="removeSelectedVideo"
              >
                {{ t('common.delete') }}
              </UButton>
            </div>
          </div>
        </div>
      </aside>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { onClickOutside } from "@vueuse/core";
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute, useRouter } from "vue-router";
import type { ProviderOptionFieldSchema } from "@shared";
import UList from "@/components/UList.vue";
import UText from "@/components/UText.vue";
import UImage from "@/components/UImage.vue";
import ModelSelector from "@/components/ModelSelector.vue";
import { useMyToast } from "@/composables/useMyToast";
import { useConfirm } from "@/composables/useConfirm";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { isMac } from "@/utils/platformUtils";
import {
  buildVideoRetryRunInput,
  buildVideoReuseComposerState,
  normalizeVideoWorkspaceRows,
  reconcileVideoDetailSelection,
  removeWorkspaceFromState as removeVideoWorkspaceFromState,
  resolveVideoRemovalAction,
  replaceWorkspaceGroups,
  resolveWorkspaceSelection as resolveVideoWorkspaceSelection,
} from "@/views/videoWorkspaceViewModel";

type GenerationStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";

type ComposerImageRef = {
  id?: string;
  name?: string;
  url: string;
};

type WorkspaceComposer = {
  activeTask: "generate";
  byTask: {
    generate: {
      modelKey: string;
      aspectRatio: string;
      resolution: string;
      duration: number | null;
      fps: number | null;
      count: number;
      seed: number | null;
      negativePrompt: string;
      referenceImages: ComposerImageRef[];
      providerOptions: Record<string, unknown>;
    };
  };
};

type WorkspaceRecord = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  lastComposer?: WorkspaceComposer;
  groups: VideoGroupRecord[];
};

type VideoRunRecord = {
  id: string;
  generationId: string;
  prompt: string;
  status: GenerationStatus;
  selectedModel: string;
  params: Record<string, any>;
  errorMessage?: string;
  warningMessage?: string;
  startedAt: number;
  completedAt?: number;
  createdAt: number;
  updatedAt: number;
};

type VideoAssetRecord = {
  id: string;
  assetId?: string;
  generationId: string;
  runId: string;
  filePath: string;
  mediaType: string;
  width?: number;
  height?: number;
  sortOrder: number;
  createdAt: number;
};

type VideoGroupRecord = {
  id: string;
  workspaceId: string;
  prompt: string;
  status: GenerationStatus;
  selectedModel: string;
  params: Record<string, any>;
  errorMessage?: string;
  warningMessage?: string;
  createdAt: number;
  updatedAt: number;
  runs: VideoRunRecord[];
  videos: VideoAssetRecord[];
};

const { t, locale } = useI18n();
const toast = useMyToast();
const { confirm } = useConfirm();
const settingsStore = useSettingsStore();
const route = useRoute();
const router = useRouter();
const PROMPT_CACHE_KEY = "video-workspace-prompt-cache-v1";

const workspaces = ref<WorkspaceRecord[]>([]);
const activeWorkspaceId = ref("");
const submitting = ref(false);
const loadingGroups = ref(false);
const referenceImageInputRef = ref<HTMLInputElement | null>(null);
const canvasScrollRef = ref<HTMLElement | null>(null);
const detailAsideRef = ref<HTMLElement | null>(null);
const isInputFocused = ref(false);
const sendShortcutMode = ref<"enter" | "cmd-enter">("enter");
const renamingWorkspaceId = ref("");
const renamingWorkspaceName = ref("");
const openMenuWorkspaceId = ref<string | null>(null);
const promptCacheByWorkspaceId = ref<Record<string, string>>({});
const detailModalOpen = ref(false);
const selectedGroupId = ref("");
const selectedVideoId = ref("");

const composer = reactive({
  modelKey: "",
  aspectRatio: "",
  resolution: "",
  duration: 5 as number | null,
  fps: null as number | null,
  count: 1,
  seed: null as number | null,
  negativePrompt: "",
  referenceImages: [] as ComposerImageRef[],
  providerOptions: {} as Record<string, unknown>,
  prompt: "",
});

const activeWorkspace = computed(() => workspaces.value.find((item) => item.id === activeWorkspaceId.value) || null);
const activeGroups = computed(() => activeWorkspace.value?.groups || []);
const selectedGroup = computed(() => activeGroups.value.find((item) => item.id === selectedGroupId.value) || null);
const selectedVideo = computed(() => selectedGroup.value?.videos.find((item) => item.id === selectedVideoId.value) || null);
const selectedRun = computed(() => {
  const group = selectedGroup.value;
  const video = selectedVideo.value;
  if (!group || !video) return null;
  return group.runs.find((item) => item.id === video.runId) || null;
});
const selectedVideoParams = computed(() => selectedRun.value?.params || selectedGroup.value?.params || null);
const selectedVideoPrompt = computed(() => selectedRun.value?.prompt || selectedGroup.value?.prompt || "");
const selectedVideoModel = computed(() => selectedRun.value?.selectedModel || selectedGroup.value?.selectedModel || "");
const selectedVideoStatus = computed<GenerationStatus>(() => selectedRun.value?.status || selectedGroup.value?.status || "queued");
const selectedVideoWarning = computed(() => selectedRun.value?.warningMessage || selectedGroup.value?.warningMessage || "");

const selectedModelOption = computed(() => {
  const [providerId, modelId] = String(composer.modelKey || "").split("::");
  if (!providerId || !modelId) return null;
  const provider = settingsStore.enabledProviders.find((item) => item.id === providerId);
  if (!provider) return null;
  const model = provider.models.find((item) => item.id === modelId);
  if (!model) return null;
  return { provider, model };
});

const selectedVideoCaps = computed(() => selectedModelOption.value?.model.video);
const selectedInputModalities = computed(() => selectedModelOption.value?.model.inputModalities || []);

const customParamSchema = computed<ProviderOptionFieldSchema[]>(() => {
  const list = selectedModelOption.value?.model.videoOptionSchema;
  if (!Array.isArray(list)) return [];
  return list.filter((item): item is ProviderOptionFieldSchema => !!item && typeof item.key === "string" && item.key.length > 0);
});
const sendShortcutOptions = computed(() => [
  { label: t("image.workspace.shortcut.enter"), value: "enter" },
  { label: t("image.workspace.shortcut.cmdEnter", { key: isMac() ? "⌘" : "Ctrl" }), value: "cmd-enter" },
]);

const supportsReferenceImages = computed(() => (
  selectedInputModalities.value.includes("image") || !!selectedVideoCaps.value?.referenceImages?.enabled
));
const referenceImageMax = computed(() => {
  if (!supportsReferenceImages.value) return 0;
  const max = selectedVideoCaps.value?.referenceImages?.max;
  if (typeof max === "number" && max > 0) return max;
  return 1;
});
const hasComposerAttachments = computed(() => composer.referenceImages.length > 0);
const composerAttachmentMenuItems = computed(() => [
  [
    {
      label: t("video.workspace.uploadReferenceImage"),
      icon: "i-lucide-image-plus",
      onSelect: openReferencePicker,
    },
  ],
]);

const showAspectRatioInput = computed(() => !!selectedVideoCaps.value?.aspectRatio?.enabled);
const showResolutionInput = computed(() => !!selectedVideoCaps.value?.resolution?.enabled);
const showDurationInput = computed(() => !!selectedVideoCaps.value?.duration?.enabled);
const showFpsInput = computed(() => !!selectedVideoCaps.value?.fps?.enabled);
const showCountInput = computed(() => !!selectedVideoCaps.value?.n?.enabled);
const showSeedInput = computed(() => !!selectedVideoCaps.value?.seed?.enabled);
const showNegativePromptInput = computed(() => !!selectedVideoCaps.value?.negativePrompt?.enabled);

const VIDEO_PREVIEW_MAX_WIDTH = 360;
const VIDEO_PREVIEW_MAX_HEIGHT = 360;
const VIDEO_PREVIEW_FALLBACK = { width: 320, height: 180 };

const aspectRatioItems = computed(() => (
  (selectedVideoCaps.value?.aspectRatio?.options || []).map((value) => ({ label: value, value }))
));
const resolutionItems = computed(() => (
  (selectedVideoCaps.value?.resolution?.options || []).map((value) => ({ label: value, value }))
));
const durationOptions = computed(() => normalizeNumericOptions(selectedVideoCaps.value?.duration?.options));
const durationItems = computed(() => durationOptions.value.map((value) => ({ label: String(value), value })));
const allowCustomResolution = computed(() => !!selectedVideoCaps.value?.allowCustomResolution);
const customResolutionHint = computed(() => {
  const hint = selectedVideoCaps.value?.customResolutionHint;
  if (!hint) return "";
  if (typeof hint === "string") return hint;
  if (locale.value.startsWith("zh") && hint.zhCn) return hint.zhCn;
  return hint.default || hint.zhCn || "";
});

const countRange = computed(() => ({
  min: selectedVideoCaps.value?.n?.min ?? 1,
  max: selectedVideoCaps.value?.n?.max ?? 4,
}));
const durationRange = computed(() => {
  if (durationOptions.value.length > 0) {
    return {
      min: durationOptions.value[0]!,
      max: durationOptions.value[durationOptions.value.length - 1]!,
    };
  }
  return {
    min: selectedVideoCaps.value?.duration?.min ?? 1,
    max: selectedVideoCaps.value?.duration?.max ?? 60,
  };
});
const fpsRange = computed(() => ({
  min: selectedVideoCaps.value?.fps?.min ?? 1,
  max: selectedVideoCaps.value?.fps?.max ?? 60,
}));
const seedRange = computed(() => ({
  min: selectedVideoCaps.value?.seed?.min ?? 0,
  max: selectedVideoCaps.value?.seed?.max ?? 2147483647,
}));

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}-${Date.now().toString(36)}`;
}

function clampInt(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function normalizeOptionalInt(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.floor(value);
  return null;
}

function normalizeNumericOptions(input: unknown): number[] {
  if (!Array.isArray(input)) return [];
  const values = input
    .map((item) => (typeof item === "number" && Number.isFinite(item) ? Math.floor(item) : NaN))
    .filter((item): item is number => Number.isFinite(item) && item > 0);
  return Array.from(new Set(values)).sort((a, b) => a - b);
}

function validateComposerDuration() {
  if (!showDurationInput.value) {
    return { ok: true as const, value: null as number | null };
  }

  const normalized = normalizeOptionalInt(composer.duration);
  if (normalized == null) {
    return { ok: true as const, value: null as number | null };
  }

  if (durationOptions.value.length > 0) {
    if (!durationOptions.value.includes(normalized)) {
      return {
        ok: false as const,
        message: t("video.workspace.warn.durationInvalidOption", { options: durationOptions.value.join(", ") }),
      };
    }
    return { ok: true as const, value: normalized };
  }

  if (normalized < durationRange.value.min || normalized > durationRange.value.max) {
    return {
      ok: false as const,
      message: t("video.workspace.warn.durationOutOfRange", { min: durationRange.value.min, max: durationRange.value.max }),
    };
  }

  return { ok: true as const, value: normalized };
}

function createDefaultWorkspaceTaskConfig() {
  return {
    modelKey: "",
    aspectRatio: "",
    resolution: "",
    duration: null as number | null,
    fps: null as number | null,
    count: 1,
    seed: null as number | null,
    negativePrompt: "",
    referenceImages: [] as ComposerImageRef[],
    providerOptions: {} as Record<string, unknown>,
  };
}

function serializeWorkspaceComposer(): WorkspaceComposer {
  return {
    activeTask: "generate",
    byTask: {
      generate: {
        modelKey: composer.modelKey,
        aspectRatio: composer.aspectRatio,
        resolution: composer.resolution,
        duration: normalizeOptionalInt(composer.duration),
        fps: normalizeOptionalInt(composer.fps),
        count: Math.max(1, Math.floor(Number(composer.count || 1))),
        seed: normalizeOptionalInt(composer.seed),
        negativePrompt: composer.negativePrompt,
        referenceImages: composer.referenceImages.map((item) => ({ id: item.id, name: item.name, url: item.url })),
        providerOptions: composer.providerOptions && typeof composer.providerOptions === "object"
          ? { ...composer.providerOptions }
          : {},
      },
    },
  };
}

function getNextWorkspaceName() {
  const nums = workspaces.value
    .map((item) => new RegExp(`^${t("video.workspace.namePrefix")}(\\d+)$`).exec(item.name)?.[1])
    .filter((value): value is string => !!value)
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
  const max = nums.length > 0 ? Math.max(...nums) : 0;
  return `${t("video.workspace.namePrefix")}${max + 1}`;
}

function getRouteWorkspaceId() {
  const raw = route.params.workspaceId;
  if (typeof raw === "string") return raw.trim();
  if (Array.isArray(raw) && typeof raw[0] === "string") return raw[0].trim();
  return "";
}

async function syncWorkspaceRoute(workspaceId: string) {
  if (!workspaceId || route.name !== "videos") return;
  if (getRouteWorkspaceId() === workspaceId) return;
  await router.replace({
    name: "videos",
    params: { workspaceId },
    query: route.query,
    hash: route.hash,
  });
}

function loadPromptCache() {
  try {
    const raw = localStorage.getItem(PROMPT_CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, string>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.entries(parsed).reduce<Record<string, string>>((acc, [workspaceId, value]) => {
      if (typeof workspaceId !== "string" || !workspaceId) return acc;
      if (typeof value !== "string") return acc;
      acc[workspaceId] = value;
      return acc;
    }, {});
  } catch {
    return {};
  }
}

function persistPromptCache() {
  try {
    localStorage.setItem(PROMPT_CACHE_KEY, JSON.stringify(promptCacheByWorkspaceId.value));
  } catch {
    // ignore
  }
}

let promptPersistTimer: ReturnType<typeof setTimeout> | null = null;
function schedulePersistPromptCache() {
  if (promptPersistTimer) clearTimeout(promptPersistTimer);
  promptPersistTimer = setTimeout(() => {
    promptPersistTimer = null;
    persistPromptCache();
  }, 220);
}

function updatePromptDraft(workspaceId: string, prompt: string) {
  if (!workspaceId) return;
  if (prompt.trim()) {
    promptCacheByWorkspaceId.value[workspaceId] = prompt;
    return;
  }
  delete promptCacheByWorkspaceId.value[workspaceId];
}

function getPromptDraft(workspaceId: string) {
  return promptCacheByWorkspaceId.value[workspaceId] || "";
}

function hasTranslation(key: string) {
  return t(key) !== key;
}

function resolveCustomFieldLabel(field: ProviderOptionFieldSchema) {
  const key = `video.workspace.customField.${field.key}.label`;
  if (hasTranslation(key)) return t(key);
  return field.label || field.key;
}

function resolveCustomFieldDescription(field: ProviderOptionFieldSchema) {
  const key = `video.workspace.customField.${field.key}.description`;
  if (hasTranslation(key)) return t(key);
  return field.description || "";
}

function resolveCustomFieldOptionLabel(
  field: ProviderOptionFieldSchema,
  option: { label: string; value: string | number | boolean }
) {
  const key = `video.workspace.customField.${field.key}.option.${String(option.value)}`;
  if (hasTranslation(key)) return t(key);
  return option.label;
}

function getPathValue(target: Record<string, unknown> | undefined, rawPath: string): unknown {
  if (!target) return undefined;
  const path = (rawPath || "").trim();
  if (!path) return undefined;
  if (Object.prototype.hasOwnProperty.call(target, path)) return target[path];
  const segments = path.split(".").map((item) => item.trim()).filter(Boolean);
  if (segments.length === 0) return undefined;
  let cursor: unknown = target;
  for (const segment of segments) {
    if (!cursor || typeof cursor !== "object" || Array.isArray(cursor) || !(segment in (cursor as Record<string, unknown>))) {
      return undefined;
    }
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  return cursor;
}

function setPathValue(target: Record<string, unknown>, rawPath: string, value: unknown) {
  const path = (rawPath || "").trim();
  if (!path) return;
  const segments = path.split(".").map((item) => item.trim()).filter(Boolean);
  if (segments.length === 0) return;
  let cursor: Record<string, unknown> = target;
  for (let idx = 0; idx < segments.length - 1; idx += 1) {
    const key = segments[idx];
    const current = cursor[key];
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      cursor[key] = {};
    }
    cursor = cursor[key] as Record<string, unknown>;
  }
  cursor[segments[segments.length - 1]] = value;
}

function parseFieldDefault(field: ProviderOptionFieldSchema): unknown {
  if (field.default === undefined) return undefined;
  if (field.type === "number") {
    const value = Number(field.default);
    return Number.isFinite(value) ? value : undefined;
  }
  if (field.type === "boolean") return !!field.default;
  if (field.type === "json") {
    if (typeof field.default === "string") {
      try {
        return JSON.parse(field.default);
      } catch {
        return undefined;
      }
    }
    return field.default;
  }
  return String(field.default);
}

function normalizeCustomParamValue(field: ProviderOptionFieldSchema, value: unknown): unknown {
  if (field.type === "number") {
    if (value === "" || value == null) return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  if (field.type === "boolean") {
    return !!value;
  }
  if (field.type === "json") {
    if (value == null || value === "") return undefined;
    if (typeof value === "string") {
      try {
        return JSON.parse(value);
      } catch {
        return undefined;
      }
    }
    return value;
  }
  if (value == null) return undefined;
  const text = String(value);
  return text.length > 0 ? text : undefined;
}

function syncComposerProviderOptionsBySchema() {
  const schema = customParamSchema.value;
  if (schema.length === 0) {
    if (!composer.providerOptions || typeof composer.providerOptions !== "object") {
      composer.providerOptions = {};
    }
    return;
  }

  const providerDefaults = selectedModelOption.value?.provider?.providerOptionsDefaults || {};
  const modelDefaults = selectedModelOption.value?.model?.providerOptionsDefaults || {};
  const current = composer.providerOptions || {};
  const next: Record<string, unknown> = {};

  for (const field of schema) {
    const key = field.key;
    const currentValue = normalizeCustomParamValue(field, getPathValue(current, key));
    if (currentValue !== undefined) {
      next[key] = currentValue;
      continue;
    }

    const mergedDefault = getPathValue(modelDefaults, key) ?? getPathValue(providerDefaults, key) ?? parseFieldDefault(field);
    const normalizedDefault = normalizeCustomParamValue(field, mergedDefault);
    if (normalizedDefault !== undefined) {
      next[key] = normalizedDefault;
    }
  }

  composer.providerOptions = next;
}

function buildProviderOptionsForRequest() {
  const schema = customParamSchema.value;
  if (schema.length === 0) {
    const fallback = composer.providerOptions && typeof composer.providerOptions === "object"
      ? { ...composer.providerOptions }
      : {};
    return Object.keys(fallback).length > 0 ? fallback : undefined;
  }

  const next: Record<string, unknown> = {};
  for (const field of schema) {
    const raw = getPathValue(composer.providerOptions, field.key);
    if (raw === undefined || raw === null || raw === "") continue;

    if (field.type === "json" && typeof raw === "string") {
      try {
        setPathValue(next, field.key, JSON.parse(raw));
      } catch {
        throw new Error(t("video.workspace.warn.invalidProviderOptions"));
      }
      continue;
    }

    setPathValue(next, field.key, raw);
  }

  return Object.keys(next).length > 0 ? next : undefined;
}

function resolveDefaultVideoModelKey() {
  const fallback = settingsStore.defaultModels?.videoGenerate;
  if (fallback?.providerId && fallback?.modelId) {
    const provider = settingsStore.enabledProviders.find((item) => item.id === fallback.providerId);
    const model = provider?.models.find((item) => item.id === fallback.modelId);
    if (model?.modelType === "generative" && model.outputModalities?.includes("video")) {
      return `${fallback.providerId}::${fallback.modelId}`;
    }
  }

  for (const provider of settingsStore.enabledProviders) {
    const model = provider.models.find((item) => (
      item.modelType === "generative" && Array.isArray(item.outputModalities) && item.outputModalities.includes("video")
    ));
    if (model) return `${provider.id}::${model.id}`;
  }
  return "";
}

function toVideoSrc(video: VideoAssetRecord) {
  const assetId = (video.assetId || "").trim();
  if (assetId) return `asset://${assetId}`;
  const filePath = (video.filePath || "").trim();
  if (/^(https?:\/\/|data:|file:\/\/|asset:\/\/)/i.test(filePath)) return filePath;
  return `file://${encodeURI(filePath)}`;
}

function statusLabel(status: GenerationStatus | undefined) {
  if (status === "queued") return t("video.workspace.status.queued");
  if (status === "running") return t("video.workspace.status.running");
  if (status === "succeeded") return t("video.workspace.status.succeeded");
  if (status === "failed") return t("video.workspace.status.failed");
  if (status === "cancelled") return t("video.workspace.status.cancelled");
  return "-";
}

function resolveSelectedModelLabel(selectedModel: string) {
  if (!selectedModel) return "-";
  const [providerId, modelId] = selectedModel.split("::");
  if (!providerId || !modelId) return selectedModel;
  const provider = settingsStore.enabledProviders.find((item) => item.id === providerId);
  if (!provider) return selectedModel;
  return `${provider.name} / ${modelId}`;
}

function formatDateTime(ts?: number) {
  if (!ts) return "-";
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return "-";
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
}

function formatDuration(ms: number) {
  if (!Number.isFinite(ms) || ms < 0) return "-";
  if (ms < 1000) return `${Math.floor(ms)}ms`;
  const sec = ms / 1000;
  if (sec < 60) return `${sec.toFixed(1)}s`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}m ${s}s`;
}

const selectedRunStartedAtText = computed(() => formatDateTime(selectedRun.value?.startedAt || selectedRun.value?.createdAt));
const selectedRunCompletedAtText = computed(() => formatDateTime(selectedRun.value?.completedAt));
const selectedRunDurationText = computed(() => {
  const started = selectedRun.value?.startedAt || selectedRun.value?.createdAt;
  const completed = selectedRun.value?.completedAt;
  if (!started || !completed || completed < started) return "-";
  return formatDuration(completed - started);
});
const selectedVideoCreatedAtText = computed(() => formatDateTime(selectedVideo.value?.createdAt));

function parseAspectRatioText(input?: string): { width: number; height: number } | null {
  if (!input) return null;
  const matched = input.trim().match(/^(\d+)\s*[:x*X]\s*(\d+)$/);
  if (!matched) return null;
  const width = Number(matched[1]);
  const height = Number(matched[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  return { width, height };
}

function fitBoxByAspect(
  width: number,
  height: number,
  maxWidth = VIDEO_PREVIEW_MAX_WIDTH,
  maxHeight = VIDEO_PREVIEW_MAX_HEIGHT
) {
  const scale = Math.min(maxWidth / width, maxHeight / height, 1);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function inferRunRatio(run: VideoRunRecord) {
  const fromResolution = parseAspectRatioText(run.params?.resolution);
  if (fromResolution) return fromResolution;
  const fromAspect = parseAspectRatioText(run.params?.aspectRatio);
  if (fromAspect) return fromAspect;
  return null;
}

function videoBoxStyle(video: VideoAssetRecord, run?: VideoRunRecord) {
  const width = Number(video.width);
  const height = Number(video.height);
  if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
    const box = fitBoxByAspect(width, height);
    return { width: `${box.width}px`, height: `${box.height}px` };
  }
  const ratio = run ? inferRunRatio(run) : null;
  if (ratio) {
    const box = fitBoxByAspect(ratio.width, ratio.height);
    return { width: `${box.width}px`, height: `${box.height}px` };
  }
  return { width: `${VIDEO_PREVIEW_FALLBACK.width}px`, height: `${VIDEO_PREVIEW_FALLBACK.height}px` };
}

function runPlaceholderStyle(run: VideoRunRecord) {
  const ratio = inferRunRatio(run);
  if (ratio) {
    const box = fitBoxByAspect(ratio.width, ratio.height);
    return { width: `${box.width}px`, height: `${box.height}px` };
  }
  return { width: `${VIDEO_PREVIEW_FALLBACK.width}px`, height: `${VIDEO_PREVIEW_FALLBACK.height}px` };
}

function formatWorkspaceUpdatedAt(ts?: number) {
  if (!ts) return "";
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return "";
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function workspaceSecondaryLine(workspace: WorkspaceRecord) {
  const groupCount = workspace.groups.length;
  const videoCount = workspace.groups.reduce((total, group) => total + group.videos.length, 0);
  if (groupCount === 0) return t("video.workspace.empty");
  return t("video.workspace.summary", { groups: groupCount, videos: videoCount });
}

function videosByRun(group: VideoGroupRecord, run: VideoRunRecord) {
  return (group.videos || []).filter((item) => item.runId === run.id);
}

function openVideoDetail(group: VideoGroupRecord, videoId: string) {
  selectedGroupId.value = group.id;
  selectedVideoId.value = videoId;
  detailModalOpen.value = true;
}

function clearVideoDetail() {
  detailModalOpen.value = false;
  selectedGroupId.value = "";
  selectedVideoId.value = "";
}

async function downloadVideo(video: VideoAssetRecord) {
  const filePath = String(video.filePath || "").trim();
  if (!filePath) {
    toast.warn(t("video.workspace.warn.downloadFailed"));
    return;
  }
  const result = await window.ipc("videoAsset:download", {
    filePath,
    name: selectedVideoPrompt.value || t("content.untitled"),
  }) as { ok: boolean; canceled?: boolean; error?: string };
  if (!result?.ok && !result?.canceled) {
    toast.warn(result?.error || t("video.workspace.warn.downloadFailed"));
  }
}

function reuseVideoGroup(group: VideoGroupRecord, run: VideoRunRecord | null = null) {
  const reuseState = buildVideoReuseComposerState(
    {
      ...group,
      runs: run ? [run] : group.runs,
    },
    uid,
    countRange.value
  );

  composer.prompt = reuseState.prompt;
  composer.modelKey = reuseState.modelKey || composer.modelKey;
  composer.aspectRatio = reuseState.aspectRatio;
  composer.resolution = reuseState.resolution;
  composer.duration = normalizeOptionalInt(reuseState.duration);
  composer.fps = normalizeOptionalInt(reuseState.fps);
  composer.count = clampInt(Number(reuseState.count || 1), countRange.value.min, countRange.value.max);
  composer.seed = normalizeOptionalInt(reuseState.seed);
  composer.negativePrompt = reuseState.negativePrompt;
  composer.referenceImages = [...reuseState.referenceImages];
  composer.providerOptions = { ...reuseState.providerOptions };
}

onClickOutside(
  detailAsideRef,
  (event) => {
    if (!detailModalOpen.value) return;
    const middle = canvasScrollRef.value;
    if (middle && middle.contains(event.target as Node)) clearVideoDetail();
  },
  { ignore: ["[data-video-thumb]"] }
);

function startRenameWorkspace(workspaceId: string, name: string) {
  renamingWorkspaceId.value = workspaceId;
  renamingWorkspaceName.value = name;
  openMenuWorkspaceId.value = null;
}

function cancelRenameWorkspace() {
  renamingWorkspaceId.value = "";
  renamingWorkspaceName.value = "";
}

async function saveWorkspaceName(workspaceId: string) {
  const nextName = renamingWorkspaceName.value.trim();
  if (!nextName) {
    cancelRenameWorkspace();
    return;
  }
  await window.ipc("videoWorkspace:rename", { workspaceId, name: nextName });
  workspaces.value = workspaces.value.map((item) => (
    item.id === workspaceId ? { ...item, name: nextName, updatedAt: Date.now() } : item
  ));
  cancelRenameWorkspace();
}

function getWorkspaceMenuItems(workspaceId: string) {
  return [
    [
      {
        label: t("chat.sessionList.menu.editTitle"),
        icon: "i-lucide-pencil",
        onSelect: () => {
          const workspace = workspaces.value.find((item) => item.id === workspaceId);
          if (!workspace) return;
          startRenameWorkspace(workspace.id, workspace.name);
        },
      },
    ],
    [
      {
        label: t("common.delete"),
        icon: "i-lucide-trash-2",
        color: "error" as const,
        disabled: workspaces.value.length <= 1,
        onSelect: () => removeWorkspace(workspaceId),
      },
    ],
  ];
}

function setWorkspaceMenuOpen(workspaceId: string, open: boolean) {
  if (open) {
    openMenuWorkspaceId.value = workspaceId;
    return;
  }
  if (openMenuWorkspaceId.value === workspaceId) openMenuWorkspaceId.value = null;
}

async function loadGroups(workspaceId: string) {
  if (!workspaceId) return;
  loadingGroups.value = true;
  try {
    const groups = await window.ipc("videoGeneration:listByWorkspace", { workspaceId }) as VideoGroupRecord[];
    const normalized = Array.isArray(groups) ? groups : [];
    workspaces.value = replaceWorkspaceGroups(workspaces.value, workspaceId, normalized) as WorkspaceRecord[];
    const nextSelection = reconcileVideoDetailSelection(normalized, selectedGroupId.value, selectedVideoId.value);
    if (nextSelection.shouldClearDetail) {
      clearVideoDetail();
    }
  } catch {
    workspaces.value = replaceWorkspaceGroups(workspaces.value, workspaceId, []) as WorkspaceRecord[];
    clearVideoDetail();
  } finally {
    loadingGroups.value = false;
  }
}

function applyWorkspaceComposer(workspace: WorkspaceRecord | null) {
  const draft = workspace?.lastComposer?.byTask?.generate;
  const fallback = createDefaultWorkspaceTaskConfig();

  composer.modelKey = typeof draft?.modelKey === "string" ? draft.modelKey : fallback.modelKey;
  composer.aspectRatio = typeof draft?.aspectRatio === "string" ? draft.aspectRatio : fallback.aspectRatio;
  composer.resolution = typeof draft?.resolution === "string" ? draft.resolution : fallback.resolution;
  composer.duration = normalizeOptionalInt(draft?.duration);
  composer.fps = normalizeOptionalInt(draft?.fps);
  composer.count = typeof draft?.count === "number" && Number.isFinite(draft.count) ? Math.max(1, Math.floor(draft.count)) : fallback.count;
  composer.seed = normalizeOptionalInt(draft?.seed);
  composer.negativePrompt = typeof draft?.negativePrompt === "string" ? draft.negativePrompt : fallback.negativePrompt;
  composer.referenceImages = Array.isArray(draft?.referenceImages)
    ? draft.referenceImages.filter((item): item is ComposerImageRef => !!item && typeof item.url === "string" && item.url.trim().length > 0)
    : [];
  composer.providerOptions = draft?.providerOptions && typeof draft.providerOptions === "object" && !Array.isArray(draft.providerOptions)
    ? { ...draft.providerOptions }
    : {};
}

async function loadWorkspaces() {
  let list: Array<Omit<WorkspaceRecord, "groups">> = [];
  try {
    list = await window.ipc("videoWorkspace:list") as Array<Omit<WorkspaceRecord, "groups">>;
  } catch {
    list = [];
  }
  const normalized = normalizeVideoWorkspaceRows(
    Array.isArray(list) ? list : [],
    `${t("video.workspace.namePrefix")}1`,
    Date.now()
  ) as WorkspaceRecord[];

  if (normalized.length === 0) {
    const created = await window.ipc("videoWorkspace:create", {
      name: getNextWorkspaceName(),
      lastComposer: serializeWorkspaceComposer(),
    }) as Omit<WorkspaceRecord, "groups">;
    workspaces.value = [{ ...created, groups: [] }];
  } else {
    workspaces.value = normalized;
    for (const workspace of normalized) {
      await loadGroups(workspace.id);
    }
  }

  activeWorkspaceId.value = resolveVideoWorkspaceSelection(
    workspaces.value,
    getRouteWorkspaceId(),
    activeWorkspaceId.value
  );

  applyWorkspaceComposer(activeWorkspace.value);
  if (!composer.modelKey) {
    composer.modelKey = resolveDefaultVideoModelKey();
  }
  composer.prompt = activeWorkspaceId.value ? getPromptDraft(activeWorkspaceId.value) : "";
  if (activeWorkspaceId.value) void syncWorkspaceRoute(activeWorkspaceId.value);
}

async function ensureWorkspaceReady() {
  if (activeWorkspaceId.value && workspaces.value.some((item) => item.id === activeWorkspaceId.value)) {
    return true;
  }
  try {
    await loadWorkspaces();
  } catch {
    return false;
  }
  return !!activeWorkspace.value;
}

async function selectWorkspace(workspaceId: string) {
  if (!workspaceId) return;
  if (activeWorkspaceId.value && activeWorkspaceId.value !== workspaceId) {
    updatePromptDraft(activeWorkspaceId.value, composer.prompt);
    persistPromptCache();
  }
  clearVideoDetail();
  activeWorkspaceId.value = workspaceId;
  applyWorkspaceComposer(activeWorkspace.value);
  if (!composer.modelKey) {
    composer.modelKey = resolveDefaultVideoModelKey();
  }
  composer.prompt = getPromptDraft(workspaceId);
  await loadGroups(workspaceId);
}

async function createWorkspace() {
  if (activeWorkspaceId.value) {
    updatePromptDraft(activeWorkspaceId.value, composer.prompt);
    persistPromptCache();
  }
  clearVideoDetail();
  const created = await window.ipc("videoWorkspace:create", {
    name: getNextWorkspaceName(),
    lastComposer: serializeWorkspaceComposer(),
  }) as Omit<WorkspaceRecord, "groups">;
  workspaces.value = [{ ...created, groups: [] }, ...workspaces.value];
  activeWorkspaceId.value = created.id;
  applyWorkspaceComposer(activeWorkspace.value);
  if (!composer.modelKey) {
    composer.modelKey = resolveDefaultVideoModelKey();
  }
  composer.prompt = "";
}

async function removeWorkspace(workspaceId: string) {
  if (workspaces.value.length <= 1) return;
  const workspace = workspaces.value.find((item) => item.id === workspaceId);
  if (!workspace) return;
  const wasActiveWorkspace = activeWorkspaceId.value === workspaceId;
  const confirmed = await confirm({
    title: t("video.workspace.delete"),
    content: t("video.workspace.deleteWorkspaceConfirm", { name: workspace.name }),
    confirmText: t("common.delete"),
    confirmColor: "error",
  });
  if (!confirmed) return;
  clearVideoDetail();
  await window.ipc("videoWorkspace:delete", { workspaceId });
  const nextState = removeVideoWorkspaceFromState(workspaces.value, workspaceId, activeWorkspaceId.value);
  workspaces.value = nextState.workspaces as WorkspaceRecord[];
  delete promptCacheByWorkspaceId.value[workspaceId];
  persistPromptCache();
  if (renamingWorkspaceId.value === workspaceId) {
    cancelRenameWorkspace();
  }
  activeWorkspaceId.value = nextState.activeWorkspaceId;
  if (wasActiveWorkspace) {
    if (activeWorkspaceId.value) {
      applyWorkspaceComposer(activeWorkspace.value);
      if (!composer.modelKey) {
        composer.modelKey = resolveDefaultVideoModelKey();
      }
      composer.prompt = getPromptDraft(activeWorkspaceId.value);
      await loadGroups(activeWorkspaceId.value);
    } else {
      composer.prompt = "";
    }
  }
}

async function deleteGroup(group: VideoGroupRecord) {
  const confirmed = window.confirm(t("video.workspace.deleteConfirm"));
  if (!confirmed) return;
  const result = await window.ipc("videoGeneration:delete", { generationId: group.id }) as { ok: boolean; error?: string };
  if (!result?.ok) {
    toast.warn(result?.error || t("video.workspace.warn.deleteFailed"));
  }
  await loadGroups(activeWorkspaceId.value);
}

async function retryRun(group: VideoGroupRecord, run: VideoRunRecord) {
  if (!run) return;
  const retryInput = buildVideoRetryRunInput(activeWorkspaceId.value, group, run);
  if (!retryInput) return;
  try {
    await window.ipc("videoGeneration:run", retryInput);
  } catch (error) {
    toast.warn(error instanceof Error ? error.message : String(error));
  }
  await loadGroups(activeWorkspaceId.value);
}

async function retrySelectedRun() {
  if (!selectedGroup.value || !selectedRun.value) return;
  await retryRun(selectedGroup.value, selectedRun.value);
}

async function removeVideo(group: VideoGroupRecord, video: VideoAssetRecord) {
  if (!group || !video) return;
  const removalAction = resolveVideoRemovalAction(group.status, (group.videos || []).length);
  if (removalAction === "noop") return;

  const confirmed = await confirm({
    title: t("video.workspace.delete"),
    content: t("video.workspace.deleteConfirm"),
    confirmText: t("common.delete"),
    confirmColor: "error",
  });
  if (!confirmed) return;

  if (removalAction === "delete-group") {
    await deleteGroup(group);
    return;
  }

  const result = await window.ipc("videoAsset:delete", { linkId: video.id }) as { ok: boolean; error?: string };
  if (!result?.ok) {
    toast.warn(result?.error || t("video.workspace.warn.deleteFailed"));
    return;
  }
  await loadGroups(activeWorkspaceId.value);
}

async function removeSelectedVideo() {
  if (!selectedGroup.value || !selectedVideo.value) return;
  await removeVideo(selectedGroup.value, selectedVideo.value);
}

async function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("read file failed"));
    reader.readAsDataURL(file);
  });
}

function openReferencePicker() {
  referenceImageInputRef.value?.click();
}

async function handleReferenceImageUpload(event: Event) {
  if (!supportsReferenceImages.value) return;
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files || []);
  input.value = "";
  if (files.length === 0) return;

  const remain = Math.max(0, referenceImageMax.value - composer.referenceImages.length);
  if (remain <= 0) {
    toast.warn(t("video.workspace.warn.maxUploadImages", { count: referenceImageMax.value }));
    return;
  }

  const selected = files.slice(0, remain);
  if (selected.length < files.length) {
    toast.warn(t("video.workspace.warn.keepFirstImages", { count: selected.length }));
  }

  const appended: ComposerImageRef[] = [];
  for (const file of selected) {
    try {
      const url = await readFileAsDataUrl(file);
      if (!url) continue;
      appended.push({ id: uid("ref"), name: file.name, url });
    } catch {
      // ignore individual file read failures
    }
  }
  composer.referenceImages = [...composer.referenceImages, ...appended].slice(0, referenceImageMax.value);
}

function removeReferenceImage(index: number) {
  composer.referenceImages = composer.referenceImages.filter((_, idx) => idx !== index);
}

function handlePromptKeydown(event: KeyboardEvent) {
  if (event.key !== "Enter") return;

  if (sendShortcutMode.value === "enter") {
    if (!event.shiftKey && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      submitGeneration();
    }
    return;
  }

  if (event.ctrlKey || event.metaKey) {
    event.preventDefault();
    submitGeneration();
  }
}

async function handleShortcutChange(mode: string) {
  await window.ipc("settings:setSendShortcut", { mode });
}

async function submitGeneration() {
  if (submitting.value || loadingGroups.value) return;
  const workspace = activeWorkspace.value;
  if (!workspace) {
    toast.warn(t("video.workspace.warn.workspaceUnavailable"));
    return;
  }
  if (!composer.prompt.trim()) {
    toast.warn(t("video.workspace.warn.enterPrompt"));
    return;
  }
  const prompt = composer.prompt;
  if (!composer.modelKey) {
    const fallback = resolveDefaultVideoModelKey();
    if (!fallback) {
      toast.warn(t("video.workspace.warn.selectModelFirst"));
      return;
    }
    composer.modelKey = fallback;
  }
  if (!selectedModelOption.value || !selectedModelOption.value.model.outputModalities?.includes("video")) {
    toast.warn(t("video.workspace.warn.modelUnavailable"));
    return;
  }

  let providerOptions: Record<string, unknown> | undefined;
  try {
    providerOptions = buildProviderOptionsForRequest();
  } catch (error) {
    toast.warn(error instanceof Error ? error.message : t("video.workspace.warn.invalidProviderOptions"));
    return;
  }
  const durationCheck = validateComposerDuration();
  if (!durationCheck.ok) {
    toast.warn(durationCheck.message);
    return;
  }
  composer.duration = durationCheck.value;

  const params = {
    modelKey: composer.modelKey,
    aspectRatio: showAspectRatioInput.value ? String(composer.aspectRatio || "").trim() : "",
    resolution: showResolutionInput.value ? String(composer.resolution || "").trim() : "",
    duration: durationCheck.value,
    fps: showFpsInput.value ? normalizeOptionalInt(composer.fps) : null,
    count: showCountInput.value
      ? clampInt(Number(composer.count || 1), countRange.value.min, countRange.value.max)
      : 1,
    seed: showSeedInput.value ? normalizeOptionalInt(composer.seed) : null,
    negativePrompt: showNegativePromptInput.value ? String(composer.negativePrompt || "").trim() : "",
    referenceImages: supportsReferenceImages.value
      ? composer.referenceImages.slice(0, referenceImageMax.value).map((item) => ({ id: item.id, name: item.name, url: item.url }))
      : [],
    providerOptions,
  };

  const created = await window.ipc("videoGeneration:create", {
    workspaceId: workspace.id,
    prompt,
    status: "queued",
    selectedModel: composer.modelKey,
    params,
  }) as { id: string };
  composer.prompt = "";
  updatePromptDraft(workspace.id, "");
  persistPromptCache();

  await loadGroups(workspace.id);
  await nextTick();

  submitting.value = true;
  try {
    await window.ipc("videoGeneration:run", {
      workspaceId: workspace.id,
      generationId: created.id,
      selectedModel: composer.modelKey,
      prompt,
      params,
    });
  } catch (error) {
    toast.warn(error instanceof Error ? error.message : String(error));
  } finally {
    submitting.value = false;
    await loadGroups(workspace.id);
  }
}

watch(
  () => activeWorkspaceId.value,
  (workspaceId) => {
    if (!workspaceId) return;
    void syncWorkspaceRoute(workspaceId);
  }
);

watch(
  () => route.params.workspaceId,
  async () => {
    if (route.name !== "videos") return;
    const routeWorkspaceId = getRouteWorkspaceId();
    if (!routeWorkspaceId) {
      if (activeWorkspaceId.value) await syncWorkspaceRoute(activeWorkspaceId.value);
      return;
    }
    if (routeWorkspaceId === activeWorkspaceId.value) return;
    if (workspaces.value.some((item) => item.id === routeWorkspaceId)) {
      await selectWorkspace(routeWorkspaceId);
      return;
    }
    if (activeWorkspaceId.value) await syncWorkspaceRoute(activeWorkspaceId.value);
  },
  { immediate: true }
);

watch(
  () => [supportsReferenceImages.value, referenceImageMax.value],
  () => {
    if (!supportsReferenceImages.value) {
      composer.referenceImages = [];
      return;
    }
    if (composer.referenceImages.length > referenceImageMax.value) {
      composer.referenceImages = composer.referenceImages.slice(0, referenceImageMax.value);
    }
  },
  { immediate: true }
);

watch(
  () => selectedVideoCaps.value,
  (caps) => {
    if (!caps) return;

    if (caps.aspectRatio?.enabled && caps.aspectRatio.default && !composer.aspectRatio) {
      composer.aspectRatio = caps.aspectRatio.default;
    }
    if (caps.resolution?.enabled && caps.resolution.default && !composer.resolution) {
      composer.resolution = caps.resolution.default;
    }
    if (caps.duration?.enabled) {
      const next = normalizeOptionalInt(composer.duration);
      const options = normalizeNumericOptions(caps.duration.options);
      if (options.length > 0) {
        const preferred = typeof caps.duration.default === "number" ? Math.floor(caps.duration.default) : null;
        const fallback = preferred !== null && options.includes(preferred) ? preferred : options[0]!;
        composer.duration = next !== null && options.includes(next) ? next : fallback;
      } else {
        const fallback = typeof caps.duration.default === "number" ? Math.floor(caps.duration.default) : durationRange.value.min;
        composer.duration = clampInt(next ?? fallback, durationRange.value.min, durationRange.value.max);
      }
    }
    if (caps.fps?.enabled) {
      const next = normalizeOptionalInt(composer.fps);
      const fallback = typeof caps.fps.default === "number" ? Math.floor(caps.fps.default) : fpsRange.value.min;
      composer.fps = clampInt(next ?? fallback, fpsRange.value.min, fpsRange.value.max);
    }
    if (caps.n?.enabled) {
      const next = clampInt(Number(composer.count || caps.n.default || 1), countRange.value.min, countRange.value.max);
      composer.count = next;
    } else {
      composer.count = 1;
    }
  },
  { immediate: true }
);

watch(
  () => [selectedModelOption.value?.provider?.id, selectedModelOption.value?.model?.id, customParamSchema.value],
  () => {
    syncComposerProviderOptionsBySchema();
  },
  { deep: true, immediate: true }
);

let persistTimer: ReturnType<typeof setTimeout> | null = null;
watch(
  () => ({
    workspaceId: activeWorkspaceId.value,
    modelKey: composer.modelKey,
    aspectRatio: composer.aspectRatio,
    resolution: composer.resolution,
    duration: composer.duration,
    fps: composer.fps,
    count: composer.count,
    seed: composer.seed,
    negativePrompt: composer.negativePrompt,
    referenceImages: composer.referenceImages,
    providerOptions: composer.providerOptions,
  }),
  () => {
    if (!activeWorkspaceId.value) return;
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(async () => {
      await window.ipc("videoWorkspace:updateLastComposer", {
        workspaceId: activeWorkspaceId.value,
        lastComposer: serializeWorkspaceComposer(),
      });
    }, 350);
  },
  { deep: true }
);

watch(
  () => composer.prompt,
  () => {
    const workspaceId = activeWorkspaceId.value;
    if (!workspaceId) return;
    updatePromptDraft(workspaceId, composer.prompt);
    schedulePersistPromptCache();
  }
);

watch(
  () => [settingsStore.enabledProviders, settingsStore.defaultModels?.videoGenerate, composer.modelKey],
  () => {
    const modelStillValid = (() => {
      if (!composer.modelKey) return false;
      const [providerId, modelId] = composer.modelKey.split("::");
      const provider = settingsStore.enabledProviders.find((item) => item.id === providerId);
      const model = provider?.models.find((item) => item.id === modelId);
      return !!model && model.modelType === "generative" && model.outputModalities?.includes("video");
    })();

    if (modelStillValid) return;
    composer.modelKey = resolveDefaultVideoModelKey();
  },
  { immediate: true, deep: true }
);

onMounted(async () => {
  promptCacheByWorkspaceId.value = loadPromptCache();
  if (!settingsStore.isInitialized) {
    try {
      await settingsStore.initialize();
    } catch {
      // allow workspace bootstrap to continue even if settings init fails
    }
  }
  try {
    const mode = await window.ipc("settings:getSendShortcut");
    if (mode === "enter" || mode === "cmd-enter") {
      sendShortcutMode.value = mode;
    }
  } catch {
    // keep default send shortcut
  }
  const ready = await ensureWorkspaceReady();
  if (!ready) {
    toast.warn(t("video.workspace.warn.workspaceUnavailable"));
  }
});

onBeforeUnmount(() => {
  if (persistTimer) clearTimeout(persistTimer);
  if (promptPersistTimer) clearTimeout(promptPersistTimer);
  if (activeWorkspaceId.value) {
    updatePromptDraft(activeWorkspaceId.value, composer.prompt);
    persistPromptCache();
  }
});
</script>
