<template>
  <div class="h-full flex gap-0 relative">
    <section
      :style="workspaceSidebarWidthStyle"
      class="relative shrink-0 h-full"
    >
      <div class="h-full bg-default rounded-xl overflow-hidden flex flex-col">
        <div class="px-2 pt-3 pb-2">
          <div class="mb-3 text-sm font-medium text-toned flex items-center">
            <span class="ml-3 select-none whitespace-nowrap">{{ t('image.workspace.sidebar') }}</span>
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
          @select="(item) => handleSelectWorkspace(item.id)"
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
            <span class="whitespace-nowrap">{{ t('image.workspace.newWorkspace') }}</span>
          </UButton>
        </div>
      </div>

      <PanelResizeHandle
        variant="gap"
        :active="workspaceSidebarResize.isDragging.value"
        :value="workspaceSidebarResize.width.value"
        :min="workspaceSidebarResize.minWidth.value"
        :max="workspaceSidebarResize.maxWidth.value"
        :cursor="workspaceSidebarResize.cursor.value"
        @resize-start="workspaceSidebarResize.startResize"
        @resize-by="workspaceSidebarResize.resizeBy"
        @reset="workspaceSidebarResize.resetWidth"
      />
    </section>

    <div class="flex-1 min-w-0 ml-[6px] flex gap-[6px]">
      <section class="min-w-0 h-full overflow-hidden flex-1 flex flex-col relative rounded-xl">
        <div
          ref="canvasScrollRef"
          :class="[
            'flex-1 min-h-0 overflow-y-auto bg-elevated px-4 py-4'
          ]"
          :style="canvasScrollStyle"
        >
          <div v-if="!activeWorkspace || activeWorkspace.groups.length === 0" class="h-full flex items-center justify-center">
            <UEmpty
              icon="i-lucide-image-up"
              :title="t('image.workspace.empty')"
              variant="naked"
            />
          </div>

          <div v-else class="space-y-3">
            <article
              v-for="group in activeWorkspace.groups"
              :key="group.id"
              class="px-1 py-1"
            >
              <div class="flex items-start gap-4 overflow-x-auto pb-1">
                <div
                  v-for="run in (group.runs || [])"
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
                      {{ t('image.workspace.retry') }}
                    </UButton>
                  </div>

                  <div class="flex items-start gap-0 min-w-max">
                      <div
                        v-for="(image, index) in imagesByRun(group, run)"
                        :key="image.id"
                        data-image-thumb
                        class="group relative shrink-0 transition-all p-0 border-2 rounded-xl"
                        :class="selectedImageId === image.id ? 'border-inverted' : 'border-transparent hover:border-default'"
                        :style="imageBoxStyle(image)"
                        @click="selectImage(group, image.id)"
                      >
                        <UImage
                          :src="resolveImageDisplaySrc(image)"
                          :alt="t('chat.quote.imageAlt', { index: index + 1 })"
                          :preview="false"
                          class="block w-full h-full rounded-xl border border-default"
                        />
                        <div class="absolute left-1.5 top-1.5 text-[10px] rounded bg-black/55 text-white px-1.5 py-0.5">#{{ index + 1 }}</div>
                        <div class="absolute right-1.5 bottom-1.5 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <UTooltip :text="t('image.workspace.viewLarge')">
                            <UButton
                              icon="i-lucide-eye"
                              size="xs"
                              color="neutral"
                              variant="solid"
                              square
                              class="rounded-md bg-black/60 hover:bg-black/70 text-white"
                              @click.stop="openImagePreview(image)"
                            />
                          </UTooltip>
                          <UTooltip :text="t('image.workspace.download')">
                            <UButton
                              icon="i-lucide-download"
                              size="xs"
                              color="neutral"
                              variant="solid"
                              square
                              class="rounded-md bg-black/60 hover:bg-black/70 text-white"
                              @click.stop="downloadImage(image)"
                            />
                          </UTooltip>
                        </div>
                      </div>

                    <div
                      v-for="slot in runPlaceholderSlots(group, run)"
                      :key="`${run.id}-slot-${slot}`"
                      class="group shrink-0 rounded-lg border border-default bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center relative"
                      :style="runPlaceholderStyle(run)"
                    >
                      <div v-if="run.status === 'running' || run.status === 'queued'" class="size-16 rounded-full border-2 border-default border-t-gray-500 animate-spin" />
                      <div v-else-if="run.status === 'failed'" class="flex flex-col items-center gap-1 text-red-500">
                        <UIcon name="i-lucide-triangle-alert" class="size-6" />
                        <UPopover mode="hover" :content="{ side: 'top', align: 'center', sideOffset: 8 }">
                          <UButton size="xs" variant="ghost" color="error">{{ t('image.workspace.viewError') }}</UButton>
                          <template #content>
                            <div class="max-w-sm p-3 text-xs text-red-700 whitespace-pre-wrap break-all">
                              {{ run.errorMessage || t('image.workspace.runFailed') }}
                            </div>
                          </template>
                        </UPopover>
                      </div>
                      <div v-else-if="run.status === 'cancelled'" class="text-xs text-amber-700">{{ t('chat.store.aborted') }}</div>
                    </div>
                  </div>
                </div>
              </div>
            </article>
          </div>
        </div>
      </section>

      <aside
        v-if="activeWorkspace"
        :style="operationPanelWidthStyle"
        class="relative shrink-0 h-full"
      >
        <div class="h-full bg-default rounded-xl border border-default overflow-hidden flex flex-col">
          <div class="flex-1 min-h-0 overflow-y-auto p-3 space-y-3 bg-default">
            <UTabs
              v-model="activeTask"
              :items="taskTabItems"
              variant="pill"
              color="neutral"
              size="sm"
              :content="false"
              class="w-full"
            />

            <UFormField :label="t('image.workspace.form.model')">
              <ModelSelector
                v-model="composer.modelKey"
                placement="bottom"
                align="end"
                model-type="image-gen"
                :image-intent="activeTask"
                :show-default="true"
                :ghost="false"
                class="w-full"
              />
            </UFormField>

            <UFormField v-if="showAspectRatioInput" :label="t('image.workspace.form.aspectRatio')">
              <template #label>
                <div class="inline-flex items-center gap-1">
                  <span>{{ t('image.workspace.form.aspectRatio') }}</span>
                  <UTooltip :text="t('image.workspace.form.aspectRatioHelp')">
                    <UIcon name="i-lucide-info" class="size-3.5 text-muted" />
                  </UTooltip>
                </div>
              </template>
              <USelect v-if="aspectRatioItems.length > 0" v-model="composer.aspectRatio" :items="aspectRatioItems" value-key="value" size="sm" variant="outline" class="w-full" />
              <div v-else class="h-8 px-2 rounded-md bg-muted text-xs text-muted flex items-center">{{ t('image.workspace.modelUnsupported') }}</div>
            </UFormField>

            <UFormField v-if="showSizeInput" :label="t('image.workspace.form.size')">
              <template #label>
                <div class="inline-flex items-center gap-1">
                  <span>{{ t('image.workspace.form.size') }}</span>
                  <UTooltip :text="t('image.workspace.form.sizeHelp')">
                    <UIcon name="i-lucide-info" class="size-3.5 text-muted" />
                  </UTooltip>
                </div>
              </template>
              <div class="space-y-2">
                <div v-if="sizeItems.length > 0 && allowCustomSize" class="flex items-center gap-2">
                  <UButton
                    size="xs"
                    :variant="useCustomSizeInput ? 'ghost' : 'soft'"
                    color="neutral"
                    @click="switchSizeInputMode('preset')"
                  >
                    {{ t('image.workspace.preset') }}
                  </UButton>
                  <UButton
                    size="xs"
                    :variant="useCustomSizeInput ? 'soft' : 'ghost'"
                    color="neutral"
                    @click="switchSizeInputMode('custom')"
                  >
                    {{ t('image.workspace.custom') }}
                  </UButton>
                </div>
                <USelect
                  v-if="sizeItems.length > 0 && !useCustomSizeInput"
                  v-model="composer.size"
                  :items="sizeItems"
                  value-key="value"
                  size="sm"
                  variant="outline"
                  class="w-full"
                />
                <UInput
                  v-else-if="allowCustomSize"
                  v-model="composer.size"
                  size="sm"
                  variant="outline"
                  class="w-full"
                  :placeholder="t('image.workspace.form.sizePlaceholder')"
                />
                <div v-else class="h-8 px-2 rounded-md bg-muted text-xs text-muted flex items-center">{{ t('image.workspace.modelUnsupported') }}</div>
                <div v-if="allowCustomSize && useCustomSizeInput" class="text-xs text-toned">
                  {{ customSizeHint }}
                </div>
              </div>
            </UFormField>

            <UFormField v-if="showQualityInput" :label="t('image.workspace.form.quality')">
              <template #label>
                <div class="inline-flex items-center gap-1">
                  <span>{{ t('image.workspace.form.quality') }}</span>
                  <UTooltip :text="t('image.workspace.form.qualityHelp')">
                    <UIcon name="i-lucide-info" class="size-3.5 text-muted" />
                  </UTooltip>
                </div>
              </template>
              <USelect v-model="composer.quality" :items="qualityItems" value-key="value" size="sm" variant="outline" class="w-full" />
            </UFormField>

            <UFormField v-if="showCountInput" :label="t('image.workspace.form.count')">
              <template #label>
                <div class="inline-flex items-center gap-1">
                  <span>{{ t('image.workspace.form.count') }}</span>
                  <UTooltip :text="t('image.workspace.form.countHelp')">
                    <UIcon name="i-lucide-info" class="size-3.5 text-muted" />
                  </UTooltip>
                </div>
              </template>
              <USelect v-model="composer.count" :items="countItems" value-key="value" size="sm" variant="outline" class="w-full" />
            </UFormField>

            <UFormField v-if="showSeedInput" label="Seed">
              <template #label>
                <div class="inline-flex items-center gap-1">
                  <span>Seed</span>
                  <UTooltip :text="t('image.workspace.form.seedHelp')">
                    <UIcon name="i-lucide-info" class="size-3.5 text-muted" />
                  </UTooltip>
                </div>
              </template>
              <div class="flex items-center gap-2">
                <UInput
                  :model-value="seedInputValue"
                  @update:model-value="handleSeedInput"
                  type="number"
                  size="sm"
                  variant="outline"
                  :placeholder="t('image.workspace.form.seedPlaceholder')"
                  class="w-full"
                  :min="seedRange.min"
                  :max="seedRange.max"
                />
                <UTooltip :text="t('image.workspace.randomSeed')">
                  <UButton
                    icon="i-mingcute:random-line"
                    size="sm"
                    color="neutral"
                    variant="outline"
                    square
                    @click="fillRandomSeed"
                  />
                </UTooltip>
              </div>
            </UFormField>

            <UFormField v-if="showNegativePromptInput" :label="t('image.workspace.form.negativePrompt')">
              <template #label>
                <div class="inline-flex items-center gap-1">
                  <span>{{ t('image.workspace.form.negativePrompt') }}</span>
                  <UPopover mode="hover" :content="{ side: 'top', align: 'start', sideOffset: 8 }">
                    <UIcon name="i-lucide-info" class="size-3.5 text-muted" />
                    <template #content>
                      <div class="w-88 p-3 text-xs text-toned leading-5 space-y-2">
                        <div>{{ t('image.workspace.negativePromptHintIntro') }}</div>
                        <div class="text-toned">
                          {{ t('image.workspace.negativePromptHintExample') }}
                        </div>
                        <div class="flex justify-end">
                          <UButton
                            size="xs"
                            variant="soft"
                            color="neutral"
                            square
                            :icon="negativeHintCopied ? 'i-lucide-check' : 'i-lucide-copy'"
                            @click="copyNegativePromptHint"
                          />
                        </div>
                      </div>
                    </template>
                  </UPopover>
                </div>
              </template>
              <UTextarea
                v-model="composer.negativePrompt"
                size="sm"
                :rows="3"
                :maxrows="5"
                :maxlength="500"
                autoresize
                variant="outline"
                class="w-full"
                :placeholder="t('image.workspace.form.negativePromptPlaceholder')"
              />
            </UFormField>

            <UFormField v-if="showPromptExtendInput" :label="t('image.workspace.form.promptExtend')">
              <template #label>
                <div class="inline-flex items-center gap-1">
                  <span>{{ t('image.workspace.form.promptExtend') }}</span>
                  <UTooltip :text="t('image.workspace.form.promptExtendHelp')">
                    <UIcon name="i-lucide-info" class="size-3.5 text-muted" />
                  </UTooltip>
                </div>
              </template>
              <USwitch v-model="composer.promptExtend" />
            </UFormField>

            <UFormField v-if="showWatermarkInput" :label="t('image.workspace.form.watermark')">
              <template #label>
                <div class="inline-flex items-center gap-1">
                  <span>{{ t('image.workspace.form.watermark') }}</span>
                  <UTooltip :text="t('image.workspace.form.watermarkHelp')">
                    <UIcon name="i-lucide-info" class="size-3.5 text-muted" />
                  </UTooltip>
                </div>
              </template>
              <USwitch v-model="composer.watermark" />
            </UFormField>

            <UFormField v-if="showEditFunctionInput" :label="t('image.workspace.form.editFunction')">
              <template #label>
                <div class="inline-flex items-center gap-1">
                  <span>{{ t('image.workspace.form.editFunction') }}</span>
                  <UTooltip :text="t('image.workspace.form.editFunctionHelp')">
                    <UIcon name="i-lucide-info" class="size-3.5 text-muted" />
                  </UTooltip>
                </div>
              </template>
              <USelect
                v-model="composer.editFunction"
                :items="wanx21EditFunctionItems"
                value-key="value"
                size="sm"
                variant="outline"
                class="w-full"
              />
            </UFormField>

            <USeparator v-if="customParamSchema.length > 0" />

            <template v-for="field in customParamSchema" :key="`custom-${field.key}`">
              <UFormField :label="field.label || field.key">
                <template #label>
                  <div class="inline-flex items-center gap-1">
                    <span>{{ field.label || field.key }}</span>
                    <UTooltip v-if="field.description" :text="field.description">
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
                  :items="(field.options || []).map((item) => ({ label: item.label, value: item.value }))"
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

            <div class="flex pt-1">
              <UButton
                v-if="selectedModelOption"
                icon="i-lucide-plus"
                size="sm"
                variant="soft"
                color="neutral"
                @click="openAddCustomParamModal"
              >
                {{ t('image.workspace.customParams') }}
              </UButton>
            </div>

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
                      v-for="(image, index) in composer.referenceImages"
                      :key="image.id"
                      class="relative group h-14 w-14 rounded-lg border border-default bg-muted overflow-hidden flex items-center justify-center"
                    >
                      <UImage
                        :src="image.url"
                        :alt="image.name || `reference ${index + 1}`"
                        :preview-name="image.name || `reference-${index + 1}`"
                        class="h-full w-full object-cover"
                      />
                      <UButton
                        icon="i-lucide-x"
                        size="xs"
                        color="neutral"
                        square
                        class="p-0.5 rounded-full absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity"
                        @click.stop="removeReferenceImage(index)"
                      />
                    </div>
                  </div>
                  <div
                    v-if="composer.maskImage"
                    class="relative group h-14 w-14 rounded-lg border border-default bg-muted overflow-hidden flex items-center justify-center"
                  >
                    <UImage
                      :src="composer.maskImage.url"
                      :alt="composer.maskImage.name || 'mask'"
                      :preview-name="composer.maskImage.name || 'mask'"
                      class="h-full w-full object-cover"
                    />
                    <div class="absolute left-1 top-1 rounded bg-black/60 px-1 text-[10px] text-white">Mask</div>
                    <UButton
                      icon="i-lucide-x"
                      size="xs"
                      color="neutral"
                      square
                      class="p-0.5 rounded-full absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity"
                      @click.stop="removeMaskImage"
                    />
                  </div>
                </div>
                <UTextarea
                  ref="imagePromptTextareaRef"
                  v-model="composer.prompt"
                  :placeholder="t('image.workspace.form.promptPlaceholder')"
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
                  <div class="flex items-center gap-1 min-w-0">
                    <UDropdownMenu
                      v-if="showComposerAttachmentMenu"
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
                    <PromptLibraryInsertPopover
                      v-model:open="imagePromptLibraryInsertOpen"
                      @before-open="captureImagePromptInsertSelection"
                      @insert="handleInsertPromptIntoImageComposer"
                    >
                      <UTooltip :text="t('chat.input.insertPrompt')">
                        <UButton
                          icon="i-lucide-book-marked"
                          color="neutral"
                          size="sm"
                          square
                          variant="ghost"
                          class="rounded-full"
                        />
                      </UTooltip>
                    </PromptLibraryInsertPopover>
                  </div>
                  <UTooltip :text="t('image.workspace.submit')">
                    <UButton
                      icon="i-lucide-arrow-up"
                      color="neutral"
                      size="sm"
                      square
                      class="rounded-full"
                      :disabled="!composer.prompt.trim()"
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
              ref="referenceFileInputRef"
              type="file"
              accept="image/*"
              multiple
              class="hidden"
              @change="handleReferenceFileChange"
            />
            <input
              ref="maskFileInputRef"
              type="file"
              accept="image/*"
              class="hidden"
              @change="handleMaskFileChange"
            />
          </div>
        </div>

        <PanelResizeHandle
          side="left"
          variant="gap"
          :active="operationPanelResize.isDragging.value"
          :value="operationPanelResize.width.value"
          :min="operationPanelResize.minWidth.value"
          :max="operationPanelResize.maxWidth.value"
          :cursor="operationPanelResize.cursor.value"
          @resize-start="operationPanelResize.startResize"
          @resize-by="operationPanelResize.resizeBy"
          @reset="operationPanelResize.resetWidth"
        />
      </aside>
    </div>

    <Transition
      enter-active-class="transition-all duration-200 ease-out"
      leave-active-class="transition-all duration-150 ease-in"
      enter-from-class="opacity-0 translate-x-2"
      leave-to-class="opacity-0 translate-x-2"
    >
      <aside
        v-if="detailModalOpen && selectedImage"
        ref="detailAsideRef"
        class="absolute top-5 bottom-5 w-[340px] bg-default rounded-xl border border-default shadow-lg overflow-hidden pointer-events-auto"
        :style="detailAsideStyle"
      >
        <div class="h-full flex flex-col">
          <div class="shrink-0 h-12 flex items-center justify-between px-3 border-b border-default">
            <div class="text-sm font-medium text-toned">{{ t('image.workspace.detail.title') }}</div>
            <UButton icon="i-lucide-x" size="sm" color="neutral" variant="ghost" square @click="clearSelection" />
          </div>

          <div class="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
            <UFormField :label="t('image.workspace.detail.actualSize')"><div class="text-sm text-default">{{ selectedImageSize }}</div></UFormField>
            <UFormField :label="t('image.workspace.detail.actualAspectRatio')"><div class="text-sm text-default">{{ selectedImageAspectRatio }}</div></UFormField>
            <UFormField :label="t('image.workspace.detail.startedAt')"><div class="text-sm text-default">{{ selectedRunStartedAtText }}</div></UFormField>
            <UFormField :label="t('image.workspace.detail.completedAt')"><div class="text-sm text-default">{{ selectedRunCompletedAtText }}</div></UFormField>
            <UFormField :label="t('image.workspace.detail.duration')"><div class="text-sm text-default">{{ selectedRunDurationText }}</div></UFormField>
            <USeparator />
            <UFormField :label="t('image.workspace.detail.taskType')"><div class="text-sm text-default">{{ selectedImageParams?.taskType === "edit" ? t('image.workspace.task.edit') : t('image.workspace.task.generate') }}</div></UFormField>
            <UFormField :label="t('image.workspace.form.model')"><div class="text-sm text-default break-all">{{ resolveSelectedModelLabel(selectedImageModel) }}</div></UFormField>
            <UFormField :label="t('image.workspace.detail.prompt')"><div class="text-sm text-default whitespace-pre-wrap break-all">{{ selectedImagePrompt || "-" }}</div></UFormField>
            <UFormField :label="t('image.workspace.detail.imageTime')"><div class="text-sm text-default">{{ selectedImageCreatedAtText }}</div></UFormField>
            <UFormField :label="t('image.workspace.form.aspectRatio')"><div class="text-sm text-default">{{ selectedImageParams?.aspectRatio || "-" }}</div></UFormField>
            <UFormField :label="t('image.workspace.form.size')"><div class="text-sm text-default">{{ selectedImageParams?.size || "-" }}</div></UFormField>
            <UFormField :label="t('image.workspace.form.quality')"><div class="text-sm text-default">{{ selectedImageParams?.quality || "-" }}</div></UFormField>
            <UFormField :label="t('image.workspace.form.count')"><div class="text-sm text-default">{{ selectedImageParams?.count ?? "-" }}</div></UFormField>
            <UFormField label="seed"><div class="text-sm text-default">{{ selectedImageParams?.seed ?? "-" }}</div></UFormField>
            <UFormField :label="t('image.workspace.form.negativePrompt')"><div class="text-sm text-default whitespace-pre-wrap break-all">{{ selectedImageParams?.negativePrompt || "-" }}</div></UFormField>
            <UFormField :label="t('image.workspace.form.promptExtend')"><div class="text-sm text-default">{{ typeof selectedImageParams?.promptExtend === 'boolean' ? (selectedImageParams?.promptExtend ? t('image.workspace.on') : t('image.workspace.off')) : "-" }}</div></UFormField>
            <UFormField :label="t('image.workspace.form.watermark')"><div class="text-sm text-default">{{ typeof selectedImageParams?.watermark === 'boolean' ? (selectedImageParams?.watermark ? t('image.workspace.on') : t('image.workspace.off')) : "-" }}</div></UFormField>
            <UFormField :label="t('image.workspace.customParams')">
              <div class="text-sm text-default whitespace-pre-wrap break-all">{{ selectedImageParams?.providerOptions ? JSON.stringify(selectedImageParams.providerOptions, null, 2) : "-" }}</div>
            </UFormField>
            <UFormField :label="t('image.workspace.form.referenceImages')"><div class="text-sm text-default">{{ selectedImageParams?.referenceImages?.length ?? 0 }}</div></UFormField>
            <UFormField label="Mask"><div class="text-sm text-default">{{ selectedImageParams?.maskImage ? t('image.workspace.oneImage') : "-" }}</div></UFormField>
            <UFormField v-if="selectedGroup?.warningMessage && selectedImageStatus === 'succeeded'" :label="t('image.workspace.notice')">
              <div class="text-sm text-amber-700 whitespace-pre-wrap break-all">{{ selectedGroup.warningMessage }}</div>
            </UFormField>
          </div>

          <div class="shrink-0 border-t border-default p-3">
            <div class="grid grid-cols-3 gap-2">
              <UButton icon="i-lucide-eye" size="sm" variant="soft" color="neutral" @click="openImagePreview(selectedImage)">
                {{ t('image.workspace.viewLarge') }}
              </UButton>
              <UButton icon="i-lucide-copy" size="sm" variant="soft" color="neutral" @click="copyImage(selectedImage)">
                {{ t('imagePreview.copy') }}
              </UButton>
              <UButton icon="i-lucide-download" size="sm" variant="soft" color="neutral" @click="downloadImage(selectedImage)">
                {{ t('image.workspace.download') }}
              </UButton>
              <UButton
                icon="i-lucide-copy-plus"
                size="sm"
                variant="soft"
                color="neutral"
                :disabled="!selectedGroup"
                @click="selectedGroup && reuseGroup(selectedGroup)"
              >
                {{ t('image.workspace.reuseParams') }}
              </UButton>
              <UButton
                icon="i-lucide-image-plus"
                size="sm"
                variant="soft"
                color="neutral"
                :disabled="!selectedImage"
                @click="selectedImage && useImageForEditing(selectedImage)"
              >
                {{ t('image.workspace.useForEdit') }}
              </UButton>
              <UButton
                icon="i-lucide-refresh-cw"
                size="sm"
                variant="soft"
                color="neutral"
                :disabled="!selectedGroup || !selectedRun || selectedRun.status === 'queued' || selectedRun.status === 'running'"
                @click="selectedGroup && selectedRun && regenerateRun(selectedGroup, selectedRun)"
              >
                {{ t('image.workspace.regenerate') }}
              </UButton>
              <UButton
                icon="i-lucide-trash-2"
                size="sm"
                variant="soft"
                color="error"
                :disabled="selectedImageStatus === 'queued' || selectedImageStatus === 'running'"
                @click="removeImage(selectedImage)"
              >
                {{ t('common.delete') }}
              </UButton>
            </div>
          </div>
        </div>
      </aside>
    </Transition>

    <UModal
      v-model:open="addCustomParamOpen"
      :title="t('image.workspace.addCustomParam')"
      :description="addCustomParamDescription"
      :ui="{ footer: 'justify-end' }"
    >
      <template #body>
        <div class="space-y-3">
          <UFormField :label="t('image.workspace.fieldName')">
            <UInput ref="newCustomParamKeyInputRef" v-model="newCustomParam.key" :placeholder="t('settings.modelConfig.schemaKeyPlaceholder')" class="w-full" />
          </UFormField>
          <UFormField :label="t('settings.customProvider.type')">
            <USelect
              v-model="newCustomParam.type"
              :items="customParamTypeItems"
              value-key="value"
              class="w-full"
              @update:model-value="handleNewCustomParamTypeChange"
            />
          </UFormField>
          <UFormField v-if="newCustomParam.type === 'select'" required :label="t('settings.modelConfig.options')" :description="t('settings.modelConfig.optionsDescription')">
            <UTextarea
              ref="newCustomParamOptionsTextareaRef"
              v-model="newCustomParam.optionsText"
              :rows="4"
              class="w-full font-mono text-xs"
              :placeholder="t('settings.modelConfig.optionsPlaceholder')"
            />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <UButton variant="outline" color="neutral" @click="addCustomParamOpen = false">{{ t('common.cancel') }}</UButton>
        <UButton @click="submitNewCustomParam">{{ t('common.save') }}</UButton>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import { onClickOutside } from "@vueuse/core";
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute, useRouter } from "vue-router";
import { resolveImageTaskCapabilities, type ProviderOptionFieldSchema } from "@shared";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { DEFAULT_MODEL_PLACEHOLDER } from "@/stores/useChatStore";
import { useMyToast } from "@/composables/useMyToast";
import { useConfirm } from "@/composables/useConfirm";
import { useResizableWidth } from "@/composables/useResizableWidth";
import PanelResizeHandle from "@/components/PanelResizeHandle.vue";
import UList from "@/components/UList.vue";
import UText from "@/components/UText.vue";
import UImage from "@/components/UImage.vue";
import ModelSelector from "@/components/ModelSelector.vue";
import PromptLibraryInsertPopover from "@/components/chat/PromptLibraryInsertPopover.vue";
import { isMac } from "@/utils/platformUtils";
import { getPersistentValue, setPersistentValueSoon } from "@/utils/persistentState";
import {
  appendCreatedImageGroup,
  buildImageReuseComposerState,
  buildImageRetryRunInput,
  clearImageSelectionAfterRemoval,
  normalizeImageWorkspaceRows,
  removeWorkspaceFromState as removeImageWorkspaceFromState,
  resolveImageRemovalAction,
  resolveWorkspaceSelection as resolveImageWorkspaceSelection,
} from "@/views/imageWorkspaceViewModel";

type GenerationStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";
type ImageTaskType = "generate" | "edit";

type ComposerState = {
  prompt: string;
  taskType: ImageTaskType;
  modelKey: string;
  aspectRatio: string;
  size: string;
  quality: string;
  count: number;
  seed: number | null;
  negativePrompt: string;
  promptExtend: boolean;
  watermark: boolean;
  editFunction: string;
  providerOptions: Record<string, unknown>;
  referenceImages: ComposerImageRef[];
  maskImage: ComposerImageRef | null;
};

type ComposerTaskConfigState = Omit<ComposerState, "prompt" | "taskType" | "referenceImages" | "maskImage"> & {
  sizeInputMode: "preset" | "custom";
};

type ComposerConfigState = {
  activeTask: ImageTaskType;
  byTask: Record<ImageTaskType, ComposerTaskConfigState>;
};

type ComposerImageRef = {
  id: string;
  name: string;
  url: string;
};

type ImageAsset = {
  id: string;
  assetId?: string;
  url?: string;
  filePath?: string;
  mediaType?: string;
  width?: number;
  height?: number;
  createdAt?: number;
  runId?: string;
  runPrompt?: string;
  runSelectedModel?: string;
  runParams?: Omit<ComposerState, "prompt">;
  runStatus?: GenerationStatus;
  runCreatedAt?: number;
  runStartedAt?: number;
  runCompletedAt?: number;
};

type ImageGroup = {
  id: string;
  prompt: string;
  createdAt: number;
  status: GenerationStatus;
  params: Omit<ComposerState, "prompt">;
  images: ImageAsset[];
  selectedModel: string;
  errorMessage?: string;
  warningMessage?: string;
  runs: ImageRun[];
};

type ImageRun = {
  id: string;
  prompt: string;
  status: GenerationStatus;
  selectedModel: string;
  params: Omit<ComposerState, "prompt">;
  errorMessage?: string;
  warningMessage?: string;
  createdAt: number;
  updatedAt: number;
  startedAt?: number;
  completedAt?: number;
};

type Workspace = {
  id: string;
  name: string;
  createdAt?: number;
  updatedAt: number;
  groups: ImageGroup[];
  lastComposer?: ComposerConfigState;
};

const settingsStore = useSettingsStore();
const toast = useMyToast();
const { confirm } = useConfirm();
const { t } = useI18n();
const route = useRoute();
const router = useRouter();

const workspaces = ref<Workspace[]>([]);
const activeWorkspaceId = ref("");
const selectedGroupId = ref("");
const selectedImageId = ref("");
const openMenuWorkspaceId = ref<string | null>(null);
const renamingWorkspaceId = ref("");
const renamingWorkspaceName = ref("");
const detailModalOpen = ref(false);
const detailAsideRef = ref<HTMLElement | null>(null);
const canvasScrollRef = ref<HTMLElement | null>(null);
const referenceFileInputRef = ref<HTMLInputElement | null>(null);
const maskFileInputRef = ref<HTMLInputElement | null>(null);
const newCustomParamKeyInputRef = ref<{ inputRef?: { focus: () => void } } | null>(null);
const newCustomParamOptionsTextareaRef = ref<{ textareaRef?: { focus: () => void } } | null>(null);
const isInputFocused = ref(false);
const sendShortcutMode = ref<"enter" | "cmd-enter">("enter");
const negativeHintCopied = ref(false);
const addCustomParamOpen = ref(false);
const useCustomSizeInput = ref(false);
let negativeHintCopiedTimer: ReturnType<typeof setTimeout> | null = null;
let composerPersistTimer: ReturnType<typeof setTimeout> | null = null;
let promptPersistTimer: ReturnType<typeof setTimeout> | null = null;
let suppressTaskWatch = false;
const PROMPT_CACHE_KEY = "mirdel.image-workspace.prompt-cache.v2";
const promptCacheByWorkspaceId = ref<Record<string, Partial<Record<ImageTaskType, string>>>>({});
const newCustomParam = reactive({
  key: "",
  type: "string-input" as "string-input" | "string-textarea" | "number-input" | "boolean-switch" | "select" | "json-textarea",
  optionsText: "",
});

const DETAIL_ASIDE_GAP = 18;
const workspaceSidebarResize = useResizableWidth({
  storageKey: "image-workspace-sidebar-width",
  defaultWidth: 200,
  minWidth: 160,
  maxWidth: 320,
  side: "right",
  step: 16
});
const operationPanelResize = useResizableWidth({
  storageKey: "image-workspace-operation-panel-width",
  defaultWidth: 350,
  minWidth: 320,
  maxWidth: 520,
  side: "left",
  step: 16
});
const workspaceSidebarWidthStyle = workspaceSidebarResize.widthStyle;
const operationPanelWidthStyle = operationPanelResize.widthStyle;
const detailAsideRightOffset = computed(() => operationPanelResize.width.value + DETAIL_ASIDE_GAP);
const canvasScrollStyle = computed(() => ({
  paddingRight: detailModalOpen.value ? `${detailAsideRightOffset.value}px` : undefined
}));
const detailAsideStyle = computed(() => ({
  right: `${detailAsideRightOffset.value}px`
}));

const activeTask = ref<ImageTaskType>("generate");

const composer = reactive<ComposerState>({
  prompt: "",
  taskType: "generate",
  modelKey: "",
  aspectRatio: "1:1",
  size: "1024x1024",
  quality: "",
  count: 1,
  seed: null,
  negativePrompt: "",
  promptExtend: false,
  watermark: false,
  editFunction: "",
  providerOptions: {},
  referenceImages: [],
  maskImage: null,
});

const imagePromptTextareaRef = ref<{ textareaRef?: HTMLTextAreaElement | null } | null>(null);
const imagePromptLibraryInsertOpen = ref(false);
const imagePromptInsertSavedSelection = ref<{ start: number; end: number } | null>(null);

watch(imagePromptLibraryInsertOpen, (open) => {
  if (!open) {
    imagePromptInsertSavedSelection.value = null;
  }
});

function getImagePromptNativeTextarea(): HTMLTextAreaElement | null {
  return imagePromptTextareaRef.value?.textareaRef ?? null;
}

function captureImagePromptInsertSelection() {
  const el = getImagePromptNativeTextarea();
  if (!el || document.activeElement !== el) {
    imagePromptInsertSavedSelection.value = null;
    return;
  }
  imagePromptInsertSavedSelection.value = {
    start: el.selectionStart,
    end: el.selectionEnd
  };
}

function handleInsertPromptIntoImageComposer(text: string) {
  const el = getImagePromptNativeTextarea();
  const cur = composer.prompt;
  let start: number;
  let end: number;

  if (el && document.activeElement === el) {
    start = el.selectionStart;
    end = el.selectionEnd;
  } else if (imagePromptInsertSavedSelection.value) {
    start = imagePromptInsertSavedSelection.value.start;
    end = imagePromptInsertSavedSelection.value.end;
    imagePromptInsertSavedSelection.value = null;
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

  composer.prompt = cur.slice(0, start) + text + cur.slice(end);
  const caret = start + text.length;
  imagePromptInsertSavedSelection.value = null;
  imagePromptLibraryInsertOpen.value = false;
  nextTick(() => {
    const ta = getImagePromptNativeTextarea();
    ta?.focus();
    ta?.setSelectionRange(caret, caret);
  });
}

function createDefaultTaskConfig(): ComposerTaskConfigState {
  return {
    modelKey: DEFAULT_MODEL_PLACEHOLDER,
    aspectRatio: "",
    size: "",
    quality: "",
    count: 1,
    seed: null,
    negativePrompt: "",
    promptExtend: false,
    watermark: false,
    editFunction: "",
    providerOptions: {},
    sizeInputMode: "preset",
  };
}

const composerConfigByTask = reactive<Record<ImageTaskType, ComposerTaskConfigState>>({
  generate: createDefaultTaskConfig(),
  edit: createDefaultTaskConfig(),
});

const taskAttachmentsByTask = reactive<Record<ImageTaskType, { referenceImages: ComposerImageRef[]; maskImage: ComposerImageRef | null }>>({
  generate: { referenceImages: [], maskImage: null },
  edit: { referenceImages: [], maskImage: null },
});

const statusText = computed<Record<GenerationStatus, string>>(() => ({
  queued: t("image.workspace.status.queued"),
  running: t("image.workspace.status.running"),
  succeeded: t("image.workspace.status.succeeded"),
  failed: t("image.workspace.status.failed"),
  cancelled: t("image.workspace.status.cancelled"),
}));

const IMAGE_PREVIEW_MAX_WIDTH = 320;
const IMAGE_PREVIEW_MAX_HEIGHT = 320;
const IMAGE_PREVIEW_FALLBACK = 192;

function isAbortLikeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /任务已取消|abort|aborted|cancel/i.test(message);
}

const sendShortcutOptions = computed(() => [
  { label: t("image.workspace.shortcut.enter"), value: "enter" },
  { label: t("image.workspace.shortcut.cmdEnter", { key: isMac() ? "⌘" : "Ctrl" }), value: "cmd-enter" },
]);
const IMAGE_COUNT_SOFT_MAX = 20;

const taskTabItems = computed(() => [
  { label: t("image.workspace.task.generate"), value: "generate" as const },
  { label: t("image.workspace.task.edit"), value: "edit" as const },
]);

function getDefaultImageModelByTask(task: ImageTaskType) {
  return task === "edit" ? settingsStore.defaultModels.imageEdit : settingsStore.defaultModels.imageGenerate;
}

function resolveImageTaskSupport(model: any) {
  const inputModalities: string[] = model?.inputModalities || ["text"];
  const outputModalities: string[] = model?.outputModalities || ["text"];
  const raw = Array.isArray(model?.imageTasks) ? model.imageTasks : [];
  const typed = raw.filter((item: unknown): item is "text_to_image" | "image_to_image" | "image_edit" | "inpaint" => (
    item === "text_to_image" || item === "image_to_image" || item === "image_edit" || item === "inpaint"
  ));
  const tasks = typed.length > 0
    ? typed
    : (() => {
        if (!outputModalities.includes("image")) return [] as Array<"text_to_image" | "image_to_image" | "image_edit" | "inpaint">;
        const inferred: Array<"text_to_image" | "image_to_image" | "image_edit" | "inpaint"> = ["text_to_image"];
        if (inputModalities.includes("image")) inferred.push("image_to_image", "image_edit");
        const editCaps = resolveImageTaskCapabilities(model?.image, "edit");
        if (inputModalities.includes("mask") || !!editCaps?.mask?.enabled) inferred.push("inpaint");
        return inferred;
      })();

  return {
    canGenerate: tasks.includes("text_to_image") || tasks.includes("image_to_image"),
    canImageToImage: tasks.includes("image_to_image"),
    canEdit: tasks.includes("image_edit") || tasks.includes("inpaint"),
    canInpaint: tasks.includes("inpaint"),
  };
}

const selectedModelOption = computed(() => {
  if (!composer.modelKey) return null;

  let providerId = "";
  let modelId = "";

  if (composer.modelKey === DEFAULT_MODEL_PLACEHOLDER) {
    const imageDefault = getDefaultImageModelByTask(activeTask.value);
    if (!imageDefault?.providerId || !imageDefault?.modelId) return null;
    providerId = imageDefault.providerId;
    modelId = imageDefault.modelId;
  } else {
    const [pid, mid] = composer.modelKey.split("::");
    if (!pid || !mid) return null;
    providerId = pid;
    modelId = mid;
  }

  const provider = settingsStore.enabledProviders.find((item) => item.id === providerId);
  if (!provider) return null;
  const model = provider.models.find((item) => item.id === modelId);
  if (!model) return null;
  return {
    providerId,
    modelId,
    label: `${provider.name} / ${model.id}`,
    provider,
    image: model.image,
    model,
  };
});

const customParamSchema = computed<ProviderOptionFieldSchema[]>(() => {
  const list = selectedModelOption.value?.model?.imageOptionSchema;
  if (!Array.isArray(list)) return [];
  return list.filter((item): item is ProviderOptionFieldSchema => !!item && typeof item.key === "string" && item.key.length > 0);
});

const selectedImageTaskCaps = computed(() => resolveImageTaskCapabilities(selectedModelOption.value?.image, activeTask.value));

const customParamTypeItems = computed(() => [
  { label: t("settings.modelConfig.schemaType.stringInput"), value: "string-input" },
  { label: t("settings.modelConfig.schemaType.stringTextarea"), value: "string-textarea" },
  { label: t("settings.modelConfig.schemaType.numberInput"), value: "number-input" },
  { label: t("settings.modelConfig.schemaType.booleanSwitch"), value: "boolean-switch" },
  { label: t("settings.modelConfig.schemaType.select"), value: "select" },
  { label: "JSON", value: "json-textarea" },
]);

const addCustomParamDescription = computed(() => t("image.workspace.addCustomParamDescription", { model: selectedModelOption.value?.modelId || "-" }));

const aspectRatioItems = computed(() => {
  const options = selectedImageTaskCaps.value?.aspectRatio;
  if (!options?.enabled || !options.options?.length) return [];
  return options.options.map((value) => ({ label: value, value }));
});

const sizeItems = computed(() => {
  const options = selectedImageTaskCaps.value?.size;
  if (!options?.enabled || !options.options?.length) return [];
  return options.options.map((value) => ({ label: value, value }));
});

const qualityItems = computed(() => {
  const options = selectedImageTaskCaps.value?.quality;
  if (!options?.enabled || !options.options?.length) return [];
  return options.options.map((value) => ({ label: value, value }));
});

const imageSizeMode = computed<"size" | "aspectRatio" | "both">(() => {
  const mode = selectedImageTaskCaps.value?.sizeMode;
  if (mode === "size" || mode === "aspectRatio" || mode === "both") return mode;
  return "both";
});

const allowCustomSize = computed(() => !!selectedImageTaskCaps.value?.allowCustomSize);
const customSizeHint = computed(() => {
  const rawHint = selectedImageTaskCaps.value?.customSizeHint;
  const hint = typeof rawHint === "string" ? rawHint.trim() : "";
  return hint || t("image.workspace.customSizeHintFallback");
});

const showAspectRatioInput = computed(() => (imageSizeMode.value === "aspectRatio" || imageSizeMode.value === "both") && aspectRatioItems.value.length > 0);
const showSizeInput = computed(() => {
  if (!(imageSizeMode.value === "size" || imageSizeMode.value === "both")) return false;
  return sizeItems.value.length > 0 || allowCustomSize.value;
});
const showQualityInput = computed(() => qualityItems.value.length > 0);
const showCountInput = computed(() => selectedImageTaskCaps.value?.n?.enabled !== false);

const countItems = computed(() => {
  if (selectedImageTaskCaps.value?.n?.enabled === false) {
    return [{ label: t("image.workspace.countUnit", { count: 1 }), value: 1 }];
  }
  const max = selectedImageTaskCaps.value?.n?.enabled ? selectedImageTaskCaps.value.n.max ?? 4 : 4;
  const capped = Math.min(Math.max(max, 1), IMAGE_COUNT_SOFT_MAX);
  return Array.from({ length: capped }, (_, idx) => ({ label: t("image.workspace.countUnit", { count: idx + 1 }), value: idx + 1 }));
});

const showSeedInput = computed(() => !!selectedImageTaskCaps.value?.seed?.enabled);
const seedRange = computed(() => {
  const minRaw = selectedImageTaskCaps.value?.seed?.min;
  const maxRaw = selectedImageTaskCaps.value?.seed?.max;
  const min = typeof minRaw === "number" && Number.isFinite(minRaw) ? Math.floor(minRaw) : 0;
  const max = typeof maxRaw === "number" && Number.isFinite(maxRaw) ? Math.floor(maxRaw) : 2147483647;
  return { min, max: Math.max(min, max) };
});
const showNegativePromptInput = computed(() => !!selectedImageTaskCaps.value?.negativePrompt?.enabled);
const showPromptExtendInput = computed(() => !!selectedImageTaskCaps.value?.promptExtend?.enabled);
const showWatermarkInput = computed(() => !!selectedImageTaskCaps.value?.watermark?.enabled);
const wanx21EditFunctionItems = computed(() => [
  { label: t("image.workspace.editFunction.descriptionEdit"), value: "description_edit" },
  { label: t("image.workspace.editFunction.descriptionEditWithMask"), value: "description_edit_with_mask" },
  { label: t("image.workspace.editFunction.stylizationAll"), value: "stylization_all" },
  { label: t("image.workspace.editFunction.stylizationLocal"), value: "stylization_local" },
  { label: t("image.workspace.editFunction.removeWatermark"), value: "remove_watermark" },
  { label: t("image.workspace.editFunction.expand"), value: "expand" },
  { label: t("image.workspace.editFunction.superResolution"), value: "super_resolution" },
  { label: t("image.workspace.editFunction.colorization"), value: "colorization" },
  { label: t("image.workspace.editFunction.doodle"), value: "doodle" },
  { label: t("image.workspace.editFunction.controlCartoonFeature"), value: "control_cartoon_feature" },
]);
const modelSupportsImageInput = computed(() => !!selectedModelOption.value?.model?.inputModalities?.includes("image"));
const modelTaskSupport = computed(() => resolveImageTaskSupport(selectedModelOption.value?.model));
const modelSupportsMaskInput = computed(() => {
  if (!selectedModelOption.value) return false;
  const editCaps = resolveImageTaskCapabilities(selectedModelOption.value.image, "edit");
  return !!selectedModelOption.value.model.inputModalities?.includes("mask") || !!editCaps?.mask?.enabled || modelTaskSupport.value.canInpaint;
});
const modelSupportsGenerateTask = computed(() => modelTaskSupport.value.canGenerate);
const modelSupportsEditTask = computed(() => modelTaskSupport.value.canEdit && modelSupportsImageInput.value);
const modelSupportsImageToImageTask = computed(() => modelTaskSupport.value.canImageToImage);
const isEditTask = computed(() => activeTask.value === "edit");
const taskSupportsReferenceImages = computed(() => !!selectedImageTaskCaps.value?.referenceImages?.enabled);
const showEditFunctionInput = computed(() => {
  if (!isEditTask.value) return false;
  const modelId = selectedModelOption.value?.modelId || "";
  return /^wanx2\.1-imageedit/i.test(modelId);
});
const showSourceImagesInput = computed(() => {
  if (isEditTask.value) {
    return modelSupportsImageInput.value && (taskSupportsReferenceImages.value || modelSupportsEditTask.value);
  }
  return taskSupportsReferenceImages.value || modelSupportsImageToImageTask.value;
});
const sourceImageMax = computed(() => {
  if (!showSourceImagesInput.value) return 0;
  const declaredMax = selectedImageTaskCaps.value?.referenceImages?.max;
  if (typeof declaredMax === "number" && Number.isFinite(declaredMax)) {
    return Math.max(1, Math.floor(declaredMax));
  }
  return isEditTask.value ? 1 : 1;
});
const showMaskInput = computed(() => isEditTask.value && modelSupportsMaskInput.value && !!selectedImageTaskCaps.value?.mask?.enabled);
const hasComposerAttachments = computed(() => composer.referenceImages.length > 0 || !!composer.maskImage);
const showComposerAttachmentMenu = computed(() => showSourceImagesInput.value || showMaskInput.value);
const composerAttachmentMenuItems = computed(() => {
  const groups: Array<Array<{ label: string; icon: string; onSelect: () => void }>> = [];
  if (showSourceImagesInput.value) {
    groups.push([
      {
        label: isEditTask.value ? t("image.workspace.uploadEditImage") : t("image.workspace.uploadReferenceImage"),
        icon: "i-lucide-image-plus",
        onSelect: openReferencePicker,
      },
    ]);
  }
  if (showMaskInput.value) {
    groups.push([
      {
        label: t("image.workspace.uploadMask"),
        icon: "i-lucide-eraser",
        onSelect: openMaskPicker,
      },
    ]);
  }
  return groups;
});

const activeWorkspace = computed(() => workspaces.value.find((item) => item.id === activeWorkspaceId.value) || null);
const selectedGroup = computed(() => activeWorkspace.value?.groups.find((item) => item.id === selectedGroupId.value) || null);
const selectedImage = computed(() => selectedGroup.value?.images.find((item) => item.id === selectedImageId.value) || null);
const selectedRun = computed(() => {
  const group = selectedGroup.value;
  const runId = selectedImage.value?.runId;
  if (!group || !runId) return null;
  return group.runs.find((item) => item.id === runId) || null;
});
const selectedImageParams = computed(() => selectedImage.value?.runParams || selectedGroup.value?.params || null);
const selectedImagePrompt = computed(() => selectedImage.value?.runPrompt || selectedGroup.value?.prompt || "");
const selectedImageModel = computed(() => selectedImage.value?.runSelectedModel || selectedGroup.value?.selectedModel || "");
const selectedImageStatus = computed<GenerationStatus>(() => selectedImage.value?.runStatus || selectedGroup.value?.status || "queued");
const selectedImageSize = computed(() => {
  const w = selectedImage.value?.width;
  const h = selectedImage.value?.height;
  if (!w || !h) return "-";
  return `${w} x ${h}`;
});
const selectedImageAspectRatio = computed(() => {
  const w = selectedImage.value?.width;
  const h = selectedImage.value?.height;
  if (!w || !h) return "-";
  const g = gcd(w, h);
  return `${w / g}:${h / g}`;
});
const selectedRunStartedAtText = computed(() => formatDateTime(selectedImage.value?.runStartedAt || selectedImage.value?.runCreatedAt));
const selectedRunCompletedAtText = computed(() => formatDateTime(selectedImage.value?.runCompletedAt));
const selectedRunDurationText = computed(() => {
  const started = selectedImage.value?.runStartedAt || selectedImage.value?.runCreatedAt;
  const completed = selectedImage.value?.runCompletedAt;
  if (!started || !completed || completed < started) return "-";
  return formatDuration(completed - started);
});
const selectedImageCreatedAtText = computed(() => formatDateTime(selectedImage.value?.createdAt));
const seedInputValue = computed(() => (composer.seed == null ? "" : String(composer.seed)));

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
    composer.providerOptions = {};
    return;
  }
  const providerDefaults = selectedModelOption.value?.provider?.providerOptionsDefaults || {};
  const modelDefaults = selectedModelOption.value?.model?.providerOptionsDefaults || {};
  const current = composer.providerOptions || {};
  const next: Record<string, unknown> = {};
  for (const field of schema) {
    const key = field.key;
    const currentValue = normalizeCustomParamValue(field, current[key]);
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

function syncSizeInputMode() {
  if (!showSizeInput.value) {
    composer.size = "";
    useCustomSizeInput.value = false;
    return;
  }

  const hasPreset = sizeItems.value.length > 0;
  if (hasPreset && !allowCustomSize.value) {
    useCustomSizeInput.value = false;
    if (!sizeItems.value.some((item) => item.value === composer.size)) composer.size = sizeItems.value[0]?.value ?? "";
    return;
  }

  if (!hasPreset && allowCustomSize.value) {
    useCustomSizeInput.value = true;
    return;
  }

  if (hasPreset && allowCustomSize.value) {
    if (!useCustomSizeInput.value && !sizeItems.value.some((item) => item.value === composer.size)) {
      composer.size = sizeItems.value[0]?.value ?? "";
    }
    return;
  }

  composer.size = "";
  useCustomSizeInput.value = false;
}

function switchSizeInputMode(mode: "preset" | "custom") {
  if (mode === "custom") {
    if (!allowCustomSize.value) return;
    useCustomSizeInput.value = true;
    return;
  }
  if (sizeItems.value.length === 0) return;
  useCustomSizeInput.value = false;
  if (!sizeItems.value.some((item) => item.value === composer.size)) {
    composer.size = sizeItems.value[0]?.value ?? "";
  }
}

function syncTaskConfigFromComposer(task: ImageTaskType = activeTask.value) {
  composerConfigByTask[task] = {
    modelKey: composer.modelKey || DEFAULT_MODEL_PLACEHOLDER,
    aspectRatio: composer.aspectRatio,
    size: composer.size,
    quality: composer.quality,
    count: composer.count,
    seed: composer.seed,
    negativePrompt: composer.negativePrompt,
    promptExtend: composer.promptExtend,
    watermark: composer.watermark,
    editFunction: composer.editFunction,
    providerOptions: { ...(composer.providerOptions || {}) },
    sizeInputMode: useCustomSizeInput.value ? "custom" : "preset",
  };
  taskAttachmentsByTask[task] = {
    referenceImages: [...composer.referenceImages],
    maskImage: composer.maskImage ? { ...composer.maskImage } : null,
  };
}

function applyTaskConfigToComposer(task: ImageTaskType) {
  const config = composerConfigByTask[task] || createDefaultTaskConfig();
  composer.taskType = task;
  composer.modelKey = config.modelKey || DEFAULT_MODEL_PLACEHOLDER;
  composer.aspectRatio = config.aspectRatio;
  composer.size = config.size;
  composer.quality = config.quality;
  composer.count = config.count;
  composer.seed = config.seed;
  composer.negativePrompt = config.negativePrompt;
  composer.promptExtend = config.promptExtend;
  composer.watermark = config.watermark;
  composer.editFunction = config.editFunction || "";
  composer.providerOptions = { ...(config.providerOptions || {}) };
  composer.referenceImages = [...(taskAttachmentsByTask[task]?.referenceImages || [])];
  composer.maskImage = taskAttachmentsByTask[task]?.maskImage ? { ...taskAttachmentsByTask[task].maskImage! } : null;
  useCustomSizeInput.value = config.sizeInputMode === "custom";
}

function handleTaskChange(next: ImageTaskType, prev?: ImageTaskType) {
  if (prev) {
    syncTaskConfigFromComposer(prev);
    if (activeWorkspaceId.value) {
      updatePromptDraft(activeWorkspaceId.value, prev, composer.prompt);
    }
  }
  applyTaskConfigToComposer(next);
  if (!composer.modelKey) {
    composer.modelKey = DEFAULT_MODEL_PLACEHOLDER;
  }
  const workspaceId = activeWorkspaceId.value;
  composer.prompt = workspaceId ? getPromptDraft(workspaceId, next) : "";
  syncSizeInputMode();
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
  () => {
    if (route.name !== "images") return;
    const routeWorkspaceId = getRouteWorkspaceId();
    if (!routeWorkspaceId) {
      if (activeWorkspaceId.value) void syncWorkspaceRoute(activeWorkspaceId.value);
      return;
    }
    if (routeWorkspaceId === activeWorkspaceId.value) return;
    if (workspaces.value.some((item) => item.id === routeWorkspaceId)) {
      activeWorkspaceId.value = routeWorkspaceId;
      return;
    }
    if (activeWorkspaceId.value) void syncWorkspaceRoute(activeWorkspaceId.value);
  },
  { immediate: true }
);

watch(
  () => [settingsStore.defaultModels.imageGenerate, settingsStore.defaultModels.imageEdit],
  () => {
    if (!composer.modelKey) {
      composer.modelKey = DEFAULT_MODEL_PLACEHOLDER;
    }
  },
  { immediate: true, deep: true }
);

watch(
  () => composer.modelKey,
  () => {
    if (!composer.modelKey) {
      composer.modelKey = DEFAULT_MODEL_PLACEHOLDER;
      return;
    }

    if (showAspectRatioInput.value && aspectRatioItems.value.length > 0 && !aspectRatioItems.value.some((item) => item.value === composer.aspectRatio)) {
      composer.aspectRatio = aspectRatioItems.value[0]?.value ?? "";
    }
    if (!showAspectRatioInput.value || aspectRatioItems.value.length === 0) composer.aspectRatio = "";

    syncSizeInputMode();
    if (showQualityInput.value && qualityItems.value.length > 0 && !qualityItems.value.some((item) => item.value === composer.quality)) {
      composer.quality = qualityItems.value[0]?.value ?? "";
    }
    if (!showQualityInput.value || qualityItems.value.length === 0) {
      composer.quality = "";
    }

    const maxCount = countItems.value[countItems.value.length - 1]?.value ?? 1;
    if (composer.count > maxCount) composer.count = maxCount;
    if (!showSeedInput.value) composer.seed = null;
    if (!showNegativePromptInput.value) {
      composer.negativePrompt = "";
    }
    if (!showPromptExtendInput.value) {
      composer.promptExtend = false;
    } else {
      composer.promptExtend = !!selectedImageTaskCaps.value?.promptExtend?.default;
    }
    if (!showWatermarkInput.value) {
      composer.watermark = false;
    } else {
      composer.watermark = !!selectedImageTaskCaps.value?.watermark?.default;
    }
    if (!showEditFunctionInput.value) {
      composer.editFunction = "";
    } else if (!composer.editFunction) {
      composer.editFunction = "description_edit";
    }
    if (!showSourceImagesInput.value) {
      composer.referenceImages = [];
    }
    if (showSourceImagesInput.value && composer.referenceImages.length > sourceImageMax.value) {
      composer.referenceImages = composer.referenceImages.slice(0, sourceImageMax.value);
    }
    if (!showMaskInput.value) {
      composer.maskImage = null;
    }
    syncComposerProviderOptionsBySchema();
  }
);

watch(
  () => customParamSchema.value,
  () => {
    syncComposerProviderOptionsBySchema();
  },
  { deep: true }
);

watch(
  () => activeTask.value,
  (nextType, prevType) => {
    if (suppressTaskWatch) return;
    handleTaskChange(nextType, prevType);
    if (nextType !== "edit") {
      composer.editFunction = "";
      composer.maskImage = null;
    }
    if (composer.referenceImages.length > sourceImageMax.value) {
      composer.referenceImages = composer.referenceImages.slice(0, sourceImageMax.value);
    }
  }
);

watch(
  () => [imageSizeMode.value, allowCustomSize.value, sizeItems.value.map((item) => item.value).join("|")],
  () => {
    syncSizeInputMode();
  }
);

watch(
  () => activeWorkspaceId.value,
  (nextId, prevId) => {
    if (prevId && workspaces.value.some((item) => item.id === prevId)) {
      updatePromptDraft(prevId, activeTask.value, composer.prompt);
      persistPromptCache();
    }

    const workspace = activeWorkspace.value;
    if (!workspace) return;

    const fallbackComposer = workspace.lastComposer ?? {
      activeTask: "generate" as const,
      byTask: {
        generate: createDefaultTaskConfig(),
        edit: createDefaultTaskConfig(),
      },
    };

    composerConfigByTask.generate = {
      ...createDefaultTaskConfig(),
      ...(fallbackComposer.byTask?.generate || {}),
    };
    composerConfigByTask.edit = {
      ...createDefaultTaskConfig(),
      ...(fallbackComposer.byTask?.edit || {}),
    };
    taskAttachmentsByTask.generate = { referenceImages: [], maskImage: null };
    taskAttachmentsByTask.edit = { referenceImages: [], maskImage: null };
    suppressTaskWatch = true;
    activeTask.value = fallbackComposer.activeTask === "edit" ? "edit" : "generate";
    suppressTaskWatch = false;
    applyTaskConfigToComposer(activeTask.value);
    composer.prompt = getPromptDraft(nextId, activeTask.value);
    composer.referenceImages = [];
    composer.maskImage = null;
    syncSizeInputMode();

    selectedGroupId.value = "";
    selectedImageId.value = "";
    scrollCanvasToBottom();
  },
  { immediate: true }
);

watch(
  () => detailModalOpen.value,
  (open) => {
    if (!open) clearSelection();
  }
);

watch(
  () => [
    activeTask.value,
    composer.modelKey,
    composer.aspectRatio,
    composer.size,
    composer.quality,
    composer.count,
    composer.seed,
    composer.negativePrompt,
    composer.promptExtend,
    composer.watermark,
    composer.editFunction,
  ],
  () => {
    const workspace = activeWorkspace.value;
    if (!workspace) return;
    syncTaskConfigFromComposer();
    workspace.lastComposer = serializeComposerConfig();
    schedulePersistComposerConfig();
  },
  { deep: true }
);

watch(
  () => composer.providerOptions,
  () => {
    const workspace = activeWorkspace.value;
    if (!workspace) return;
    syncTaskConfigFromComposer();
    workspace.lastComposer = serializeComposerConfig();
    schedulePersistComposerConfig();
  },
  { deep: true }
);

watch(
  () => useCustomSizeInput.value,
  () => {
    const workspace = activeWorkspace.value;
    if (!workspace) return;
    syncTaskConfigFromComposer();
    workspace.lastComposer = serializeComposerConfig();
    schedulePersistComposerConfig();
  }
);

watch(
  () => composer.prompt,
  () => {
    const workspaceId = activeWorkspaceId.value;
    if (!workspaceId) return;
    updatePromptDraft(workspaceId, activeTask.value, composer.prompt);
    schedulePersistPromptCache();
  }
);

watch(
  () => addCustomParamOpen.value,
  async (open) => {
    if (!open) return;
    await nextTick();
    setTimeout(() => {
      newCustomParamKeyInputRef.value?.inputRef?.focus();
    }, 50);
  }
);

function now() {
  return Date.now();
}

function getRouteWorkspaceId() {
  const raw = route.params.workspaceId;
  if (typeof raw === "string") return raw.trim();
  if (Array.isArray(raw) && typeof raw[0] === "string") return raw[0].trim();
  return "";
}

async function syncWorkspaceRoute(workspaceId: string) {
  if (!workspaceId || route.name !== "images") return;
  if (getRouteWorkspaceId() === workspaceId) return;
  await router.replace({
    name: "images",
    params: { workspaceId },
    query: route.query,
    hash: route.hash,
  });
}

function toPlainIpcPayload<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function toAssetUrl(assetId: string | undefined) {
  const id = (assetId || "").trim();
  if (!id) return "";
  return `asset://${id}`;
}

function resolveImageDisplaySrc(image: ImageAsset) {
  const assetUrl = toAssetUrl(image.assetId);
  if (assetUrl) return assetUrl;
  const rawUrl = (image.url || "").trim();
  if (/^(asset:\/\/|https?:\/\/|data:|blob:)/i.test(rawUrl)) return rawUrl;
  return "";
}

function scrollCanvasToBottom() {
  nextTick(() => {
    requestAnimationFrame(() => {
      const el = canvasScrollRef.value;
      if (!el) return;
      el.scrollTop = el.scrollHeight;
    });
  });
}

async function loadWorkspaceGenerations(workspaceId: string) {
  const groups = await window.ipc("imageGeneration:listByWorkspace", { workspaceId }) as ImageGroup[];
  return groups;
}

async function loadWorkspaces() {
  let workspaceRows: Workspace[] = [];
  try {
    workspaceRows = await window.ipc("imageWorkspace:list") as Workspace[];
  } catch {
    workspaceRows = [];
  }

  const valid = normalizeImageWorkspaceRows((workspaceRows ?? []) as Workspace[]);

  if (valid.length > 0) {
    const withGroups: Workspace[] = [];
    for (const workspace of valid) {
      try {
        const groups = await loadWorkspaceGenerations(workspace.id);
        withGroups.push({ ...workspace, groups });
      } catch {
        withGroups.push({ ...workspace, groups: [] });
      }
    }
    workspaces.value = withGroups;
    activeWorkspaceId.value = resolveImageWorkspaceSelection(
      workspaces.value,
      getRouteWorkspaceId(),
      activeWorkspaceId.value
    );
    if (activeWorkspaceId.value) void syncWorkspaceRoute(activeWorkspaceId.value);
    return;
  }

  await createWorkspace();
}

async function ensureWorkspaceReady() {
  if (activeWorkspace.value) return true;
  try {
    await loadWorkspaces();
  } catch {
    return false;
  }
  return !!activeWorkspace.value;
}

function persistPromptCache() {
  setPersistentValueSoon(PROMPT_CACHE_KEY, promptCacheByWorkspaceId.value);
}

function schedulePersistPromptCache() {
  if (promptPersistTimer) clearTimeout(promptPersistTimer);
  promptPersistTimer = setTimeout(() => {
    promptPersistTimer = null;
    persistPromptCache();
  }, 220);
}

function updatePromptDraft(workspaceId: string, task: ImageTaskType, prompt: string) {
  if (!workspaceId) return;
  const current = { ...(promptCacheByWorkspaceId.value[workspaceId] || {}) };
  if (prompt.trim()) {
    current[task] = prompt;
    promptCacheByWorkspaceId.value[workspaceId] = current;
    return;
  }
  delete current[task];
  if (Object.keys(current).length === 0) {
    delete promptCacheByWorkspaceId.value[workspaceId];
    return;
  }
  promptCacheByWorkspaceId.value[workspaceId] = current;
}

function getPromptDraft(workspaceId: string, task: ImageTaskType) {
  return promptCacheByWorkspaceId.value[workspaceId]?.[task] || "";
}

function loadPromptCache() {
  try {
    const parsed = getPersistentValue<Record<string, Partial<Record<ImageTaskType, string>>>>(PROMPT_CACHE_KEY, {});
    if (!parsed || typeof parsed !== "object") return {};
    const normalized: Record<string, Partial<Record<ImageTaskType, string>>> = {};
    for (const [workspaceId, taskDrafts] of Object.entries(parsed)) {
      if (!workspaceId || !taskDrafts || typeof taskDrafts !== "object") continue;
      const generate = typeof taskDrafts.generate === "string" && taskDrafts.generate.trim()
        ? taskDrafts.generate
        : "";
      const edit = typeof taskDrafts.edit === "string" && taskDrafts.edit.trim()
        ? taskDrafts.edit
        : "";
      if (!generate && !edit) continue;
      normalized[workspaceId] = {
        ...(generate ? { generate } : {}),
        ...(edit ? { edit } : {}),
      };
    }
    return normalized;
  } catch {
    return {};
  }
}

function serializeComposerConfig() {
  syncTaskConfigFromComposer();
  return {
    activeTask: activeTask.value,
    byTask: {
      generate: { ...composerConfigByTask.generate, providerOptions: { ...(composerConfigByTask.generate.providerOptions || {}) } },
      edit: { ...composerConfigByTask.edit, providerOptions: { ...(composerConfigByTask.edit.providerOptions || {}) } },
    },
  } as ComposerConfigState;
}

function getEffectiveSizeParams() {
  if (imageSizeMode.value === "size") {
    return {
      size: composer.size || "",
      aspectRatio: "",
    };
  }
  if (imageSizeMode.value === "aspectRatio") {
    return {
      size: "",
      aspectRatio: composer.aspectRatio || "",
    };
  }
  return {
    size: composer.size || "",
    aspectRatio: composer.aspectRatio || "",
  };
}

function resolveSelectedModelLabel(selectedModel: string) {
  if (!selectedModel) return "-";
  const [providerId, modelId] = selectedModel.split("::");
  if (!providerId || !modelId) return selectedModel;
  const provider = settingsStore.enabledProviders.find((item) => item.id === providerId);
  if (!provider) return selectedModel;
  return `${provider.name} / ${modelId}`;
}

function schedulePersistComposerConfig() {
  if (composerPersistTimer) clearTimeout(composerPersistTimer);
  composerPersistTimer = setTimeout(async () => {
    composerPersistTimer = null;
    const workspaceId = activeWorkspaceId.value;
    if (!workspaceId) return;
    await window.ipc("imageWorkspace:updateLastComposer", {
      workspaceId,
      lastComposer: serializeComposerConfig(),
    });
  }, 220);
}

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}-${Date.now().toString(36)}`;
}

function fillRandomSeed() {
  const { min, max } = seedRange.value;
  const value = Math.floor(Math.random() * (max - min + 1)) + min;
  composer.seed = value;
}

function normalizeSeedValue(value: unknown): number | null {
  if (value === "" || value == null) return null;
  const parsed = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isFinite(parsed)) return null;
  const { min, max } = seedRange.value;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

function handleSeedInput(value: unknown) {
  composer.seed = normalizeSeedValue(value);
}

function getNextWorkspaceName() {
  const nums = workspaces.value
    .map((item) => new RegExp(`^${t("image.workspace.namePrefix")}(\\d+)$`).exec(item.name)?.[1])
    .filter((value): value is string => !!value)
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
  const max = nums.length > 0 ? Math.max(...nums) : 0;
  return `${t("image.workspace.namePrefix")}${max + 1}`;
}

function resetNewCustomParamForm() {
  newCustomParam.key = "";
  newCustomParam.type = "string-input";
  newCustomParam.optionsText = "";
}

function normalizeSelectValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "value" in (value as Record<string, unknown>)) {
    return String((value as Record<string, unknown>).value ?? "");
  }
  return String(value ?? "");
}

function handleNewCustomParamTypeChange(value: unknown) {
  const nextType = normalizeSelectValue(value) as typeof newCustomParam.type;
  if (nextType !== "select") return;
  setTimeout(() => {
    newCustomParamOptionsTextareaRef.value?.textareaRef?.focus();
  }, 200);
}

function openAddCustomParamModal() {
  if (!selectedModelOption.value) {
    toast.warn(t("image.workspace.warn.selectModelFirst"));
    return;
  }
  resetNewCustomParamForm();
  addCustomParamOpen.value = true;
}

function buildCustomParamSchemaFromModal(): ProviderOptionFieldSchema {
  const key = newCustomParam.key.trim();
  if (newCustomParam.type === "select") {
    const lines = newCustomParam.optionsText
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean);
    const options = lines
      .map((line) => {
        const eqIndex = line.indexOf("=");
        if (eqIndex < 0) return { label: line, value: line };
        const label = line.slice(0, eqIndex).trim();
        const value = line.slice(eqIndex + 1).trim();
        return { label: label || value, value: value || label };
      })
      .filter((item) => item.label && item.value);
    return { key, type: "select", ui: { component: "select" }, options };
  }
  if (newCustomParam.type === "number-input") return { key, type: "number", ui: { component: "input" } };
  if (newCustomParam.type === "boolean-switch") return { key, type: "boolean", ui: { component: "switch" } };
  if (newCustomParam.type === "json-textarea") return { key, type: "json", ui: { component: "textarea" } };
  if (newCustomParam.type === "string-textarea") return { key, type: "string", ui: { component: "textarea" } };
  return { key, type: "string", ui: { component: "input" } };
}

async function submitNewCustomParam() {
  const model = selectedModelOption.value;
  if (!model) {
    toast.warn(t("image.workspace.warn.modelUnavailable"));
    return;
  }
  const key = newCustomParam.key.trim();
  if (!/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(key)) {
    toast.warn(t("image.workspace.warn.invalidFieldName"));
    return;
  }

  const currentSchema = customParamSchema.value;
  if (currentSchema.some((item) => item.key === key)) {
    toast.warn(t("image.workspace.warn.fieldNameExists"));
    return;
  }
  if (newCustomParam.type === "select") {
    const lines = newCustomParam.optionsText
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean);
    if (lines.length === 0) {
      toast.warn(t("image.workspace.warn.selectNeedsOptions"));
      return;
    }
  }

  const schemaItem = buildCustomParamSchemaFromModal();
  if (schemaItem.type === "select" && (!schemaItem.options || schemaItem.options.length === 0)) {
    toast.warn(t("image.workspace.warn.invalidSelectOptions"));
    return;
  }

  try {
    const details = await settingsStore.getModelDetails(model.providerId, model.modelId) as { imageOptionSchema?: ProviderOptionFieldSchema[] } | null;
    const nextSchema = [...(details?.imageOptionSchema || []), schemaItem];
    await settingsStore.updateModelDetails(model.providerId, model.modelId, { imageOptionSchema: nextSchema });
    syncComposerProviderOptionsBySchema();
    addCustomParamOpen.value = false;
  } catch (error) {
    toast.warn(error instanceof Error ? error.message : String(error));
  }
}

async function createWorkspace() {
  const workspace = await window.ipc("imageWorkspace:create", {
    name: getNextWorkspaceName(),
    lastComposer: serializeComposerConfig(),
  });
  workspaces.value = [{ ...workspace, groups: [] }, ...workspaces.value];
  activeWorkspaceId.value = workspace.id;
}

async function removeWorkspace(workspaceId: string) {
  if (workspaces.value.length <= 1) return;
  const workspace = workspaces.value.find((item) => item.id === workspaceId);
  if (!workspace) return;
  const confirmed = await confirm({
    title: t("image.workspace.deleteWorkspaceConfirmTitle"),
    content: t("image.workspace.deleteWorkspaceConfirmContent", { name: workspace.name }),
    confirmText: t("common.delete"),
    confirmColor: "error",
  });
  if (!confirmed) return;
  await window.ipc("imageWorkspace:delete", { workspaceId });
  delete promptCacheByWorkspaceId.value[workspaceId];
  persistPromptCache();
  const nextState = removeImageWorkspaceFromState(workspaces.value, workspaceId, activeWorkspaceId.value);
  workspaces.value = nextState.workspaces as Workspace[];
  activeWorkspaceId.value = nextState.activeWorkspaceId;
}

function handleSelectWorkspace(workspaceId: string) {
  activeWorkspaceId.value = workspaceId;
}

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
  await window.ipc("imageWorkspace:rename", { workspaceId, name: nextName });
  workspaces.value = workspaces.value.map((item) =>
    item.id === workspaceId ? { ...item, name: nextName, updatedAt: now() } : item
  );
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
        color: "error",
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

function workspaceSecondaryLine(workspace: Workspace) {
  const groupCount = workspace.groups.length;
  const imageCount = workspace.groups.reduce((total, group) => total + group.images.length, 0);
  if (groupCount === 0) return t("image.workspace.empty");
  return t("image.workspace.summary", { groups: groupCount, images: imageCount });
}

function formatWorkspaceUpdatedAt(ts?: number) {
  if (!ts) return "";
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return "";
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
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

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x || 1;
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

function parseAspectRatioText(input?: string): { width: number; height: number } | null {
  if (!input) return null;
  const matched = input.trim().match(/^(\d+)\s*[:x*X]\s*(\d+)$/);
  if (!matched) return null;
  const width = Number(matched[1]);
  const height = Number(matched[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  return { width, height };
}

function fitBoxByAspect(width: number, height: number, maxWidth = IMAGE_PREVIEW_MAX_WIDTH, maxHeight = IMAGE_PREVIEW_MAX_HEIGHT) {
  const scale = Math.min(maxWidth / width, maxHeight / height, 1);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function inferRunRatio(run: ImageRun) {
  const fromSize = parseAspectRatioText(run.params?.size);
  if (fromSize) return fromSize;
  const fromAspect = parseAspectRatioText(run.params?.aspectRatio);
  if (fromAspect) return fromAspect;
  return null;
}

function imageBoxStyle(image: ImageAsset) {
  const width = Number(image.width);
  const height = Number(image.height);
  if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
    const box = fitBoxByAspect(width, height);
    return { width: `${box.width}px`, height: `${box.height}px` };
  }
  return { width: `${IMAGE_PREVIEW_FALLBACK}px`, height: `${IMAGE_PREVIEW_FALLBACK}px` };
}

function runPlaceholderStyle(run: ImageRun) {
  const ratio = inferRunRatio(run);
  if (!ratio) {
    return { width: `${IMAGE_PREVIEW_FALLBACK}px`, height: `${IMAGE_PREVIEW_FALLBACK}px` };
  }
  const box = fitBoxByAspect(ratio.width, ratio.height);
  return { width: `${box.width}px`, height: `${box.height}px` };
}

function summarizeGroupFromRuns(group: ImageGroup): ImageGroup {
  const latestRun = group.runs[group.runs.length - 1];
  if (!latestRun) return group;
  return {
    ...group,
    prompt: latestRun.prompt,
    status: latestRun.status,
    selectedModel: latestRun.selectedModel,
    params: latestRun.params,
    errorMessage: latestRun.errorMessage,
    warningMessage: latestRun.warningMessage,
  };
}

function imagesByRun(group: ImageGroup, run: ImageRun) {
  return group.images.filter((item) => item.runId === run.id);
}

function runPlaceholderSlots(group: ImageGroup, run: ImageRun) {
  const target = Math.max(1, Number(run.params?.count || 1));
  const existed = imagesByRun(group, run).length;
  if (run.status === "running" || run.status === "queued") {
    return Array.from({ length: Math.max(0, target - existed) }, (_, idx) => idx + 1);
  }
  if ((run.status === "failed" || run.status === "cancelled") && existed === 0) {
    return [1];
  }
  return [];
}

function setGroupStatus(groupId: string, status: GenerationStatus, patch: Partial<ImageGroup> = {}, runId?: string) {
  let changed = false;
  workspaces.value = workspaces.value.map((workspace) => {
    if (!workspace.groups.some((group) => group.id === groupId)) return workspace;
    changed = true;
    return {
      ...workspace,
      updatedAt: now(),
      groups: workspace.groups.map((group) => {
        if (group.id !== groupId) return group;
        const nextRuns = runId
          ? group.runs.map((run) => (
              run.id === runId
                ? { ...run, status, errorMessage: patch.errorMessage, warningMessage: patch.warningMessage, updatedAt: now() }
                : run
            ))
          : group.runs;
        return summarizeGroupFromRuns({ ...group, status, ...patch, runs: nextRuns });
      }),
      lastComposer: serializeComposerConfig(),
    };
  });
  if (!changed) return;
}

async function abortRun(group: ImageGroup, run: ImageRun) {
  const result = await window.ipc("imageGeneration:abort", { generationId: group.id }) as { ok: boolean; error?: string };
  if (!result?.ok) {
    toast.warn(result?.error || t("image.workspace.warn.cancelFailed"));
    return;
  }
  setGroupStatus(group.id, "cancelled", {}, run.id);
}

function getActiveGroup(groupId: string) {
  for (const workspace of workspaces.value) {
    const group = workspace.groups.find((item) => item.id === groupId);
    if (group) return group;
  }
  return null;
}

function selectImage(group: ImageGroup, imageId: string) {
  selectedGroupId.value = group.id;
  selectedImageId.value = imageId;
  detailModalOpen.value = true;
}

function clearSelection() {
  detailModalOpen.value = false;
  selectedGroupId.value = "";
  selectedImageId.value = "";
}

onClickOutside(
  detailAsideRef,
  (event) => {
    if (!detailModalOpen.value) return;
    const middle = canvasScrollRef.value;
    if (middle && middle.contains(event.target as Node)) clearSelection();
  },
  { ignore: ["[data-image-thumb]"] }
);

function openImagePreview(image: ImageAsset) {
  if (!window.imagePreview?.open) return;
  const src = resolveImageDisplaySrc(image);
  if (src) {
    window.imagePreview.open({ src });
    return;
  }
  if (image.filePath) window.imagePreview.open({ filePath: image.filePath });
}

async function downloadImage(image: ImageAsset) {
  if (!window.imageAsset?.download) return;
  const src = resolveImageDisplaySrc(image);
  const payload = src ? { src } : image.filePath ? { filePath: image.filePath } : null;
  if (!payload) return;
  const result = await window.imageAsset.download(payload);
  if (!result?.ok) {
    toast.warn(result?.error || t("image.workspace.warn.downloadFailed"));
  }
}

async function copyImage(image: ImageAsset) {
  if (!window.imageAsset?.copy) return;
  const src = resolveImageDisplaySrc(image);
  const payload = src ? { src } : image.filePath ? { filePath: image.filePath } : null;
  if (!payload) return;
  const result = await window.imageAsset.copy(payload);
  if (!result?.ok) {
    toast.warn(result?.error || t("contentExport.copyFailed"));
  }
}

async function removeImage(image: ImageAsset) {
  const workspace = activeWorkspace.value;
  if (!workspace) return;
  const targetGroupIndex = workspace.groups.findIndex((item) => item.images.some((asset) => asset.id === image.id));
  if (targetGroupIndex < 0) return;
  const group = workspace.groups[targetGroupIndex];
  const removalAction = resolveImageRemovalAction(group.status, group.images.length);
  if (removalAction === "noop") return;

  const confirmed = await confirm({
    title: t("image.workspace.deleteConfirmTitle"),
    content: t("image.workspace.deleteConfirmContent"),
    confirmText: t("common.delete"),
    confirmColor: "error",
  });
  if (!confirmed) return;

  const isRemovingSelected = selectedImageId.value === image.id;

  if (removalAction === "delete-group") {
    const result = await window.ipc("imageGeneration:delete", { generationId: group.id }) as { ok: boolean; error?: string };
    if (!result?.ok) {
      toast.warn(result?.error || t("settings.modelService.deleteFailed"));
      return;
    }
  } else {
    const result = await window.ipc("imageAsset:delete", { linkId: image.id }) as { ok: boolean; error?: string };
    if (!result?.ok) {
      toast.warn(result?.error || t("settings.modelService.deleteFailed"));
      return;
    }
  }

  let nextGroups: ImageGroup[];
  if (removalAction === "delete-group") {
    nextGroups = workspace.groups.filter((item) => item.id !== group.id);
  } else {
    const targetGroup = workspace.groups[targetGroupIndex];
    const nextImages = targetGroup.images.filter((item) => item.id !== image.id);
    nextGroups = [...workspace.groups];
    nextGroups[targetGroupIndex] = { ...targetGroup, images: nextImages };
  }
  workspaces.value = workspaces.value.map((item) =>
    item.id === workspace.id ? { ...item, updatedAt: now(), groups: nextGroups } : item
  );

  if (isRemovingSelected) {
    const nextSelection = clearImageSelectionAfterRemoval(selectedGroupId.value, selectedImageId.value, group.id, image.id);
    selectedGroupId.value = nextSelection.selectedGroupId;
    selectedImageId.value = nextSelection.selectedImageId;
  }
}

function reuseGroup(group: ImageGroup) {
  const reuseState = buildImageReuseComposerState(group, uid);
  composer.prompt = reuseState.composer.prompt;
  const nextTask = reuseState.activeTask;
  if (activeTask.value !== nextTask) {
    suppressTaskWatch = true;
    activeTask.value = nextTask;
    suppressTaskWatch = false;
  }
  composer.taskType = reuseState.composer.taskType;
  composer.modelKey = reuseState.composer.modelKey;
  composer.aspectRatio = reuseState.composer.aspectRatio;
  composer.size = reuseState.composer.size;
  composer.quality = reuseState.composer.quality;
  composer.count = reuseState.composer.count;
  composer.seed = normalizeSeedValue(reuseState.composer.seed);
  composer.negativePrompt = reuseState.composer.negativePrompt;
  composer.promptExtend = reuseState.composer.promptExtend;
  composer.watermark = reuseState.composer.watermark;
  composer.editFunction = reuseState.composer.editFunction;
  composer.providerOptions = { ...reuseState.composer.providerOptions };
  composer.referenceImages = [...reuseState.composer.referenceImages];
  composer.maskImage = reuseState.composer.maskImage ? { ...reuseState.composer.maskImage } : null;
  syncTaskConfigFromComposer();
  selectedGroupId.value = reuseState.selection.selectedGroupId;
  selectedImageId.value = reuseState.selection.selectedImageId;
}

function buildResultImages(result: {
  assets: Array<{ id: string; assetId?: string; filePath: string; mediaType: string; width?: number; height?: number; sortOrder: number; createdAt: number }>;
  run?: {
    id: string;
    prompt: string;
    selectedModel: string;
    params: Omit<ComposerState, "prompt">;
    status: GenerationStatus;
    createdAt?: number;
    startedAt?: number;
    completedAt?: number;
    durationMs?: number;
  };
}) {
  return (result.assets || []).map((asset) => ({
    id: asset.id,
    assetId: asset.assetId,
    filePath: asset.filePath,
    mediaType: asset.mediaType,
    width: asset.width,
    height: asset.height,
    createdAt: asset.createdAt,
    url: toAssetUrl(asset.assetId),
    runId: result.run?.id,
    runPrompt: result.run?.prompt,
    runSelectedModel: result.run?.selectedModel,
    runParams: result.run?.params,
    runStatus: result.run?.status || "succeeded",
    runCreatedAt: result.run?.createdAt,
    runStartedAt: result.run?.startedAt,
    runCompletedAt: result.run?.completedAt,
  }));
}

function createLocalPendingRun(input: {
  prompt: string;
  selectedModel: string;
  params: Omit<ComposerState, "prompt">;
}): ImageRun {
  const ts = now();
  return {
    id: `local-run-${uid("pending")}`,
    prompt: input.prompt,
    status: "running",
    selectedModel: input.selectedModel,
    params: { ...input.params },
    createdAt: ts,
    updatedAt: ts,
    startedAt: ts,
  };
}

async function startRunForGroup(input: {
  workspaceId: string;
  group: ImageGroup;
  prompt: string;
  selectedModel: string;
  params: Omit<ComposerState, "prompt">;
  replaceFailedRunId?: string;
}) {
  const pendingRun = createLocalPendingRun({
    prompt: input.prompt,
    selectedModel: input.selectedModel,
    params: toPlainIpcPayload(input.params),
  });
  workspaces.value = workspaces.value.map((workspace) => {
    if (!workspace.groups.some((group) => group.id === input.group.id)) return workspace;
    return {
      ...workspace,
      updatedAt: now(),
      groups: workspace.groups.map((group) => {
        if (group.id !== input.group.id) return group;
        const runs = input.replaceFailedRunId
          ? group.runs.map((run) => (run.id === input.replaceFailedRunId ? pendingRun : run))
          : [...group.runs, pendingRun];
        return summarizeGroupFromRuns({ ...group, runs, status: "running" });
      }),
    };
  });
  selectedGroupId.value = input.group.id;

  try {
    const plainParams = toPlainIpcPayload(input.params);
    const result = await window.ipc("imageGeneration:run", {
      workspaceId: input.workspaceId,
      generationId: input.group.id,
      selectedModel: input.selectedModel,
      prompt: input.prompt,
      params: {
        taskType: plainParams.taskType,
        count: plainParams.count,
        size: plainParams.size || undefined,
        aspectRatio: plainParams.aspectRatio || undefined,
        quality: plainParams.quality || undefined,
        seed: plainParams.seed ?? undefined,
        negativePrompt: plainParams.negativePrompt || undefined,
        promptExtend: plainParams.promptExtend,
        watermark: plainParams.watermark,
        editFunction: plainParams.editFunction || undefined,
        providerOptions: Object.keys(plainParams.providerOptions || {}).length > 0 ? plainParams.providerOptions : undefined,
        referenceImages: plainParams.referenceImages.map((item) => ({ id: item.id, name: item.name, url: item.url })),
        maskImage: plainParams.maskImage ? { id: plainParams.maskImage.id, name: plainParams.maskImage.name, url: plainParams.maskImage.url } : undefined,
      },
    }) as {
      assets: Array<{ id: string; assetId?: string; filePath: string; mediaType: string; width?: number; height?: number; sortOrder: number; createdAt: number }>;
      warnings?: string[];
      run?: {
        id: string;
        prompt: string;
        selectedModel: string;
        params: Omit<ComposerState, "prompt">;
        status: GenerationStatus;
        createdAt?: number;
        startedAt?: number;
        completedAt?: number;
        durationMs?: number;
      };
    };

    const latest = getActiveGroup(input.group.id) ?? input.group;
    const nextImages = [
      ...(latest.images || []),
      ...buildResultImages(result),
    ];
    const nextRun: ImageRun = {
      id: result.run?.id || pendingRun.id,
      prompt: result.run?.prompt || input.prompt,
      status: result.run?.status || "succeeded",
      selectedModel: result.run?.selectedModel || input.selectedModel,
      params: result.run?.params || plainParams,
      warningMessage: Array.isArray(result.warnings) && result.warnings.length > 0 ? result.warnings.join("\n") : undefined,
      createdAt: result.run?.createdAt || pendingRun.createdAt,
      updatedAt: now(),
      startedAt: result.run?.startedAt || pendingRun.startedAt,
      completedAt: result.run?.completedAt || now(),
    };

    workspaces.value = workspaces.value.map((workspace) => {
      if (!workspace.groups.some((group) => group.id === input.group.id)) return workspace;
      return {
        ...workspace,
        updatedAt: now(),
        groups: workspace.groups.map((group) => {
          if (group.id !== input.group.id) return group;
          const runs = group.runs.map((run) => (run.id === pendingRun.id ? nextRun : run));
          return summarizeGroupFromRuns({
            ...group,
            images: nextImages,
            runs,
            warningMessage: nextRun.warningMessage,
            errorMessage: undefined,
            status: "succeeded",
          });
        }),
      };
    });

    const addedFirst = buildResultImages(result)[0];
    if (addedFirst?.id) selectedImageId.value = addedFirst.id;
  } catch (error) {
    const failedMessage = error instanceof Error ? error.message : String(error);
    const cancelled = isAbortLikeError(error);
    workspaces.value = workspaces.value.map((workspace) => {
      if (!workspace.groups.some((group) => group.id === input.group.id)) return workspace;
      return {
        ...workspace,
        updatedAt: now(),
        groups: workspace.groups.map((group) => {
          if (group.id !== input.group.id) return group;
          const runs = group.runs.map((run) => (
            run.id === pendingRun.id
              ? { ...run, status: cancelled ? "cancelled" : "failed", errorMessage: cancelled ? undefined : failedMessage, updatedAt: now(), completedAt: now() }
              : run
          ));
          return summarizeGroupFromRuns({ ...group, runs });
        }),
      };
    });
    if (!cancelled) toast.warn(failedMessage);
  }
}

function regenerateRun(group: ImageGroup, run: ImageRun) {
  const workspaceId = activeWorkspaceId.value;
  if (!workspaceId) return;
  if (run.status === "running" || run.status === "queued") return;
  const snapshot = { ...run.params, seed: Math.floor(Math.random() * 1_000_000_000) };
  void startRunForGroup({
    workspaceId,
    group,
    prompt: run.prompt,
    selectedModel: run.selectedModel,
    params: snapshot,
  });
}

function retryRun(group: ImageGroup, run: ImageRun) {
  const retryInput = buildImageRetryRunInput(activeWorkspaceId.value, group.id, run);
  if (!retryInput) return;
  void startRunForGroup({
    workspaceId: retryInput.workspaceId,
    group,
    prompt: retryInput.prompt,
    selectedModel: retryInput.selectedModel,
    params: retryInput.params as Omit<ComposerState, "prompt">,
    replaceFailedRunId: retryInput.replaceFailedRunId,
  });
}

function regenerateGroup(group: ImageGroup) {
  const latestRun = group.runs[group.runs.length - 1];
  if (!latestRun) return;
  regenerateRun(group, latestRun);
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

async function copyNegativePromptHint() {
  const text = t("image.workspace.negativePromptHintExample");
  try {
    await navigator.clipboard.writeText(text);
    negativeHintCopied.value = true;
    if (negativeHintCopiedTimer) clearTimeout(negativeHintCopiedTimer);
    negativeHintCopiedTimer = setTimeout(() => {
      negativeHintCopied.value = false;
      negativeHintCopiedTimer = null;
    }, 1200);
  } catch {
    // 静默失败，不弹 toast
  }
}

function openReferencePicker() {
  if (!showSourceImagesInput.value) return;
  referenceFileInputRef.value?.click();
}

function openMaskPicker() {
  if (!showMaskInput.value) return;
  maskFileInputRef.value?.click();
}

function removeReferenceImage(index: number) {
  composer.referenceImages = composer.referenceImages.filter((_, idx) => idx !== index);
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error ?? new Error("read file failed"));
    reader.readAsDataURL(file);
  });
}

function buildDataUrlFromBase64(base64: string, mediaType: string) {
  return `data:${mediaType || "image/png"};base64,${base64}`;
}

async function handleReferenceFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files ?? []);
  input.value = "";
  if (!showSourceImagesInput.value || files.length === 0) return;

  const remain = Math.max(0, sourceImageMax.value - composer.referenceImages.length);
  if (remain <= 0) {
    toast.warn(t("image.workspace.warn.maxUploadImages", { count: sourceImageMax.value }));
    return;
  }

  const selected = files.filter((file) => file.type.startsWith("image/")).slice(0, remain);
  if (selected.length < files.length) {
    toast.warn(t("image.workspace.warn.keepFirstImages", { count: selected.length }));
  }

  const next: ComposerImageRef[] = [];
  for (const file of selected) {
    try {
      const url = await readFileAsDataUrl(file);
      next.push({ id: uid("ref"), name: file.name, url });
    } catch {
      // ignore single file read failures
    }
  }

  if (next.length > 0) {
    composer.referenceImages = [...composer.referenceImages, ...next].slice(0, sourceImageMax.value);
  }
}

function removeMaskImage() {
  composer.maskImage = null;
}

async function handleMaskFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!showMaskInput.value || !file || !file.type.startsWith("image/")) return;
  try {
    const url = await readFileAsDataUrl(file);
    composer.maskImage = { id: uid("mask"), name: file.name, url };
  } catch {
    toast.warn(t("image.workspace.warn.readMaskFailed"));
  }
}

async function toEditableImageUrl(image: ImageAsset): Promise<string | null> {
  if (typeof image.url === "string" && image.url.startsWith("data:")) {
    return image.url;
  }
  if (typeof image.filePath === "string" && image.filePath.length > 0) {
    const result = await window.imageAsset.readFile({ filePath: image.filePath });
    if (result?.ok && result.base64) {
      return buildDataUrlFromBase64(result.base64, result.mediaType || image.mediaType || "image/png");
    }
    return null;
  }
  if (typeof image.url === "string" && /^https?:\/\//i.test(image.url)) {
    return image.url;
  }
  return null;
}

async function useImageForEditing(image: ImageAsset) {
  const imageUrl = await toEditableImageUrl(image);
  if (!imageUrl) {
    toast.warn(t("image.workspace.warn.imageNotEditable"));
    return;
  }
  if (activeTask.value !== "edit") {
    activeTask.value = "edit";
  }
  composer.taskType = "edit";
  composer.referenceImages = [
    {
      id: uid("ref"),
      name: image.filePath ? image.filePath.split(/[\\/]/).pop() || "source-image" : "source-image",
      url: imageUrl,
    },
  ];
  composer.maskImage = null;
  syncTaskConfigFromComposer();
  if (!modelSupportsEditTask.value) {
    toast.warn(t("image.workspace.warn.modelNoEditSupport"));
  }
}

function buildProviderOptionsForRequest() {
  const schema = customParamSchema.value;
  if (schema.length === 0) return undefined;
  const next: Record<string, unknown> = {};
  for (const field of schema) {
    const raw = composer.providerOptions[field.key];
    if (raw === undefined || raw === null || raw === "") continue;
    if (field.type === "json" && typeof raw === "string") {
      try {
        setPathValue(next, field.key, JSON.parse(raw));
      } catch {
        throw new Error(t("image.workspace.invalidCustomParamJson", { field: field.label || field.key }));
      }
      continue;
    }
    setPathValue(next, field.key, raw);
  }
  return Object.keys(next).length > 0 ? next : undefined;
}

async function submitGeneration() {
  const workspace = activeWorkspace.value;
  if (!workspace) {
    toast.warn(t("image.workspace.warn.workspaceUnavailable"));
    return;
  }
  const prompt = composer.prompt.trim();
  if (!prompt) {
    toast.warn(t("image.workspace.warn.enterPrompt"));
    return;
  }
  if (!composer.modelKey) {
    toast.warn(t("image.workspace.warn.selectModelFirst"));
    return;
  }
  if (composer.modelKey === DEFAULT_MODEL_PLACEHOLDER && !getDefaultImageModelByTask(activeTask.value)) {
    toast.warn(activeTask.value === "edit" ? t("image.workspace.warn.setDefaultEditModel") : t("image.workspace.warn.setDefaultGenerateModel"));
    return;
  }
  if (!selectedModelOption.value) {
    toast.warn(t("image.workspace.warn.modelUnavailableWithConfig"));
    return;
  }
  if (activeTask.value === "generate" && !modelSupportsGenerateTask.value) {
    toast.warn(t("image.workspace.warn.modelNoGenerateSupport"));
    return;
  }
  if (activeTask.value === "edit") {
    if (!modelSupportsEditTask.value) {
      toast.warn(t("image.workspace.warn.modelNoEditSupportSimple"));
      return;
    }
    if (composer.referenceImages.length === 0) {
      toast.warn(t("image.workspace.warn.editNeedsSourceImage"));
      return;
    }
  }

  try {
    const effectiveSizeParams = getEffectiveSizeParams();
    const providerOptions = buildProviderOptionsForRequest();
    const normalizedSeed = normalizeSeedValue(composer.seed);
    composer.seed = normalizedSeed;
    const snapshot: Omit<ComposerState, "prompt"> = {
      taskType: activeTask.value,
      modelKey: composer.modelKey,
      aspectRatio: effectiveSizeParams.aspectRatio,
      size: effectiveSizeParams.size,
      quality: composer.quality,
      count: composer.count,
      seed: normalizedSeed,
      negativePrompt: composer.negativePrompt,
      promptExtend: composer.promptExtend,
      watermark: composer.watermark,
      editFunction: composer.editFunction,
      providerOptions: providerOptions ? { ...providerOptions } : {},
      referenceImages: [...composer.referenceImages],
      maskImage: composer.maskImage ? { ...composer.maskImage } : null,
    };
    const plainSnapshot = toPlainIpcPayload(snapshot);
    const selectedModel = selectedModelOption.value
      ? `${selectedModelOption.value.providerId}::${selectedModelOption.value.modelId}`
      : composer.modelKey;

    const created = await window.ipc("imageGeneration:create", {
      workspaceId: workspace.id,
      prompt,
      status: "queued",
      selectedModel,
      params: plainSnapshot,
    }) as ImageGroup & { workspaceId: string };

    workspaces.value = appendCreatedImageGroup(
      workspaces.value,
      workspace.id,
      { ...created, images: [], runs: [] },
      now(),
      serializeComposerConfig()
    ) as Workspace[];
    scrollCanvasToBottom();
    selectedGroupId.value = created.id;
    selectedImageId.value = "";

    updatePromptDraft(workspace.id, activeTask.value, "");
    composer.prompt = "";
    persistPromptCache();
    const createdGroup = (getActiveGroup(created.id) ?? { ...created, images: [], runs: [] }) as ImageGroup;
    void startRunForGroup({
      workspaceId: workspace.id,
      group: createdGroup,
      prompt,
      selectedModel,
      params: plainSnapshot,
    });
  } catch (error) {
    toast.warn(error instanceof Error ? error.message : String(error));
  }
}

if (!composer.modelKey) {
  composer.modelKey = DEFAULT_MODEL_PLACEHOLDER;
}

onMounted(async () => {
  promptCacheByWorkspaceId.value = loadPromptCache();
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
    toast.warn(t("image.workspace.warn.workspaceUnavailable"));
  }
});

onBeforeUnmount(() => {
  if (negativeHintCopiedTimer) clearTimeout(negativeHintCopiedTimer);
  if (composerPersistTimer) clearTimeout(composerPersistTimer);
  if (promptPersistTimer) clearTimeout(promptPersistTimer);
  if (activeWorkspaceId.value) {
    updatePromptDraft(activeWorkspaceId.value, activeTask.value, composer.prompt);
    persistPromptCache();
  }
});
</script>
