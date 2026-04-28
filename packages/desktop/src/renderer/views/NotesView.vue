<template>
  <div class="h-full flex gap-0">
    <section
      :style="listPanelWidthStyle"
      class="relative h-full"
      :class="{ 'transition-[width] duration-200 ease-out': !isListPanelDragging }"
    >
      <div class="h-full rounded-xl rounded-r-none overflow-hidden flex flex-col bg-muted">
        <div class="px-2 pt-3">
          <div
            class="mb-3 text-sm font-medium text-default flex items-center"
            :class="isListPanelCollapsed ? 'justify-center' : 'justify-between'"
          >
            <span v-if="!isListPanelCollapsed" class="ml-3 select-none whitespace-nowrap">{{ t("notes.listPanel.title") }}</span>
            <UTooltip :text="isListPanelCollapsed ? t('notes.common.expand') : t('notes.common.collapse')">
              <UButton
                icon="i-lucide-panel-left"
                variant="ghost"
                color="neutral"
                size="sm"
                square
                class="shrink-0"
                @click="toggleListPanel"
              />
            </UTooltip>
          </div>
        </div>

        <div class="flex flex-col px-1 overflow-x-hidden">
          <UList
            :items="fixedListItems"
            :model-value="selectedListKey"
            value-key="id"
            label-key="label"
            size="lg"
            gap="none"
            padding="none"
            @select="handleSelectList"
          >
            <template #item="{ item }">
              <UTooltip :text="item.label" :content="{ side: 'right' }" :disabled="!isListPanelCollapsed">
                <div class="flex justify-center items-center gap-2 flex-1 min-w-0">
                  <UIcon :name="item.icon" class="w-4 h-4 shrink-0" />
                  <span
                    v-if="!isListPanelCollapsed"
                    class="text-sm flex-1 min-w-0 whitespace-nowrap overflow-hidden transition-all duration-100"
                    :style="{ transitionDelay: '100ms' }"
                  >
                    {{ item.label }}
                  </span>
                </div>
              </UTooltip>
            </template>

            <template v-if="!isListPanelCollapsed" #item-trailing="{ item }">
              <span class="text-xs text-muted tabular-nums">{{ item.count }}</span>
            </template>
          </UList>

          <USeparator class="my-2" />

          <div
            class="overflow-hidden transition-all duration-100"
            :class="isListPanelCollapsed ? 'opacity-0 h-0' : 'opacity-100'"
            :style="{
              pointerEvents: isListPanelCollapsed ? 'none' : 'auto',
              transitionDelay: isListPanelCollapsed ? '0ms' : '100ms'
            }"
          >
            <div class="pl-2 pr-1 py-1 flex items-center justify-between gap-2">
              <div class="flex items-center gap-1 min-w-0">
                <span class="text-xs text-toned font-medium">{{ t("notes.listPanel.title") }}</span>
                <span class="text-xs text-muted">({{ customListItems.length }})</span>
              </div>
              <UTooltip :text="t('notes.listPanel.newList')">
                <UButton
                  icon="i-lucide-plus"
                  variant="ghost"
                  color="neutral"
                  size="xs"
                  square
                  @click="openCreateListModal"
                />
              </UTooltip>
            </div>
          </div>
        </div>

        <div class="flex-1 overflow-y-auto overflow-x-hidden px-1 pb-2">
          <UList
            :items="customListItems"
            :model-value="selectedListKey"
            value-key="id"
            label-key="name"
            size="lg"
            gap="none"
            padding="none"
            @select="handleSelectList"
          >
            <template #item="{ item }">
              <UTooltip :text="item.name" :content="{ side: 'right' }" :disabled="!isListPanelCollapsed">
                <div class="flex justify-center items-center gap-2 flex-1 min-w-0">
                  <UIcon
                    :name="item.icon || DEFAULT_ICON"
                    class="w-4 h-4 shrink-0"
                    :style="{ color: item.color || DEFAULT_COLOR }"
                  />
                  <div
                    v-if="!isListPanelCollapsed"
                    class="flex-1 min-w-0 transition-all duration-100"
                    :style="{ transitionDelay: '100ms' }"
                  >
                    <UText :text="item.name" class="text-sm whitespace-nowrap overflow-hidden" />
                  </div>
                </div>
              </UTooltip>
            </template>

            <template v-if="!isListPanelCollapsed" #item-trailing="{ item }">
              <div class="relative flex items-center justify-end">
                <div
                  class="text-xs text-muted tabular-nums transition-opacity group-hover:opacity-0"
                  :class="{ 'opacity-0': openListMenuId === item.id }"
                >
                  {{ stats.byList[item.id] || 0 }}
                </div>

                <div
                  class="absolute right-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  :class="{ 'opacity-100': openListMenuId === item.id }"
                >
                  <UDropdownMenu
                    :items="getCustomListMenuItems(item)"
                    size="md"
                    @update:open="setListMenuOpen(item.id, $event)"
                  >
                    <UButton icon="i-lucide-more-horizontal" variant="ghost" color="neutral" size="sm" square @click.stop />
                  </UDropdownMenu>
                </div>
              </div>
            </template>
          </UList>
        </div>
      </div>

      <PanelResizeHandle
        variant="edge"
        :active="isListPanelDragging"
        :disabled="isListPanelCollapsed"
        :value="listPanelWidth"
        :min="listPanelMinWidth"
        :max="listPanelMaxWidth"
        :cursor="listPanelResizeCursor"
        @resize-start="startListPanelResize"
        @resize-by="resizeListPanelBy"
        @reset="resetListPanelWidth"
      />
    </section>

    <section
      :style="notePanelWidthStyle"
      class="relative h-full"
      :class="{ 'transition-[width] duration-200 ease-out': !isNotePanelDragging }"
    >
      <div class="h-full bg-default rounded-r-xl overflow-hidden flex flex-col">
        <div class="px-2 pt-3 pb-2">
          <div
            class="mb-3 text-sm font-medium text-default flex items-center"
            :class="isNotePanelCollapsed ? 'justify-center' : 'justify-between'"
          >
            <span v-if="!isNotePanelCollapsed" class="ml-3 select-none whitespace-nowrap">
              {{ currentListTitle }}
            </span>
            <UTooltip :text="isNotePanelCollapsed ? t('notes.common.expand') : t('notes.common.collapse')" :kbds="['meta', 'b']">
              <UButton
                icon="i-lucide-panel-left"
                variant="ghost"
                color="neutral"
                size="sm"
                square
                class="shrink-0"
                @click="toggleNotePanel"
              />
            </UTooltip>
          </div>

          <UTooltip :text="t('notes.panel.newNote')" :disabled="!isNotePanelCollapsed" :content="{ side: 'right' }">
            <UButton
              :block="!isNotePanelCollapsed"
              size="lg"
              variant="ghost"
              color="neutral"
              :class="isNotePanelCollapsed ? 'w-full justify-center' : 'justify-start w-full'"
              @click="handleCreateNote"
            >
              <UIcon name="i-lucide-notebook-pen" class="w-4 h-4 shrink-0" />
              <span
                v-if="!isNotePanelCollapsed"
                class="whitespace-nowrap transition-all duration-100"
                :style="{ transitionDelay: '100ms' }"
              >
                {{ t("notes.panel.newNote") }}
              </span>
            </UButton>
          </UTooltip>
        </div>

        <UList
          v-if="!isNotePanelCollapsed && notes.length > 0"
          :items="notes"
          :model-value="selectedNoteId"
          value-key="id"
          label-key="title"
          padding="md"
          gap="none"
          size="lg"
          class="flex-1"
          @select="handleSelectNote"
        >
          <template #item="{ item }">
            <div class="pl-1.5 w-full min-w-0 flex items-start justify-between gap-2">
              <UInput
                v-if="editingNoteId === item.id"
                v-model="editingNoteTitle"
                variant="none"
                autofocus
                size="md"
                class="flex-1 min-w-0"
                :ui="{ base: 'px-0 py-0.5' }"
                @click.stop
                @keydown.enter.prevent="handleSaveInlineNoteTitle(item.id)"
                @keydown.esc.prevent="handleCancelInlineNoteTitle"
                @blur="handleSaveInlineNoteTitle(item.id)"
              />
              <div v-else class="min-w-0 flex-1">
                <div class="flex items-center gap-1">
                  <UTooltip v-if="linkedNoteSessionMap.has(item.id)" :text="t('notes.panel.linkedSession')">
                    <UIcon
                      name="i-lucide-message-square"
                      class="w-3.5 h-3.5 text-dimmed shrink-0 hover:text-default cursor-pointer"
                      @click.stop="router.push({ name: 'chat', params: { sessionId: linkedNoteSessionMap.get(item.id) } })"
                    />
                  </UTooltip>
                  <UText :text="item.title || t('notes.note.untitled')" class="text-sm whitespace-nowrap overflow-hidden" />
                </div>
                <div class="text-xs text-muted truncate mt-0.5">{{ formatPreviewText(item.previewText) || t("notes.note.emptyContent") }}</div>
              </div>
            </div>
          </template>

          <template #item-trailing="{ item }">
            <div v-if="editingNoteId !== item.id" class="relative flex items-center justify-end">
              <div
                class="text-xs text-muted tabular-nums transition-opacity group-hover:opacity-0"
                :class="{ 'opacity-0': openNoteMenuId === item.id }"
              >
                {{ formatListUpdatedAt(item.updatedAt) }}
              </div>

              <div
                class="absolute right-0 opacity-0 group-hover:opacity-100 transition-opacity"
                :class="{ 'opacity-100': openNoteMenuId === item.id }"
              >
                <UDropdownMenu
                  :items="getNoteMenuItems(item)"
                  size="md"
                  @update:open="setNoteMenuOpen(item.id, $event)"
                >
                  <template #note-list-leading="{ item, active, ui }">
                    <UIcon
                      v-if="item.icon"
                      :name="item.icon"
                      :class="ui.itemLeadingIcon({ class: item.ui?.itemLeadingIcon, color: item?.color, active })"
                      :style="item.listColor ? { color: item.listColor } : undefined"
                    />
                  </template>
                  <UButton icon="i-lucide-more-horizontal" variant="ghost" color="neutral" size="sm" square @click.stop />
                </UDropdownMenu>
              </div>
            </div>
          </template>
        </UList>

        <UEmpty
          v-else-if="!isNotePanelCollapsed"
          icon="i-lucide-notebook-pen"
          :title="t('notes.empty.noNote')"
          variant="naked"
          size="sm"
          class="flex-1 flex flex-col items-center justify-center text-center"
        />
      </div>

      <PanelResizeHandle
        variant="gap"
        :active="isNotePanelDragging"
        :disabled="isNotePanelCollapsed"
        :value="notePanelWidth"
        :min="notePanelMinWidth"
        :max="notePanelMaxWidth"
        :cursor="notePanelResizeCursor"
        @resize-start="startNotePanelResize"
        @resize-by="resizeNotePanelBy"
        @reset="resetNotePanelWidth"
      />
    </section>

    <div class="flex-1 min-w-0 ml-[6px] h-full flex gap-0">
      <section
        class="flex-1 min-w-0 h-full flex flex-col bg-default overflow-hidden"
        :class="showAiSidebar ? 'rounded-l-xl relative' : 'rounded-xl relative'"
      >
        <div v-if="!activeNote" class="flex-1 flex items-center justify-center px-6">
          <UEmpty
            icon="i-lucide-file-text"
            :title="t('notes.empty.selectNote')"
            variant="naked"
            size="lg"
          />
        </div>

        <template v-else>
          <div class="h-14 border-b border-default bg-default relative flex items-center justify-between px-4">
            <div class="group px-2.5 py-0.5 rounded-md text-sm text-default flex items-center gap-1.5 min-w-0 hover:bg-elevated transition-colors">
              <UIcon
                :name="activeNoteListIcon"
                class="w-4 h-4 shrink-0"
                :style="{ color: activeNoteListColor }"
              />
              <span class="truncate">{{ activeNoteListName }}</span>

              <div class="opacity-0 group-hover:opacity-100 has-[[data-state=open]]:opacity-100 transition-opacity">
                <UDropdownMenu :items="detailListMenuItems" size="md">
                  <template #note-list-leading="{ item, active, ui }">
                    <UIcon
                      v-if="item.icon"
                      :name="item.icon"
                      :class="ui.itemLeadingIcon({ class: item.ui?.itemLeadingIcon, color: item?.color, active })"
                      :style="item.listColor ? { color: item.listColor } : undefined"
                    />
                  </template>
                  <UButton
                    icon="i-lucide-more-horizontal"
                    variant="ghost"
                    color="neutral"
                    size="md"
                    square
                    @click.stop
                  />
                </UDropdownMenu>
              </div>
            </div>

            <div
              class="absolute left-1/2 -translate-x-1/2 flex items-center gap-1.5 font-medium group px-2.5 py-0.5 rounded-md max-w-[420px]"
              :class="{ 'hover:bg-elevated transition-colors': !isEditingDetailTitle }"
            >
              <UInput
                v-if="isEditingDetailTitle"
                ref="detailTitleInputRef"
                v-model="draftTitle"
                variant="none"
                size="md"
                class="w-[300px]"
                :ui="{ base: 'px-2 py-0.5 text-center' }"
                @blur="handleSaveDetailTitleEdit"
                @keydown.enter.prevent="handleSaveDetailTitleEdit"
                @keydown.esc.prevent="handleCancelDetailTitleEdit"
              />

              <template v-else>
                <span class="text-sm text-default max-w-[300px] truncate">
                  {{ draftTitle || t("notes.note.untitled") }}
                </span>

                <div class="opacity-0 group-hover:opacity-100 transition-opacity">
                  <UTooltip :text="t('notes.detail.editTitle')">
                    <UButton
                      icon="i-lucide-pencil"
                      variant="ghost"
                      color="neutral"
                      size="sm"
                      square
                      @click.stop="handleStartDetailTitleEdit"
                    />
                  </UTooltip>
                </div>
              </template>
            </div>

            <div class="flex items-center gap-1">
              <UButton
                v-if="!showAiSidebar"
                icon="i-lucide-sparkles"
                variant="soft"
                color="neutral"
                size="md"
                @click="showAiSidebar = !showAiSidebar"
              >
                {{ t("notes.detail.aiAssistant") }}
              </UButton>

              <UDropdownMenu :items="activeNoteMenuItems" size="md">
                <UButton icon="i-lucide-more-horizontal" variant="ghost" color="neutral" size="md" square />
              </UDropdownMenu>
            </div>
          </div>

          <div class="flex-1 min-h-0 flex flex-col">
            <div class="flex-1 min-h-0 overflow-hidden">
              <DocumentEditor
                v-if="editorMode === 'visual'"
                ref="noteDocumentEditorRef"
                v-model="draftContentMd"
                placeholder="Write, type '/' for commands..."
                :image-upload="handleEditorImageUpload"
                :show-selection-ai-toolbar="true"
                :ui="{ root: 'h-full min-h-0 flex flex-col overflow-hidden', content: 'flex-1 min-h-0 overflow-y-auto pl-4 py-8 pr-12', base: 'p-4 sm:p-4' }"
                @selection-ai-action="handleEditorSelectionAiAction"
              />
              <SourceEditor
                v-else
                ref="noteSourceEditorRef"
                v-model="draftContentMd"
                language="markdown"
                variant="markdown-writing"
                class="h-full"
                @selection-change="handleSourceEditorSelectionChange"
              />
            </div>

            <div class="h-12 shrink-0 border-t border-default px-4 flex items-center justify-between gap-3">
              <div class="text-xs text-muted min-w-0 truncate">
                {{ t("notes.detail.stats", { count: noteCharCount, createdAt: noteCreatedAtText, updatedAt: noteUpdatedAtText }) }}
              </div>

              <UTabs
                v-model="editorMode"
                :items="editorModeItems"
                :content="false"
                variant="pill"
                color="neutral"
                size="sm"
                class="shrink-0"
              />
            </div>
          </div>

          <PageFindBar
            v-if="isNotesRoute && editorMode === 'visual' && !!activeNote"
            ref="pageFindRef"
            v-model:open="pageFindOpen"
            :get-search-root="getPageFindRoot"
          />
        </template>
      </section>

      <section
        v-if="showAiSidebar"
        :style="aiSidebarWidthStyle"
        class="relative shrink-0 h-full"
      >
        <div class="h-full bg-default rounded-r-xl overflow-hidden flex flex-col border-l border-default">
          <div class="h-14 shrink-0 border-b border-default px-3 flex items-center justify-between">
            <div class="text-sm font-medium text-default flex items-center gap-1.5">
              <UIcon name="i-lucide-sparkles" class="w-4 h-4" />
              {{ t("notes.detail.aiAssistant") }}
            </div>
            <div class="flex items-center gap-1">
              <UTooltip :text="t('notes.ai.newSession')">
                <UButton
                  icon="i-lucide-message-square-plus"
                  variant="ghost"
                  color="neutral"
                  size="sm"
                  square
                  :disabled="!activeNote || aiSending"
                  @click="handleCreateAiSession"
                />
              </UTooltip>
              <UDropdownMenu :items="aiSessionMenuItems" size="sm" :content="{ side: 'bottom', align: 'end' }">
                <UTooltip :text="t('notes.ai.historySessions')">
                  <UButton icon="i-lucide-history" variant="ghost" color="neutral" size="sm" square :disabled="aiSessions.length === 0 || aiSending" />
                </UTooltip>
              </UDropdownMenu>
              <UButton icon="i-lucide-x" variant="ghost" color="neutral" size="sm" square @click="showAiSidebar = false" />
            </div>
          </div>

          <div ref="aiHistoryScrollRef" class="flex-1 min-h-0 overflow-y-auto p-3 space-y-4">
          <div v-if="visibleAiHistory.length === 0" class="text-sm text-muted leading-5 px-1 py-2">
            {{ t("notes.ai.emptyHint") }}
          </div>

          <div
            v-for="(item, itemIndex) in visibleAiHistory"
            :key="item.id"
            class="space-y-2"
          >
            <div class="group leading-7">
              <div class="flex justify-end">
                <div class="max-w-[86%]">
                  <div class="mb-1.5 text-xs text-muted text-right select-none opacity-0 group-hover:opacity-100 transition-opacity">
                    <UTooltip :text="formatFullTime(item.createdAt)">
                      <span>{{ formatMessageTime(item.createdAt) }}</span>
                    </UTooltip>
                  </div>

                  <div class="px-3 py-2 mb-2 rounded-xl bg-accented">
                    <div
                      v-if="item.selectionText"
                      class="mb-2 pl-2 border-l-3 border-default cursor-pointer"
                      @click="aiQuoteDetailText = item.selectionText; aiQuoteDetailOpen = true"
                    >
                      <div class="text-sm text-default whitespace-pre-wrap break-words line-clamp-3">
                        {{ item.selectionText }}
                      </div>
                    </div>
                    <div class="text-sm text-default whitespace-pre-wrap break-words">{{ item.prompt }}</div>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <div class="mb-2 flex items-center gap-2.5">
                <ModelLogo :model-id="aiModelInfoByItemId[item.id]?.modelName ?? ''" size="md" />

                <div class="flex items-center gap-2 text-xs select-none">
                  <template v-if="aiModelInfoByItemId[item.id]">
                    <span class="truncate">{{ aiModelInfoByItemId[item.id]?.modelName }}</span>
                    <USeparator orientation="vertical" class="h-3" />
                    <span class="text-muted truncate">{{ aiModelInfoByItemId[item.id]?.providerName }}</span>
                  </template>

                  <template v-if="item.status !== 'loading'">
                    <USeparator v-if="aiModelInfoByItemId[item.id]" orientation="vertical" class="h-3" />
                    <UTooltip :text="formatFullTime(item.createdAt)">
                      <span class="text-muted">{{ formatMessageTime(item.createdAt) }}</span>
                    </UTooltip>
                  </template>
                </div>
              </div>

              <div v-if="item.status === 'error'" class="text-sm text-error whitespace-pre-wrap break-words">
                {{ item.error || t("notes.ai.requestFailed") }}
              </div>
              <template v-else>
                <div
                  v-for="part in item.parts"
                  :key="part.id"
                >
                  <div
                    v-if="part.type === 'text'"
                    class="text-sm text-default whitespace-pre-wrap break-words leading-7"
                  >
                    {{ part.text }}
                  </div>

                  <div
                    v-else-if="getAiToolCall(item, part.toolCallId)"
                    class="rounded-md border border-default bg-elevated px-2 py-2 space-y-1 max-h-48 overflow-y-auto"
                    :class="canOpenAiToolCallDetail(getAiToolCall(item, part.toolCallId)) ? 'cursor-pointer hover:bg-elevated transition-colors' : ''"
                    @click="handleOpenAiToolCallDetail(item, part.toolCallId)"
                  >
                    <div class="text-xs text-default">
                      <span v-if="getAiToolCall(item, part.toolCallId)?.status === 'running'">{{ t("notes.ai.generatingProposal") }}</span>
                      <span v-else-if="getAiToolCall(item, part.toolCallId)?.status === 'success'">{{ t("notes.ai.generatedProposal") }}</span>
                      <span v-else class="text-error">
                        {{ t("notes.ai.generateProposalFailed", { error: getAiToolCall(item, part.toolCallId)?.error || t("notes.ai.unknownError") }) }}
                      </span>
                    </div>

                    <template v-if="getAiToolCall(item, part.toolCallId)?.status === 'success'">
                      <div class="text-[11px] text-muted">
                        {{ t("notes.ai.editCount", { count: aiProposalEditCount(getAiToolCall(item, part.toolCallId)?.proposal) }) }}
                      </div>
                      <div v-if="isAiToolCallApplied(item, part.toolCallId)" class="text-[11px] text-emerald-600">
                        {{ t("notes.ai.applied") }}
                      </div>
                      <div v-else-if="isAiToolCallRejected(item, part.toolCallId)" class="text-[11px] text-muted">
                        {{ t("notes.ai.rejected") }}
                      </div>
                      <div class="max-h-20 overflow-y-auto space-y-1 pr-1">
                        <div class="text-[11px] text-default line-clamp-2">
                          {{ formatAiProposalPreview(getAiToolCall(item, part.toolCallId)?.proposal) }}
                        </div>
                        <div
                          v-for="(edit, editIndex) in (getAiToolCall(item, part.toolCallId)?.proposal?.mode === 'document_patch'
                            ? getAiToolCall(item, part.toolCallId)?.proposal?.edits || []
                            : []).slice(0, 2)"
                          :key="`${part.toolCallId}-preview-${editIndex}`"
                          class="text-[11px] text-muted line-clamp-2"
                        >
                          {{ aiPatchRangeLabel(edit) }} · {{ aiPatchPreviewText(edit) }}
                        </div>
                      </div>
                      <div class="flex justify-end pt-1" @click.stop>
                        <UButton
                          class="ml-1"
                          variant="soft"
                          color="neutral"
                          size="xs"
                          @click="handleOpenAiToolCallDetail(item, part.toolCallId)"
                        >
                          {{ t("notes.ai.viewDetails") }}
                        </UButton>
                        <UButton
                          v-if="!isAiToolCallApplied(item, part.toolCallId)"
                          variant="soft"
                          color="error"
                          size="xs"
                          :disabled="!canRejectAiToolCall(item, part.toolCallId)"
                          @click="handleRejectAiToolCallById(item, part.toolCallId)"
                        >
                          {{ isAiToolCallRejected(item, part.toolCallId) ? t("notes.ai.rejected") : t("notes.ai.reject") }}
                        </UButton>
                        <UButton
                          v-if="!isAiToolCallRejected(item, part.toolCallId)"
                          class="ml-1"
                          color="neutral"
                          size="xs"
                          :disabled="!canApplyAiToolCall(item, part.toolCallId)"
                          @click="handleApplyAiToolCallById(item, part.toolCallId)"
                        >
                          {{ isAiToolCallApplied(item, part.toolCallId) ? t("notes.ai.applied") : t("notes.ai.apply") }}
                        </UButton>
                      </div>
                    </template>
                  </div>
                </div>
                <div v-if="item.status === 'loading'" class="text-sm text-muted">{{ t("notes.ai.loading") }}</div>
              </template>

              <div class="mt-2 flex items-center gap-1">
                <UTooltip v-if="itemIndex === visibleAiHistory.length - 1 && item.status !== 'loading' && !isAiHistoryRetryDisabled(item)" :text="t('notes.ai.retry')">
                  <UButton
                    icon="i-lucide-refresh-cw"
                    size="sm"
                    color="neutral"
                    variant="ghost"
                    square
                    @click="handleRetryAiHistoryItem(item)"
                  />
                </UTooltip>
              </div>
            </div>
          </div>
          </div>

          <div class="shrink-0 px-3 pt-1.5 pb-2 space-y-1.5 bg-default">
          <div
            :class="[
              'rounded-2xl bg-default overflow-hidden transition-all duration-200 border border-default',
              { 'shadow-sm': aiInputFocused }
            ]"
          >
            <div class="relative">
              <Transition
                enter-active-class="transition-[max-height] duration-200 ease-out overflow-hidden"
                leave-active-class="transition-[max-height] duration-150 ease-in overflow-hidden"
                enter-from-class="max-h-0"
                enter-to-class="max-h-24"
                leave-from-class="max-h-24"
                leave-to-class="max-h-0"
              >
                <div
                  v-if="aiSelection"
                  class="flex items-center gap-2 px-4 pt-3 pb-2 bg-elevated border-b border-default"
                >
                  <div class="flex-1 min-w-0 flex items-center gap-2 cursor-pointer" @click="aiQuoteDetailText = aiSelection.selectedText; aiQuoteDetailOpen = true">
                    <UIcon name="i-lucide-quote" class="w-4 h-4 text-muted shrink-0" />
                    <div class="text-sm text-default truncate">{{ aiSelection.selectedText }}</div>
                  </div>
                  <UButton
                    icon="i-lucide-x"
                    size="xs"
                    color="neutral"
                    variant="ghost"
                    square
                    @click="clearAiSelection"
                  />
                </div>
              </Transition>

              <UTextarea
                v-model="aiPromptInput"
                :rows="3"
                :maxrows="8"
                autoresize
                :highlight="false"
                variant="none"
                :placeholder="aiPromptPlaceholder"
                class="w-full px-0.5 py-1"
                @keydown="handleAiPromptKeydown"
                @focus="aiInputFocused = true"
                @blur="aiInputFocused = false"
              />

              <div class="flex items-center justify-between p-2">
                <div class="flex items-center gap-1 min-w-0">
                  <UDropdownMenu
                    :items="aiContextModeMenuItems"
                    size="sm"
                    :content="{ side: 'top', align: 'start' }"
                  >
                    <UButton
                      size="sm"
                      color="neutral"
                      variant="soft"
                      square
                      class="rounded-full"
                    >
                      <UIcon :name="aiContextModeIcon" class="w-4 h-4 shrink-0" />
                    </UButton>
                  </UDropdownMenu>
                </div>
                <div class="flex items-center gap-1">
                  <ModelSelector
                    v-model="noteAiModel"
                    :show-default="true"
                    model-type="chat"
                    ghost
                    placement="top"
                    align="right"
                  />
                  <UTooltip :text="aiSending ? t('notes.ai.abort') : t('notes.ai.send')">
                    <UButton
                      :icon="aiSending ? 'i-lucide-square' : 'i-lucide-arrow-up'"
                      color="neutral"
                      size="sm"
                      square
                      class="rounded-full"
                      :disabled="aiSending ? !activeNote : !aiCanSend"
                      @click="aiSending ? handleAbortAiAssist() : handleSendAiAssist()"
                    />
                  </UTooltip>
                </div>
              </div>
            </div>
          </div>

          <div class="flex justify-end text-[11px] text-muted select-none">
            <USelect
              v-model="aiSendShortcutMode"
              :items="aiSendShortcutOptions"
              size="xs"
              variant="ghost"
              class="w-28"
              @update:model-value="handleAiShortcutChange"
            />
          </div>
          </div>
        </div>

        <PanelResizeHandle
          side="left"
          variant="edge"
          :active="aiSidebarResize.isDragging.value"
          :value="aiSidebarResize.width.value"
          :min="aiSidebarResize.minWidth.value"
          :max="aiSidebarResize.maxWidth.value"
          :cursor="aiSidebarResize.cursor.value"
          @resize-start="aiSidebarResize.startResize"
          @resize-by="aiSidebarResize.resizeBy"
          @reset="aiSidebarResize.resetWidth"
        />
      </section>
    </div>

    <UModal
      v-model:open="listModalOpen"
      :title="isEditingList ? t('notes.listModal.editTitle') : t('notes.listModal.createTitle')"
      :ui="{ footer: 'justify-end', body: 'p-4' }"
    >
      <template #body>
        <div class="flex flex-col gap-4">
          <UFormField :label="t('notes.listModal.name')" required>
            <UFieldGroup size="md" class="w-full">
              <IconColorSelector
                v-model:icon="listForm.icon"
                v-model:color="listForm.color"
                :icon-label="t('notes.listModal.selectIcon')"
                :color-label="t('projectForm.color')"
              />

              <UInput v-model="listForm.name" :placeholder="t('notes.listModal.namePlaceholder')" class="flex-1" autofocus />
            </UFieldGroup>
          </UFormField>
        </div>
      </template>
      <template #footer="{ close }">
        <UButton variant="outline" @click="close()">{{ t("notes.modal.cancel") }}</UButton>
        <UButton :disabled="!listForm.name.trim()" @click="handleSubmitListModal">{{ t("notes.modal.confirm") }}</UButton>
      </template>
    </UModal>

    <UModal
      v-model:open="aiDiffModalOpen"
      :title="t('notes.aiDiff.title')"
      :ui="{ body: 'p-4', footer: 'justify-end gap-2' }"
    >
      <template #body>
        <div v-if="!aiDiffToolCall" class="text-sm text-muted">{{ t("notes.aiDiff.empty") }}</div>
        <div v-else class="space-y-3">
          <div class="text-xs text-muted">
            {{ t("notes.ai.editCount", { count: aiProposalEditCount(aiDiffToolCall.proposal) }) }}
          </div>

          <template v-if="aiDiffToolCall.proposal?.mode === 'selection_replace'">
            <div class="rounded-lg border border-default bg-default p-3 space-y-2">
              <div class="text-xs font-medium text-default">
                1. {{ aiEditOpLabel(aiDiffToolCall.proposal) }}
              </div>

              <div>
                <div class="text-[11px] text-muted mb-1">{{ t("notes.aiDiff.originalSelection") }}</div>
                <div class="rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-sm text-default whitespace-pre-wrap break-words line-through">
                  {{ aiDiffItem?.selectionText || t("notes.aiDiff.noSelectionText") }}
                </div>
              </div>

              <div>
                <div class="text-[11px] text-muted mb-1">{{ t("notes.aiDiff.suggestion") }}</div>
                <div class="rounded-md border border-green-200 bg-green-50 px-2 py-1.5 text-sm text-default whitespace-pre-wrap break-words">
                  {{ aiDiffToolCall.proposal.replacement }}
                </div>
              </div>
            </div>
          </template>

          <template v-else-if="aiDiffToolCall.proposal?.mode === 'document_patch'">
            <div
              v-for="(edit, index) in aiDiffToolCall.proposal.edits"
              :key="`ai-diff-${index}`"
              class="rounded-lg border border-default bg-default p-3 space-y-2"
            >
              <div class="text-xs font-medium text-default">
                {{ index + 1 }}. {{ aiPatchEditLabel(edit) }}
              </div>

              <div>
                <div class="text-[11px] text-muted mb-1">{{ t("notes.aiDiff.position") }}</div>
                <div class="rounded-md border border-default bg-elevated px-2 py-1.5 text-xs text-default">
                  {{ aiPatchRangeLabel(edit) }}
                </div>
              </div>

              <div>
                <div class="text-[11px] text-muted mb-1">{{ t("notes.aiDiff.original") }}</div>
                <div class="rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-sm text-default whitespace-pre-wrap break-words line-through">
                  {{ edit.expectedText || t("notes.aiDiff.emptyText") }}
                </div>
              </div>

              <div>
                <div class="text-[11px] text-muted mb-1">{{ t("notes.aiDiff.suggestion") }}</div>
                <div class="rounded-md border border-green-200 bg-green-50 px-2 py-1.5 text-sm text-default whitespace-pre-wrap break-words">
                  {{ edit.newText || t("notes.aiDiff.emptyText") }}
                </div>
              </div>
            </div>
          </template>
        </div>
      </template>

      <template #footer>
        <UButton
          v-if="!aiDiffToolCall?.applied"
          variant="outline"
          color="neutral"
          :disabled="!aiDiffItem || !aiDiffToolCall || aiDiffToolCall.status !== 'success' || aiProposalEditCount(aiDiffToolCall.proposal) === 0 || !!aiDiffToolCall.rejected"
          @click="handleRejectAiToolCallFromModal"
        >
          {{ aiDiffToolCall?.rejected ? t("notes.ai.rejected") : t("notes.ai.reject") }}
        </UButton>
        <UButton
          v-if="!aiDiffToolCall?.rejected"
          color="neutral"
          :disabled="!aiDiffItem || !aiDiffToolCall || aiDiffToolCall.status !== 'success' || aiProposalEditCount(aiDiffToolCall.proposal) === 0 || !!aiDiffToolCall.applied"
          @click="handleApplyAiToolCallFromModal"
        >
          {{ aiDiffToolCall?.applied ? t("notes.ai.applied") : t("notes.ai.apply") }}
        </UButton>
      </template>
    </UModal>

    <QuoteDetailModal
      v-model:open="aiQuoteDetailOpen"
      :quote="aiQuoteDetail"
    />

  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute, useRouter } from "vue-router";
import { useDebounceFn } from "@vueuse/core";
import { useConfirm } from "@/composables/useConfirm";
import { useMyToast } from "@/composables/useMyToast";
import { useResizableWidth } from "@/composables/useResizableWidth";
import { useNotes, type Note, type NoteList, type NoteScope } from "@/composables/useNotes";
import {
  useNoteAiStore,
  type NoteAiAction,
  type NoteAiDocumentPatchEdit,
  type NoteAiContextMode,
  type NoteAiHistoryItem,
  type NoteAiProposal,
  type NoteAiSelectionAnchor,
  type NoteAiToolCall,
} from "@/stores/useNoteAiStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { copyToClipboard } from "@/utils/clipboard";
import { getPersistentValue, removePersistentValueSoon, setPersistentValueSoon, usePersistentState } from "@/utils/persistentState";
import { formatFullTime, formatListUpdatedAt, formatMessageTime } from "@/utils/timeFormat";
import { DEFAULT_COLOR, DEFAULT_ICON } from "@/config/project-icon-config";
import { isMac } from "@/utils/platformUtils";
import { markdownToPlain } from "@mirdel/markdown-to-plain";
import { useContentExport } from "@/composables/useContentExport";
import { parseModelInfo } from "@/utils/modelInfo";
import DocumentEditor from "@/components/editor/DocumentEditor.vue";
import SourceEditor from "@/components/editor/SourceEditor.vue";
import PageFindBar from "@/components/PageFindBar.vue";
import ModelSelector from "@/components/ModelSelector.vue";
import ModelLogo from "@/components/ModelLogo.vue";
import PanelResizeHandle from "@/components/PanelResizeHandle.vue";
import UList from "@/components/UList.vue";
import UText from "@/components/UText.vue";
import QuoteDetailModal from "@/components/chat/QuoteDetailModal.vue";
import IconColorSelector from "@/components/common/IconColorSelector.vue";

const route = useRoute();
const router = useRouter();
const { t } = useI18n();

const LIST_KEY_ALL = "__all__";
const LIST_KEY_INBOX = "__inbox__";
const NOTE_EDITOR_MODE_KEY = "notes-editor-mode";
const NOTE_AI_DEFAULT_MODEL = "__default__";

type FixedListItem = {
  id: string;
  label: string;
  icon: string;
  count: number;
};
type NoteEditorMode = "visual" | "source";
type NoteSelectionMode = "visual" | "source";
type NoteAiSelectionPayload = {
  action: NoteAiAction;
  selectedText: string;
  nearbyContext?: string;
  docRevision?: string;
  selectionRange?: {
    mode: NoteSelectionMode;
    from: number;
    to: number;
  };
};
type NoteAiSelectionContext = NoteAiSelectionPayload & {
  noteId: string;
};

const NOTE_AI_PROMPT_TEMPLATES: Record<NoteAiAction, string> = {
  polish: t("notes.ai.prompt.polish"),
  expand: t("notes.ai.prompt.expand"),
  shorten: t("notes.ai.prompt.shorten"),
  custom: "",
};

const NOTE_AI_ACTION_LABELS: Record<NoteAiAction, string> = {
  polish: t("notes.ai.action.polish"),
  expand: t("notes.ai.action.expand"),
  shorten: t("notes.ai.action.shorten"),
  custom: t("notes.ai.action.custom"),
};

const toast = useMyToast();
const { confirm } = useConfirm();
const noteAiStore = useNoteAiStore();
const settingsStore = useSettingsStore();
const contentExport = useContentExport();

const {
  noteLists,
  notes,
  loadNoteLists,
  loadNotes,
  getNote,
  createNoteList,
  updateNoteList,
  deleteNoteList,
  createNote,
  updateNote,
  deleteNote,
  attachAssetToNote,
} = useNotes();

const selectedListKey = ref<string>(LIST_KEY_ALL);
const selectedNoteId = ref<string | null>(null);
const activeNote = ref<Note | null>(null);
const linkedNoteSessionMap = ref<Map<string, string>>(new Map());

const stats = ref<{ all: number; inbox: number; byList: Record<string, number> }>({
  all: 0,
  inbox: 0,
  byList: {},
});

const draftTitle = ref("");
const draftContentMd = ref("");
const editorMode = ref<NoteEditorMode>(restoreNoteEditorMode());

const isSaving = ref(false);
const isAttachingAsset = ref(false);

const openListMenuId = ref<string | null>(null);
const openNoteMenuId = ref<string | null>(null);
const editingNoteId = ref<string | null>(null);
const editingNoteTitle = ref("");
const isEditingDetailTitle = ref(false);
const detailTitleInputRef = ref<any>(null);
const noteDocumentEditorRef = ref<{
  applySelectionReplace: (input: { from: number; to: number; expectedText: string; replacement: string }) =>
    | { ok: true }
    | { ok: false; reason: string };
  getSearchRootElement: () => HTMLElement | null;
} | null>(null);
const noteSourceEditorRef = ref<{
  applyEdits: (edits: Array<{ from: number; to: number; text: string }>) => boolean;
} | null>(null);
const pageFindOpen = ref(false);
const pageFindRef = ref<{ openFromShortcut: () => void } | null>(null);

const listModalOpen = ref(false);
const isEditingList = ref(false);
const editingListId = ref<string | null>(null);
const listForm = ref({
  name: "",
  icon: DEFAULT_ICON,
  color: DEFAULT_COLOR,
});

const showAiSidebar = ref(true);
const aiSelection = ref<NoteAiSelectionContext | null>(null);
const aiPromptInput = ref("");
const aiInputFocused = ref(false);
const noteAiModel = ref(NOTE_AI_DEFAULT_MODEL);
const aiSendShortcutMode = ref<"enter" | "cmd-enter">("enter");
const aiContextMode = ref<NoteAiContextMode>("full");
const aiDiffModalOpen = ref(false);
const aiDiffTarget = ref<{ itemId: string; toolCallId: string } | null>(null);
const aiQuoteDetailOpen = ref(false);
const aiQuoteDetailText = ref("");

const aiHistoryScrollRef = ref<HTMLElement | null>(null);

const LIST_PANEL_COLLAPSE_KEY = "notes-list-panel-collapsed";
const NOTE_PANEL_COLLAPSE_KEY = "notes-item-panel-collapsed";

function getAiDraftKey(sessionId: string) {
  return `note-ai-draft-${sessionId}`;
}

function loadAiDraft(sessionId: string) {
  if (!sessionId) return "";
  return getPersistentValue(getAiDraftKey(sessionId), "");
}

const saveAiDraftDebounced = useDebounceFn((sessionId: string, text: string) => {
  if (!sessionId) return;
  const key = getAiDraftKey(sessionId);
  if (text.trim()) {
    setPersistentValueSoon(key, text);
  } else {
    removePersistentValueSoon(key);
  }
}, 500);

function saveAiDraftImmediate(sessionId: string, text: string) {
  if (!sessionId) return;
  const key = getAiDraftKey(sessionId);
  if (text.trim()) {
    setPersistentValueSoon(key, text);
  } else {
    removePersistentValueSoon(key);
  }
}

function removeAiDraft(sessionId: string) {
  if (!sessionId) return;
  removePersistentValueSoon(getAiDraftKey(sessionId));
}

function getAiSelectionDraftKey(sessionId: string) {
  return `note-ai-selection-${sessionId}`;
}

function loadAiSelectionDraft(sessionId: string): NoteAiSelectionContext | null {
  if (!sessionId) return null;
  return getPersistentValue<NoteAiSelectionContext | null>(getAiSelectionDraftKey(sessionId), null);
}

function saveAiSelectionDraft(sessionId: string, selection: NoteAiSelectionContext | null) {
  if (!sessionId) return;
  const key = getAiSelectionDraftKey(sessionId);
  if (selection) {
    setPersistentValueSoon(key, selection);
  } else {
    removePersistentValueSoon(key);
  }
}

const isListPanelCollapsed = usePersistentState(LIST_PANEL_COLLAPSE_KEY, false);
const isNotePanelCollapsed = usePersistentState(NOTE_PANEL_COLLAPSE_KEY, false);

const {
  width: listPanelWidth,
  minWidth: listPanelMinWidth,
  maxWidth: listPanelMaxWidth,
  widthStyle: listPanelWidthStyle,
  cursor: listPanelResizeCursor,
  isDragging: isListPanelDragging,
  startResize: startListPanelResize,
  resizeBy: resizeListPanelBy,
  resetWidth: resetListPanelWidth,
} = useResizableWidth({
  storageKey: "notes-list-panel-width",
  defaultWidth: 184,
  minWidth: 160,
  maxWidth: 280,
  collapsed: isListPanelCollapsed,
  collapsedWidth: 44,
  side: "right",
  step: 16,
});

const {
  width: notePanelWidth,
  minWidth: notePanelMinWidth,
  maxWidth: notePanelMaxWidth,
  widthStyle: notePanelWidthStyle,
  cursor: notePanelResizeCursor,
  isDragging: isNotePanelDragging,
  startResize: startNotePanelResize,
  resizeBy: resizeNotePanelBy,
  resetWidth: resetNotePanelWidth,
} = useResizableWidth({
  storageKey: "notes-item-panel-width",
  defaultWidth: 256,
  minWidth: 220,
  maxWidth: 420,
  collapsed: isNotePanelCollapsed,
  collapsedWidth: 56,
  side: "right",
  step: 16,
});

const aiSidebarResize = useResizableWidth({
  storageKey: "notes-ai-sidebar-width",
  defaultWidth: 340,
  minWidth: 300,
  maxWidth: 520,
  side: "left",
  step: 16,
});
const aiSidebarWidthStyle = aiSidebarResize.widthStyle;

function toggleListPanel() {
  isListPanelCollapsed.value = !isListPanelCollapsed.value;
}

function toggleNotePanel() {
  isNotePanelCollapsed.value = !isNotePanelCollapsed.value;
}

defineShortcuts({
  meta_b: {
    usingInput: true,
    handler: () => {
      toggleNotePanel();
    },
  },
});

const fixedListItems = computed<FixedListItem[]>(() => [
  { id: LIST_KEY_ALL, label: t("notes.lists.all"), icon: "i-lucide-folders", count: stats.value.all },
  { id: LIST_KEY_INBOX, label: t("notes.lists.inbox"), icon: "i-lucide-inbox", count: stats.value.inbox },
]);
const isNotesRoute = computed(() => route.name === "notes" || route.name === "notes-detail");

function getPageFindRoot() {
  if (editorMode.value !== "visual") return null;
  return noteDocumentEditorRef.value?.getSearchRootElement() || null;
}

function openPageFindInVisualNote() {
  if (!isNotesRoute.value) return;
  if (editorMode.value !== "visual") return;
  if (!activeNote.value) return;
  pageFindOpen.value = true;
  nextTick(() => {
    pageFindRef.value?.openFromShortcut();
  });
}

function handleFindShortcut(event: KeyboardEvent) {
  if (!isNotesRoute.value) return;
  if (event.isComposing) return;
  if (event.shiftKey || event.altKey) return;
  if (!(event.metaKey || event.ctrlKey)) return;
  if (event.key.toLowerCase() !== "f") return;
  if (editorMode.value !== "visual") return;
  if (!activeNote.value) return;

  event.preventDefault();
  openPageFindInVisualNote();
}

const customListItems = computed(() => noteLists.value);

const currentListTitle = computed(() => {
  if (selectedListKey.value === LIST_KEY_ALL) return t("notes.lists.all");
  if (selectedListKey.value === LIST_KEY_INBOX) return t("notes.lists.inbox");

  const current = noteLists.value.find((item) => item.id === selectedListKey.value);
  return current?.name || t("notes.lists.default");
});

const activeNoteListName = computed(() => getListDisplayName(activeNote.value?.listId ?? null));
const activeNoteListIcon = computed(() => getListDisplayIcon(activeNote.value?.listId ?? null));
const activeNoteListColor = computed(() => getListDisplayColor(activeNote.value?.listId ?? null));
const editorModeItems = computed(() => [
  { label: t("notes.editor.visual"), value: "visual" },
  { label: t("notes.editor.source"), value: "source" },
]);
const noteCharCount = computed(() => Array.from(String(draftContentMd.value || "")).length);
const noteCreatedAtText = computed(() => {
  const createdAt = activeNote.value?.createdAt;
  return createdAt ? formatFullTime(createdAt) : "--";
});
const noteUpdatedAtText = computed(() => {
  const updatedAt = activeNote.value?.updatedAt;
  return updatedAt ? formatFullTime(updatedAt) : "--";
});
const aiPromptPlaceholder = computed(() => {
  if (!aiSelection.value) return t("notes.ai.placeholder.default");
  const label = aiActionLabel(aiSelection.value.action);
  return t("notes.ai.placeholder.withAction", { label });
});
const visibleAiHistory = computed(() => {
  const noteId = activeNote.value?.id;
  if (!noteId) return [];
  return noteAiStore.getHistory(noteId);
});
const aiModelInfoByItemId = computed(() => {
  const result: Record<string, ReturnType<typeof parseModelInfo>> = {};
  for (const item of visibleAiHistory.value) {
    result[item.id] = parseModelInfo(item.model);
  }
  return result;
});
const aiDiffItem = computed(() => {
  const target = aiDiffTarget.value;
  if (!target) return null;
  return visibleAiHistory.value.find((item) => item.id === target.itemId) || null;
});
const aiDiffToolCall = computed(() => {
  const target = aiDiffTarget.value;
  if (!target) return null;
  const item = aiDiffItem.value;
  if (!item) return null;
  return getAiToolCall(item, target.toolCallId);
});
const aiQuoteDetail = computed(() => {
  if (!aiQuoteDetailText.value) return undefined;
  return { parts: [{ type: "text" as const, text: aiQuoteDetailText.value }] };
});
const aiSending = computed(() => {
  const noteId = activeNote.value?.id;
  if (!noteId) return false;
  return noteAiStore.isNoteSending(noteId);
});
const aiCanSend = computed(() => {
  return !!activeNote.value && !!aiPromptInput.value.trim() && !aiSending.value;
});
const aiSendShortcutOptions = computed(() => [
  { label: t("notes.ai.shortcut.enter"), value: "enter" },
  { label: t("notes.ai.shortcut.cmdEnter", { key: isMac() ? "⌘" : "Ctrl" }), value: "cmd-enter" },
]);
const aiContextModeOptions = computed(() => [
  ...(aiSelection.value
    ? [
        { label: t("notes.ai.context.none"), value: "none" as const, icon: "i-lucide-ban" },
        { label: t("notes.ai.context.full"), value: "full" as const, icon: "i-lucide-notebook-text" },
        { label: t("notes.ai.context.selectionNearby"), value: "selection-nearby" as const, icon: "i-lucide-square-dashed-mouse-pointer" },
      ]
    : [
        { label: t("notes.ai.context.none"), value: "none" as const, icon: "i-lucide-ban" },
        { label: t("notes.ai.context.full"), value: "full" as const, icon: "i-lucide-notebook-text" },
      ]),
]);
const aiContextModeIcon = computed(() => {
  const current = aiContextModeOptions.value.find((item) => item.value === aiContextMode.value);
  return current?.icon || "i-lucide-notebook-text";
});
const aiContextModeMenuItems = computed(() => {
  return [aiContextModeOptions.value.map((item) => ({
    label: item.label,
    icon: item.icon,
    type: "checkbox" as const,
    checked: item.value === aiContextMode.value,
    onUpdateChecked(checked: boolean) {
      if (!checked) return;
      aiContextMode.value = item.value;
    },
  }))];
});
const aiSessions = computed(() => {
  const noteId = activeNote.value?.id;
  if (!noteId) return [] as Array<{ id: string; createdAt: number; lastMessageAt?: number }>;
  return noteAiStore.getSessions(noteId);
});
const activeAiSessionId = computed(() => {
  const noteId = activeNote.value?.id;
  if (!noteId) return "";
  return noteAiStore.getActiveSessionId(noteId) || "";
});
const aiSessionMenuItems = computed(() => {
  const sessions = aiSessions.value;
  if (sessions.length === 0) {
    return [[{ label: t("notes.ai.sessions.empty"), icon: "i-lucide-history", disabled: true }]];
  }
  return [sessions.map((session, index) => {
    const time = session.lastMessageAt ? formatMessageTime(session.lastMessageAt) : formatMessageTime(session.createdAt);
    return {
      label: t("notes.ai.sessions.item", { index: sessions.length - index, time }),
      icon: "i-lucide-message-square",
      type: "checkbox" as const,
      checked: session.id === activeAiSessionId.value,
      onUpdateChecked(checked: boolean) {
        if (!checked) return;
        void handleSwitchAiSession(session.id);
      },
    };
  })];
});
const aiHistoryScrollSignature = computed(() => {
  return visibleAiHistory.value
    .map((item) => {
      const partsSig = item.parts.map((part) => {
        if (part.type === "text") return `t${part.text.length}`;
        return `k${part.toolCallId}`;
      }).join(",");
      return `${item.id}:${item.status}:${partsSig}:${item.toolCalls.length}`;
    })
    .join("|");
});
const detailListMenuItems = computed(() => {
  const note = activeNote.value;
  if (!note) return [];

  const moveItems = getMoveListItems(note);
  return [[{
    label: t("notes.menu.moveToList"),
    icon: "i-lucide-folder-input",
    children: moveItems,
  }]];
});

const activeNoteMenuItems = computed(() => {
  const note = activeNote.value;
  if (!note) return [];

  return [
    [
      {
        label: t("notes.menu.copyAs"),
        icon: "i-lucide-copy",
        children: [
          {
            label: t("notes.menu.markdown"),
            icon: "i-lucide-file-code",
            onSelect: () => {
              void handleCopyActiveNote("markdown");
            },
          },
          {
            label: t("notes.menu.plainText"),
            icon: "i-lucide-file-text",
            onSelect: () => {
              void handleCopyActiveNote("plain");
            },
          },
        ],
      },
      {
        label: t("notes.menu.exportAs"),
        icon: "i-lucide-download",
        children: [
          {
            label: t("notes.menu.markdown"),
            icon: "i-lucide-file-code",
            onSelect: () => {
              void handleExportActiveNote("markdown");
            },
          },
          {
            label: t("notes.menu.plainText"),
            icon: "i-lucide-file-text",
            onSelect: () => {
              void handleExportActiveNote("plain");
            },
          },
          {
            label: "Word",
            icon: "i-lucide-file-text",
            onSelect: () => {
              void handleExportActiveNote("word");
            },
          },
          {
            label: "PDF",
            icon: "i-lucide-file-text",
            onSelect: () => {
              void handleExportActiveNote("pdf");
            },
          },
        ],
      },
    ],
    [
      {
        label: t("notes.menu.delete"),
        icon: "i-lucide-trash-2",
        color: "error",
        onSelect: () => {
          void handleDeleteNote(note);
        },
      },
    ],
  ];
});

function getNoteMenuItems(note: Note) {
  const editGroup: any[] = [
    {
      label: t("notes.menu.editTitle"),
      icon: "i-lucide-pencil",
      onSelect: () => {
        handleStartInlineEditNoteTitle(note);
      },
    },
  ];

  const moveItems = getMoveListItems(note);
  if (moveItems.length > 0) {
    editGroup.push({
      label: t("notes.menu.moveToList"),
      icon: "i-lucide-folder-input",
      children: moveItems,
    });
  }

  return [
    editGroup,
    [
      {
        label: t("notes.menu.delete"),
        icon: "i-lucide-trash-2",
        color: "error",
        onSelect: () => {
          void handleDeleteNote(note);
        },
      },
    ],
  ];
}

function getCustomListMenuItems(list: NoteList) {
  return [[
    {
      label: t("notes.menu.edit"),
      icon: "i-lucide-pencil",
      onSelect: () => {
        openEditListModal(list);
      },
    },
    {
      label: t("notes.menu.delete"),
      icon: "i-lucide-trash-2",
      color: "error",
      onSelect: () => {
        void handleDeleteList(list);
      },
    },
  ]];
}

function setListMenuOpen(listId: string, open: boolean) {
  openListMenuId.value = open ? listId : null;
}

function setNoteMenuOpen(noteId: string, open: boolean) {
  openNoteMenuId.value = open ? noteId : null;
}

function normalizePreviewText(text: string) {
  return (text || "")
    .replace(/(?:^|\s)\[(?:\s|x|X)\](?=\s|$)/g, " ")
    .replace(/\+\+([\s\S]+?)\+\+/g, "$1")
    .replace(/&nbsp;|&#160;|&#xa0;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatPreviewText(text: string) {
  const normalized = normalizePreviewText(text);
  if (!normalized) return "";
  return normalized.slice(0, 160);
}

function computeDocRevision(content: string) {
  const text = String(content || "");
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${text.length}:${(hash >>> 0).toString(16)}`;
}

function aiActionLabel(action: NoteAiAction) {
  return NOTE_AI_ACTION_LABELS[action] || "AI";
}

function getAiToolCall(item: NoteAiHistoryItem, toolCallId: string) {
  return item.toolCalls.find((toolCall) => toolCall.toolCallId === toolCallId) || null;
}

function isAiToolCallApplied(item: NoteAiHistoryItem, toolCallId: string) {
  return !!getAiToolCall(item, toolCallId)?.applied;
}

function isAiToolCallRejected(item: NoteAiHistoryItem, toolCallId: string) {
  return !!getAiToolCall(item, toolCallId)?.rejected;
}

function canApplyAiToolCall(item: NoteAiHistoryItem, toolCallId: string) {
  const toolCall = getAiToolCall(item, toolCallId);
  if (!toolCall) return false;
  if (toolCall.status !== "success") return false;
  if (toolCall.applied || toolCall.rejected) return false;
  return aiProposalEditCount(toolCall.proposal) > 0;
}

function canRejectAiToolCall(item: NoteAiHistoryItem, toolCallId: string) {
  const toolCall = getAiToolCall(item, toolCallId);
  if (!toolCall) return false;
  if (toolCall.status !== "success") return false;
  return !toolCall.applied && !toolCall.rejected;
}

function isAiHistoryRetryDisabled(item: NoteAiHistoryItem) {
  return item.toolCalls.some((toolCall) => !!toolCall.applied);
}

function isAiHistoryScrolledToBottom() {
  const el = aiHistoryScrollRef.value;
  if (!el) return true;
  const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
  return distanceFromBottom < 50;
}

function scrollAiHistoryToBottom() {
  const el = aiHistoryScrollRef.value;
  if (!el) return;
  el.scrollTop = el.scrollHeight;
}

let aiSmartScrollTimeoutId: ReturnType<typeof setTimeout> | null = null;
let aiScrollTopWhenScheduled = 0;
function scrollAiHistoryToBottomIfNeeded() {
  if (!isAiHistoryScrolledToBottom()) {
    return;
  }
  const el = aiHistoryScrollRef.value;
  if (!el) return;
  aiScrollTopWhenScheduled = el.scrollTop;
  if (aiSmartScrollTimeoutId) {
    clearTimeout(aiSmartScrollTimeoutId);
  }
  aiSmartScrollTimeoutId = setTimeout(() => {
    aiSmartScrollTimeoutId = null;
    const current = aiHistoryScrollRef.value;
    if (!current) return;
    if (current.scrollTop < aiScrollTopWhenScheduled - 10) {
      return;
    }
    current.scrollTop = current.scrollHeight;
  }, 120);
}

function compactAiPreviewText(text: string, max = 72) {
  const compacted = String(text || "").replace(/\s+/g, " ").trim();
  if (!compacted) return "";
  return compacted.length > max ? `${compacted.slice(0, max)}...` : compacted;
}

function aiProposalEditCount(proposal?: NoteAiProposal) {
  if (!proposal) return 0;
  if (proposal.mode === "selection_replace") return 1;
  return proposal.edits.length;
}

function formatAiProposalPreview(proposal?: NoteAiProposal) {
  if (!proposal) return t("notes.ai.editOp.proposal");
  if (proposal.mode === "selection_replace") {
    return t("notes.ai.preview.selectionReplace", {
      label: t("notes.ai.action.custom"),
      preview: compactAiPreviewText(proposal.replacement),
    });
  }
  const first = proposal.edits[0];
  if (!first) return t("notes.aiDiff.title");
  const location = `L${first.startLine}:${first.startCol}-L${first.endLine}:${first.endCol}`;
  return t("notes.ai.preview.patch", {
    location,
    preview: compactAiPreviewText(first.newText),
  });
}

function aiPatchEditLabel(edit: NoteAiDocumentPatchEdit) {
  const isInsert = edit.startLine === edit.endLine && edit.startCol === edit.endCol && edit.newText;
  const isDelete = !edit.newText && !!edit.expectedText;
  if (isInsert) return t("notes.ai.patch.insert");
  if (isDelete) return t("notes.ai.patch.delete");
  return t("notes.ai.patch.replace");
}

function aiPatchRangeLabel(edit: NoteAiDocumentPatchEdit) {
  return `L${edit.startLine}:${edit.startCol} - L${edit.endLine}:${edit.endCol}`;
}

function aiPatchPreviewText(edit: NoteAiDocumentPatchEdit) {
  if (!edit.expectedText && edit.newText) {
    return compactAiPreviewText(edit.newText);
  }
  if (edit.expectedText && !edit.newText) {
    return compactAiPreviewText(edit.expectedText);
  }
  return `${compactAiPreviewText(edit.expectedText)} -> ${compactAiPreviewText(edit.newText)}`;
}

function aiEditOpLabel(proposal: NoteAiProposal) {
  if (proposal.mode === "selection_replace") {
    return t("notes.ai.editOp.selectionReplace");
  }
  if (proposal.edits.length === 1) {
    return aiPatchEditLabel(proposal.edits[0]);
  }
  return t("notes.ai.editOp.proposal");
}

function canOpenAiToolCallDetail(toolCall: NoteAiToolCall | null) {
  return !!toolCall && toolCall.status === "success" && aiProposalEditCount(toolCall.proposal) > 0;
}

function handleOpenAiToolCallDetail(item: NoteAiHistoryItem, toolCallId: string) {
  const toolCall = getAiToolCall(item, toolCallId);
  if (!canOpenAiToolCallDetail(toolCall)) return;
  aiDiffTarget.value = {
    itemId: item.id,
    toolCallId,
  };
  aiDiffModalOpen.value = true;
}

function clearAiSelection() {
  aiSelection.value = null;
  aiContextMode.value = "full";
}

function buildSelectionAnchor(selection: NoteAiSelectionContext | null): NoteAiSelectionAnchor | undefined {
  if (!selection?.selectionRange) return undefined;
  const mode = selection.selectionRange.mode === "source" ? "source" : "visual";
  const from = Number(selection.selectionRange.from);
  const to = Number(selection.selectionRange.to);
  const expectedText = String(selection.selectedText || "");
  if (!Number.isInteger(from)) return undefined;
  if (mode === "visual" && from <= 0) return undefined;
  if (mode === "source" && from < 0) return undefined;
  if (!Number.isInteger(to) || to <= from) return undefined;
  if (!expectedText) return undefined;
  return {
    mode,
    from,
    to,
    expectedText,
  };
}

function normalizeSelectionReplacement(replacement: string, expectedText: string) {
  const normalizedLineBreaks = String(replacement || "").replace(/\r\n?/g, "\n");
  const isInline = !String(expectedText || "").includes("\n");
  if (isInline) {
    return normalizedLineBreaks
      .replace(/\n+/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim();
  }
  return normalizedLineBreaks.replace(/^\n+|\n+$/g, "");
}

async function switchToEditorMode(mode: NoteEditorMode) {
  if (editorMode.value === mode) return;
  editorMode.value = mode;
  await nextTick();
  await nextTick();
}

function applySelectionReplaceOnSource(
  content: string,
  input: { from: number; to: number; expectedText: string; replacement: string }
) {
  const from = Number(input.from);
  const to = Number(input.to);
  const expectedText = String(input.expectedText || "");
  const replacement = String(input.replacement || "");
  if (!Number.isInteger(from) || from < 0 || !Number.isInteger(to) || to <= from) {
    return { ok: false as const, reason: t("notes.apply.invalidSelectionRange") };
  }
  if (!expectedText) {
    return { ok: false as const, reason: t("notes.apply.missingSelectionText") };
  }
  if (!replacement) {
    return { ok: false as const, reason: t("notes.apply.missingReplacement") };
  }
  if (to > content.length) {
    return { ok: false as const, reason: t("notes.apply.selectionRangeExpired") };
  }

  const current = content.slice(from, to);
  if (current !== expectedText) {
    return { ok: false as const, reason: t("notes.apply.selectionChanged") };
  }

  const sourceEditor = noteSourceEditorRef.value;
  if (sourceEditor) {
    sourceEditor.applyEdits([{ from, to, text: replacement }]);
  } else {
    draftContentMd.value = `${content.slice(0, from)}${replacement}${content.slice(to)}`;
  }

  return {
    ok: true as const,
    appliedCount: 1,
  };
}

async function applySelectionReplace(
  item: NoteAiHistoryItem,
  proposal: Extract<NoteAiProposal, { mode: "selection_replace" }>
) {
  const anchor = item.selectionAnchor;
  if (!anchor) {
    return { ok: false as const, reason: t("notes.apply.missingSelectionAnchor") };
  }
  const replacement = normalizeSelectionReplacement(proposal.replacement, anchor.expectedText);
  if (!replacement) {
    return { ok: false as const, reason: t("notes.apply.missingReplacement") };
  }
  if (item.selectionDocRevision && item.selectionDocRevision !== computeDocRevision(draftContentMd.value)) {
    return { ok: false as const, reason: t("notes.apply.noteChanged") };
  }

  if (anchor.mode === "source") {
    await switchToEditorMode("source");
    return applySelectionReplaceOnSource(draftContentMd.value, {
      from: anchor.from,
      to: anchor.to,
      expectedText: anchor.expectedText,
      replacement,
    });
  }

  await switchToEditorMode("visual");
  const editor = noteDocumentEditorRef.value;
  if (!editor) {
    return { ok: false as const, reason: t("notes.apply.editorNotReady") };
  }

  const applied = editor.applySelectionReplace({
    from: anchor.from,
    to: anchor.to,
    expectedText: anchor.expectedText,
    replacement,
  });
  if (!applied.ok) {
    return { ok: false as const, reason: applied.reason };
  }
  return {
    ok: true as const,
    appliedCount: 1,
  };
}

function lineColToOffset(content: string, line: number, col: number): { ok: true; offset: number } | { ok: false; reason: string } {
  if (!Number.isInteger(line) || line < 1 || !Number.isInteger(col) || col < 1) {
    return { ok: false, reason: t("notes.apply.invalidLineCol") };
  }
  const lines = String(content || "").split("\n");
  if (line > lines.length) {
    return { ok: false, reason: t("notes.apply.lineOutOfRange", { line }) };
  }
  const targetLine = lines[line - 1] || "";
  if (col > targetLine.length + 1) {
    return { ok: false, reason: t("notes.apply.columnOutOfRange", { line, col }) };
  }
  let offset = 0;
  for (let index = 0; index < line - 1; index += 1) {
    offset += lines[index].length + 1;
  }
  offset += col - 1;
  return { ok: true, offset };
}

function applyDocumentPatch(content: string, proposal: Extract<NoteAiProposal, { mode: "document_patch" }>) {
  const resolved: Array<NoteAiDocumentPatchEdit & { startOffset: number; endOffset: number }> = [];

  for (let index = 0; index < proposal.edits.length; index += 1) {
    const edit = proposal.edits[index];
    const humanIndex = index + 1;
    const startOffset = lineColToOffset(content, edit.startLine, edit.startCol);
    if (!startOffset.ok) {
      return { ok: false as const, reason: t("notes.apply.resolveEditFailed", { index: humanIndex, reason: startOffset.reason }) };
    }
    const endOffset = lineColToOffset(content, edit.endLine, edit.endCol);
    if (!endOffset.ok) {
      return { ok: false as const, reason: t("notes.apply.resolveEditFailed", { index: humanIndex, reason: endOffset.reason }) };
    }
    if (endOffset.offset < startOffset.offset) {
      return { ok: false as const, reason: t("notes.apply.invalidEditRange", { index: humanIndex }) };
    }
    const currentText = content.slice(startOffset.offset, endOffset.offset);
    if (currentText !== String(edit.expectedText ?? "")) {
      return { ok: false as const, reason: t("notes.apply.originalMismatch", { index: humanIndex }) };
    }
    resolved.push({
      ...edit,
      startOffset: startOffset.offset,
      endOffset: endOffset.offset,
    });
  }

  const byStartAsc = [...resolved].sort((a, b) => a.startOffset - b.startOffset);
  for (let index = 1; index < byStartAsc.length; index += 1) {
    const prev = byStartAsc[index - 1];
    const current = byStartAsc[index];
    if (current.startOffset < prev.endOffset) {
      return { ok: false as const, reason: t("notes.apply.overlappingEdits", { index: index + 1 }) };
    }
  }

  const sourceEditor = noteSourceEditorRef.value;
  if (sourceEditor) {
    const edits = resolved.map((edit) => ({
      from: edit.startOffset,
      to: edit.endOffset,
      text: String(edit.newText),
    }));
    sourceEditor.applyEdits(edits);
  } else {
    let next = content;
    const byStartDesc = [...resolved].sort((a, b) => b.startOffset - a.startOffset);
    for (const edit of byStartDesc) {
      next = `${next.slice(0, edit.startOffset)}${edit.newText}${next.slice(edit.endOffset)}`;
    }
    draftContentMd.value = next;
  }

  return {
    ok: true as const,
    appliedCount: resolved.length,
  };
}

async function applyAiProposal(content: string, item: NoteAiHistoryItem, toolCall: NoteAiToolCall) {
  const proposal = toolCall.proposal;
  if (!proposal) {
    return { ok: false as const, reason: t("notes.apply.emptyProposal") };
  }
  if (proposal.mode === "selection_replace") {
    return applySelectionReplace(item, proposal);
  }
  return applyDocumentPatch(content, proposal);
}

function handleEditorSelectionAiAction(payload: NoteAiSelectionPayload) {
  const note = activeNote.value;
  if (!note) return;

  aiSelection.value = {
    ...payload,
    docRevision: computeDocRevision(draftContentMd.value),
    noteId: note.id,
  };
  aiPromptInput.value = NOTE_AI_PROMPT_TEMPLATES[payload.action];
  aiContextMode.value = "selection-nearby";
  showAiSidebar.value = true;
}

function handleSourceEditorSelectionChange(payload: {
  selectedText: string;
  nearbyContext?: string;
  selectionRange: {
    mode: "source";
    from: number;
    to: number;
  };
} | null) {
  const note = activeNote.value;
  if (!note) return;

  if (!payload) {
    if (aiSelection.value?.noteId === note.id && aiSelection.value.selectionRange?.mode === "source") {
      aiSelection.value = null;
      if (aiContextMode.value === "selection-nearby") {
        aiContextMode.value = "full";
      }
    }
    return;
  }

  aiSelection.value = {
    action: "custom",
    selectedText: payload.selectedText,
    nearbyContext: payload.nearbyContext,
    selectionRange: payload.selectionRange,
    docRevision: computeDocRevision(draftContentMd.value),
    noteId: note.id,
  };
  if (aiContextMode.value !== "selection-nearby") {
    aiContextMode.value = "selection-nearby";
  }
}

function handleAiPromptKeydown(event: KeyboardEvent) {
  if (event.isComposing || event.key !== "Enter") return;

  if (aiSendShortcutMode.value === "enter") {
    if (!event.shiftKey && !event.metaKey && !event.ctrlKey) {
      event.preventDefault();
      void handleSendAiAssist();
    }
    return;
  }

  if (event.metaKey || event.ctrlKey) {
    event.preventDefault();
    void handleSendAiAssist();
  }
}

async function handleAiShortcutChange(mode: string) {
  const normalized = mode === "cmd-enter" ? "cmd-enter" : "enter";
  aiSendShortcutMode.value = normalized;
  await window.ipc("settings:setSendShortcut", { mode: normalized });
}

async function handleAbortAiAssist() {
  const noteId = activeNote.value?.id;
  if (!noteId) return;
  try {
    await noteAiStore.abortByNote(noteId);
  } catch (error) {
    toast.error({ title: t("notes.toast.abortFailed"), description: String(error) });
  }
}

async function handleCreateAiSession() {
  const note = activeNote.value;
  if (!note) return;
  if (aiSending.value) return;

  if (noteAiStore.getActiveSessionId(note.id) && visibleAiHistory.value.length === 0) {
    return;
  }

  const model = resolveNoteAiRequestModel();
  if (model === null) {
    toast.error({ title: t("notes.toast.selectModelFirst") });
    return;
  }
  const result = await noteAiStore.createNewSession(note.id, model, aiContextMode.value);
  if (!result.ok) {
    toast.error({ title: t("notes.toast.createSessionFailed"), description: result.error || t("notes.toast.createFailed") });
    return;
  }
  noteAiModel.value = noteAiStore.getSessionModel(note.id) || NOTE_AI_DEFAULT_MODEL;
  aiContextMode.value = (noteAiStore.getSessionContextMode(note.id) || "full") as NoteAiContextMode;
  await nextTick();
  scrollAiHistoryToBottom();
}

async function handleSwitchAiSession(sessionId: string) {
  const note = activeNote.value;
  if (!note) return;
  if (aiSending.value) return;
  const result = await noteAiStore.switchSession(note.id, sessionId);
  if (!result.ok) {
    toast.error({ title: t("notes.toast.switchSessionFailed"), description: result.error || t("notes.toast.switchFailed") });
    return;
  }
  noteAiModel.value = noteAiStore.getSessionModel(note.id) || NOTE_AI_DEFAULT_MODEL;
  aiContextMode.value = (noteAiStore.getSessionContextMode(note.id) || "full") as NoteAiContextMode;
  await nextTick();
  scrollAiHistoryToBottom();
}

async function handleSendAiAssist(options?: { retryItemId?: string }) {
  const note = activeNote.value;
  const selection = aiSelection.value;
  const prompt = aiPromptInput.value.trim();

  if (!note) {
    toast.error({ title: t("notes.toast.selectNoteFirst") });
    return;
  }
  if (!prompt) {
    toast.error({ title: t("notes.toast.enterContent") });
    return;
  }
  if (selection && selection.noteId !== note.id) {
    toast.error({ title: t("notes.toast.selectionExpired") });
    return;
  }
  const requestModel = resolveNoteAiRequestModel();
  if (requestModel === null) {
    toast.error({ title: t("notes.toast.selectModelFirst") });
    return;
  }
  if (aiSending.value) return;

  const selectionAnchor = buildSelectionAnchor(selection);
  const selectionDocRevision = selection?.docRevision || (selection ? computeDocRevision(draftContentMd.value) : undefined);
  const retrySessionId = options?.retryItemId
    ? (visibleAiHistory.value.find((item) => item.id === options.retryItemId)?.sessionId || "")
    : "";
  const sessionId = retrySessionId || noteAiStore.getActiveSessionId(note.id) || undefined;

  showAiSidebar.value = true;
  const currentContextMode = aiContextMode.value;
  const sendPromise = noteAiStore.sendAssist({
    noteId: note.id,
    sessionId,
    noteContentMd: draftContentMd.value,
    userPrompt: prompt,
    selectionText: selection?.selectedText,
    selectionNearbyContext: selection?.nearbyContext,
    selectionAnchor,
    selectionDocRevision,
    contextMode: currentContextMode,
    model: requestModel,
    retryItemId: options?.retryItemId,
  });

  aiPromptInput.value = "";
  aiSelection.value = null;
  removeAiDraft(sessionId || activeAiSessionId.value);

  await nextTick();
  scrollAiHistoryToBottom();
  const result = await sendPromise;

  if (!result.ok) {
    toast.error({ title: t("notes.toast.aiRequestFailed"), description: result.error || t("notes.ai.requestFailed") });
  }
}

function resolveNoteAiRequestModel(): string | undefined | null {
  const selected = String(noteAiModel.value || "").trim();
  if (!selected) return null;

  const effectiveModel = selected === NOTE_AI_DEFAULT_MODEL
    ? (() => {
        const model = settingsStore.defaultModel;
        if (!model?.providerId || !model?.modelId) return null;
        return `${model.providerId}::${model.modelId}`;
      })()
    : selected;

  if (!effectiveModel) return null;
  const [providerId, modelId] = effectiveModel.split("::");
  if (!providerId || !modelId) return null;

  const provider = settingsStore.enabledProviders.find((item) => item.id === providerId);
  if (!provider) return null;
  if (!provider.models.some((item) => item.id === modelId)) return null;
  if (!settingsStore.isProviderModelSelectable(providerId, modelId)) return null;

  return selected === NOTE_AI_DEFAULT_MODEL ? undefined : effectiveModel;
}

function handleRetryAiHistoryItem(item: NoteAiHistoryItem) {
  const note = activeNote.value;
  if (!note || note.id !== item.noteId) {
    toast.error({ title: t("notes.toast.noteChangedRetry") });
    return;
  }
  if (isAiHistoryRetryDisabled(item)) {
    toast.error({ title: t("notes.toast.alreadyAppliedCannotRetry") });
    return;
  }

  aiSelection.value = item.selectionText
    ? {
        action: "custom",
        selectedText: item.selectionText,
        nearbyContext: item.selectionNearbyContext,
        selectionRange: item.selectionAnchor
          ? {
              mode: item.selectionAnchor.mode,
              from: item.selectionAnchor.from,
              to: item.selectionAnchor.to,
            }
          : undefined,
        docRevision: item.selectionDocRevision,
        noteId: item.noteId,
      }
    : null;
  aiContextMode.value = item.selectionText ? "selection-nearby" : item.contextMode;
  aiPromptInput.value = item.prompt;
  void handleSendAiAssist({ retryItemId: item.id });
}

async function handleApplyAiToolCall(item: NoteAiHistoryItem, toolCall: NoteAiToolCall) {
  if (toolCall.applied || toolCall.rejected) return;
  if (item.status !== "success" || toolCall.status !== "success") return;

  const proposal = toolCall.proposal;
  if (!proposal || aiProposalEditCount(proposal) === 0) {
    toast.error({ title: t("notes.toast.noApplicableChanges") });
    return;
  }
  if (item.selectionText && proposal.mode !== "selection_replace") {
    toast.error({ title: t("notes.toast.proposalTypeSelectionMismatch") });
    return;
  }
  if (!item.selectionText && proposal.mode === "selection_replace") {
    toast.error({ title: t("notes.toast.proposalTypeNonSelectionMismatch") });
    return;
  }

  const note = activeNote.value;
  if (!note || note.id !== item.noteId) {
    toast.error({ title: t("notes.toast.noteChangedApply") });
    return;
  }

  const applied = await applyAiProposal(draftContentMd.value, item, toolCall);
  if (!applied.ok) {
    toast.error({ title: t("notes.toast.applyFailed"), description: applied.reason });
    return;
  }

  const marked = await noteAiStore.setToolCallApplied(item.id, toolCall.toolCallId, true);
  if (!marked) {
    toast.error({ title: t("notes.toast.applyFailed"), description: t("notes.toast.writeStateFailed") });
    return;
  }
  toast.success(t("notes.toast.appliedCount", { count: applied.appliedCount }));

  aiSelection.value = null;
}

function handleApplyAiToolCallById(item: NoteAiHistoryItem, toolCallId: string) {
  const toolCall = getAiToolCall(item, toolCallId);
  if (!toolCall) return;
  void handleApplyAiToolCall(item, toolCall);
}

async function handleRejectAiToolCall(item: NoteAiHistoryItem, toolCall: NoteAiToolCall) {
  if (toolCall.applied || toolCall.rejected) return;
  if (item.status !== "success" || toolCall.status !== "success") return;
  if (aiProposalEditCount(toolCall.proposal) === 0) return;

  const marked = await noteAiStore.setToolCallRejected(item.id, toolCall.toolCallId, true);
  if (!marked) {
    toast.error({ title: t("notes.toast.rejectFailed"), description: t("notes.toast.writeStateFailed") });
    return;
  }
  toast.success(t("notes.toast.rejectedSuggestion"));
}

function handleRejectAiToolCallById(item: NoteAiHistoryItem, toolCallId: string) {
  const toolCall = getAiToolCall(item, toolCallId);
  if (!toolCall) return;
  void handleRejectAiToolCall(item, toolCall);
}

async function handleApplyAiToolCallFromModal() {
  const item = aiDiffItem.value;
  const toolCall = aiDiffToolCall.value;
  if (!item || !toolCall) return;
  await handleApplyAiToolCall(item, toolCall);
  if (toolCall.applied) {
    aiDiffModalOpen.value = false;
  }
}

function handleRejectAiToolCallFromModal() {
  const item = aiDiffItem.value;
  const toolCall = aiDiffToolCall.value;
  if (!item || !toolCall) return;
  void (async () => {
    await handleRejectAiToolCall(item, toolCall);
    if (toolCall.rejected) {
      aiDiffModalOpen.value = false;
    }
  })();
}

function getListDisplayName(listId: string | null) {
  if (!listId) return t("notes.lists.inbox");
  return noteLists.value.find((item) => item.id === listId)?.name || t("notes.lists.inbox");
}

function getListDisplayIcon(listId: string | null) {
  if (!listId) return "i-lucide-inbox";
  return noteLists.value.find((item) => item.id === listId)?.icon || DEFAULT_ICON;
}

function getListDisplayColor(listId: string | null) {
  if (!listId) return DEFAULT_COLOR;
  return noteLists.value.find((item) => item.id === listId)?.color || DEFAULT_COLOR;
}

function restoreNoteEditorMode(): NoteEditorMode {
  const raw = getPersistentValue(NOTE_EDITOR_MODE_KEY, "visual");
  return raw === "source" ? "source" : "visual";
}

type NoteOutputFormat = "plain" | "markdown" | "word" | "pdf";

function getActiveNoteTitle() {
  const note = activeNote.value;
  if (!note) throw new Error(t("notes.toast.selectNoteFirst"));
  return (draftTitle.value || note.title || t("notes.note.untitled")).trim() || t("notes.note.untitled");
}

function getActiveNoteContentMd() {
  return String(draftContentMd.value || "");
}

async function handleCopyActiveNote(format: "markdown" | "plain") {
  try {
    const contentMd = getActiveNoteContentMd();
    if (format === "markdown") {
      await contentExport.copyAsMarkdown(contentMd);
    } else {
      await contentExport.copyAsPlainText(contentMd);
    }
  } catch (error) {
    toast.error({ title: t("notes.toast.copyFailed"), description: String(error) });
  }
}

async function handleExportActiveNote(format: NoteOutputFormat) {
  try {
    const title = getActiveNoteTitle();
    const contentMd = getActiveNoteContentMd();
    if (format === "markdown" || format === "plain") {
      await contentExport.exportAsFile(title, contentMd, format);
    } else if (format === "word") {
      await contentExport.exportAsWord(title, contentMd);
    } else if (format === "pdf") {
      await contentExport.exportAsPdf(title, contentMd);
    }
  } catch (error) {
    toast.error({ title: t("notes.toast.exportFailed"), description: String(error) });
  }
}

function getMoveListItems(note: Note) {
  const targets: Array<{ id: string | null; label: string; icon: string; color: string }> = [
    { id: null, label: t("notes.lists.inbox"), icon: "i-lucide-inbox", color: DEFAULT_COLOR },
    ...noteLists.value.map((list) => ({
      id: list.id,
      label: list.name,
      icon: list.icon || DEFAULT_ICON,
      color: list.color || DEFAULT_COLOR,
    })),
  ];

  return targets.map((target) => ({
    label: target.label,
    icon: target.icon,
    slot: "note-list",
    listColor: target.color,
    type: "checkbox" as const,
    checked: target.id === note.listId,
    onUpdateChecked: (checked: boolean) => {
      if (!checked) return;
      void handleMoveNote(note.id, target.id);
    },
  }));
}

function getCurrentFilter(): { scope: NoteScope; listId?: string } {
  if (selectedListKey.value === LIST_KEY_INBOX) {
    return { scope: "inbox" };
  }

  if (selectedListKey.value !== LIST_KEY_ALL) {
    return { scope: "list", listId: selectedListKey.value };
  }

  return { scope: "all" };
}

function noteInCurrentFilter(note: Note) {
  if (selectedListKey.value === LIST_KEY_ALL) return true;
  if (selectedListKey.value === LIST_KEY_INBOX) return note.listId == null;
  return note.listId === selectedListKey.value;
}

function ensureSelectedListStillValid() {
  if (selectedListKey.value === LIST_KEY_ALL || selectedListKey.value === LIST_KEY_INBOX) return;
  if (!noteLists.value.some((item) => item.id === selectedListKey.value)) {
    selectedListKey.value = LIST_KEY_ALL;
  }
}

async function refreshStats() {
  const all = await window.ipc("notes:list", { scope: "all" });
  const byList: Record<string, number> = {};
  let inbox = 0;

  for (const item of all as Note[]) {
    if (!item.listId) {
      inbox += 1;
      continue;
    }
    byList[item.listId] = (byList[item.listId] || 0) + 1;
  }

  stats.value = {
    all: all.length,
    inbox,
    byList,
  };
}

async function refreshNotes(options?: { keepSelection?: boolean }) {
  const previousSelected = selectedNoteId.value;
  await Promise.all([loadNotes(getCurrentFilter()), refreshStats(), refreshLinkedNoteIds()]);

  if (options?.keepSelection !== false && previousSelected) {
    selectedNoteId.value = previousSelected;
    return;
  }

  selectedNoteId.value = notes.value[0]?.id || null;
}

async function refreshLinkedNoteIds() {
  const pairs = await window.ipc("sessions:getLinkedNoteIds");
  const map = new Map<string, string>();
  for (const p of pairs) map.set(p.noteId, p.sessionId);
  linkedNoteSessionMap.value = map;
}

function syncDraftFromActiveNote(note: Note | null) {
  draftTitle.value = note?.title || "";
  draftContentMd.value = note?.contentMd || "";
}

let activeNoteSyncToken = 0;
async function syncActiveNoteBySelection(noteId: string | null) {
  const syncToken = ++activeNoteSyncToken;

  if (!noteId) {
    activeNote.value = null;
    syncDraftFromActiveNote(null);
    return;
  }

  const fromVisibleList = notes.value.find((item) => item.id === noteId) || null;
  if (fromVisibleList) {
    activeNote.value = fromVisibleList;
    syncDraftFromActiveNote(fromVisibleList);
  }

  let fromStore: Note | undefined;
  try {
    fromStore = await getNote(noteId);
  } catch {
    fromStore = undefined;
  }
  if (syncToken !== activeNoteSyncToken) return;

  activeNote.value = fromStore || null;

  if (fromStore) {
    syncDraftFromActiveNote(fromStore);
    return;
  }

  if (selectedNoteId.value === noteId) {
    selectedNoteId.value = notes.value[0]?.id || null;
  }
}

const saveDraftDebounced = useDebounceFn(async (noteId: string, title: string, contentMd: string) => {
  const current = (activeNote.value?.id === noteId
    ? activeNote.value
    : notes.value.find((item) => item.id === noteId)) || null;
  const updates: Partial<Pick<Note, "title" | "contentMd">> = {};

  if (!current || title !== current.title) updates.title = title;
  if (!current || contentMd !== current.contentMd) updates.contentMd = contentMd;
  if (Object.keys(updates).length === 0) return;

  isSaving.value = true;
  try {
    const updated = await updateNote(noteId, updates);
    if (noteId === selectedNoteId.value) {
      activeNote.value = updated;
    }
    if (noteId === selectedNoteId.value && !noteInCurrentFilter(updated)) {
      await refreshNotes();
    } else {
      await refreshStats();
    }
  } catch (error) {
    toast.error({ title: t("notes.toast.saveFailed"), description: String(error) });
  } finally {
    isSaving.value = false;
  }
}, 450);

function scheduleSaveForActiveNote() {
  const note = activeNote.value;
  if (!note) return;
  void saveDraftDebounced(note.id, draftTitle.value, draftContentMd.value);
}

function handleSelectList(item: { id: string }) {
  selectedListKey.value = item.id;
}

function handleSelectNote(item: Note) {
  selectedNoteId.value = item.id;
}

function openCreateListModal() {
  isEditingList.value = false;
  editingListId.value = null;
  listForm.value = { name: "", icon: DEFAULT_ICON, color: DEFAULT_COLOR };
  listModalOpen.value = true;
}

function openEditListModal(list: NoteList) {
  isEditingList.value = true;
  editingListId.value = list.id;
  listForm.value = { name: list.name, icon: list.icon || DEFAULT_ICON, color: list.color || DEFAULT_COLOR };
  listModalOpen.value = true;
}

async function handleSubmitListModal() {
  const name = listForm.value.name.trim();
  if (!name) return;

  try {
    if (isEditingList.value && editingListId.value) {
      await updateNoteList(editingListId.value, {
        name,
        icon: listForm.value.icon,
        color: listForm.value.color,
      });
    } else {
      await createNoteList({
        name,
        icon: listForm.value.icon,
        color: listForm.value.color,
      });
    }

    await loadNoteLists();
    listModalOpen.value = false;
    await refreshStats();
  } catch (error) {
    toast.error({ title: t("notes.toast.saveListFailed"), description: String(error) });
  }
}

async function handleDeleteList(list: NoteList) {
  const confirmed = await confirm({
    title: t("notes.confirm.deleteTitle"),
    content: t("notes.confirm.deleteListContent", { name: list.name }),
    confirmText: t("notes.menu.delete"),
    cancelText: t("notes.modal.cancel"),
    confirmColor: "error",
    confirmIcon: "i-lucide-trash-2",
  });

  if (!confirmed) return;

  try {
    await deleteNoteList(list.id);
    await loadNoteLists();
    ensureSelectedListStillValid();
    await refreshNotes();
  } catch (error) {
    toast.error({ title: t("notes.toast.deleteListFailed"), description: String(error) });
  }
}

async function handleCreateNote() {
  try {
    const listId = selectedListKey.value === LIST_KEY_ALL || selectedListKey.value === LIST_KEY_INBOX
      ? null
      : selectedListKey.value;

    const created = await createNote({ listId });

    if (!noteInCurrentFilter(created)) {
      await refreshNotes();
      return;
    }

    selectedNoteId.value = created.id;
    await refreshStats();
  } catch (error) {
    toast.error({ title: t("notes.toast.createNoteFailed"), description: String(error) });
  }
}

function handleStartInlineEditNoteTitle(note: Note) {
  editingNoteId.value = note.id;
  editingNoteTitle.value = note.title || "";
  openNoteMenuId.value = null;
}

async function handleSaveInlineNoteTitle(noteId: string) {
  if (editingNoteId.value !== noteId) return;

  const title = editingNoteTitle.value.trim();
  const current = notes.value.find((item) => item.id === noteId);
  if (!current) {
    editingNoteId.value = null;
    editingNoteTitle.value = "";
    return;
  }

  if (!title || title === current.title) {
    editingNoteId.value = null;
    editingNoteTitle.value = "";
    return;
  }

  try {
    await updateNote(noteId, { title });
    await refreshStats();
    toast.success(t("notes.toast.titleUpdated"));
  } catch (error) {
    toast.error({ title: t("notes.toast.updateTitleFailed"), description: String(error) });
  } finally {
    editingNoteId.value = null;
    editingNoteTitle.value = "";
  }
}

function handleCancelInlineNoteTitle() {
  editingNoteId.value = null;
  editingNoteTitle.value = "";
}

function handleStartDetailTitleEdit() {
  if (!activeNote.value) return;
  isEditingDetailTitle.value = true;
  nextTick(() => {
    const inputElement = detailTitleInputRef.value?.inputRef as HTMLInputElement | undefined;
    if (inputElement) inputElement.select();
  });
}

function handleSaveDetailTitleEdit() {
  if (!activeNote.value) {
    isEditingDetailTitle.value = false;
    return;
  }

  if (!draftTitle.value.trim()) {
    draftTitle.value = activeNote.value.title || "";
  }

  isEditingDetailTitle.value = false;
}

function handleCancelDetailTitleEdit() {
  if (activeNote.value) {
    draftTitle.value = activeNote.value.title || "";
  }
  isEditingDetailTitle.value = false;
}

async function handleMoveNote(noteId: string, targetListId: string | null) {
  const note = (activeNote.value?.id === noteId
    ? activeNote.value
    : notes.value.find((item) => item.id === noteId)) || null;
  if (!note) return;
  if (note.listId === targetListId) return;

  try {
    const updated = await updateNote(noteId, { listId: targetListId });
    if (noteId === selectedNoteId.value) {
      activeNote.value = updated;
    }
    await refreshStats();

    if (!noteInCurrentFilter(updated)) {
      await refreshNotes();
    }

    toast.success(t("notes.toast.movedToList", { name: getListDisplayName(targetListId) }));
  } catch (error) {
    toast.error({ title: t("notes.toast.moveFailed"), description: String(error) });
  } finally {
    openNoteMenuId.value = null;
  }
}

async function handleDeleteNote(note: Note) {
  const confirmed = await confirm({
    title: t("notes.confirm.deleteTitle"),
    content: t("notes.confirm.deleteNoteContent", { name: note.title || t("notes.note.untitled") }),
    confirmText: t("notes.menu.delete"),
    cancelText: t("notes.modal.cancel"),
    confirmColor: "error",
    confirmIcon: "i-lucide-trash-2",
  });

  if (!confirmed) return;

  try {
    await deleteNote(note.id);
    if (selectedNoteId.value === note.id) {
      selectedNoteId.value = notes.value[0]?.id || null;
    }
    await refreshStats();
  } catch (error) {
    toast.error({ title: t("notes.toast.deleteNoteFailed"), description: String(error) });
  }
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error(t("notes.toast.readImageFailed")));
    };
    reader.onerror = () => {
      reject(reader.error || new Error(t("notes.toast.readImageFailed")));
    };
    reader.readAsDataURL(file);
  });
}

async function handleEditorImageUpload(file: File) {
  const note = activeNote.value;
  if (!note) {
    throw new Error(t("notes.toast.selectNoteFirst"));
  }
  if (isAttachingAsset.value) {
    throw new Error(t("notes.toast.imageUploading"));
  }

  isAttachingAsset.value = true;
  try {
    const src = await readFileAsDataUrl(file);
    const attached = await attachAssetToNote({
      noteId: note.id,
      src,
      mediaType: file.type || undefined,
      name: file.name,
    });

    return {
      src: attached.url,
      alt: (attached.name || file.name || "image").replace(/[\r\n]/g, " "),
    };
  } catch (error) {
    toast.error({ title: t("notes.toast.insertImageFailed"), description: String(error) });
    throw error;
  } finally {
    isAttachingAsset.value = false;
  }
}

watch(selectedNoteId, (noteId) => {
  const currentRouteNoteId = route.params.noteId as string | undefined;
  if (noteId && noteId !== currentRouteNoteId) {
    router.replace({ name: "notes-detail", params: { noteId } });
  } else if (!noteId && currentRouteNoteId) {
    router.replace({ name: "notes" });
  }
});

watch(selectedListKey, () => {
  void refreshNotes({ keepSelection: true });
});

watch(editorMode, (mode) => {
  setPersistentValueSoon(NOTE_EDITOR_MODE_KEY, mode);
  if (mode !== "visual") {
    pageFindOpen.value = false;
  }
});

watch(
  aiSelection,
  (selection) => {
    if (!selection && aiContextMode.value === "selection-nearby") {
      aiContextMode.value = "full";
    }
  },
  { immediate: true }
);

watch(aiDiffModalOpen, (open) => {
  if (!open) {
    aiDiffTarget.value = null;
  }
});

watch(aiHistoryScrollSignature, () => {
  void nextTick().then(() => {
    scrollAiHistoryToBottomIfNeeded();
  });
});

watch(showAiSidebar, (open) => {
  if (!open) return;
  void nextTick().then(() => {
    scrollAiHistoryToBottom();
  });
});

watch(aiPromptInput, (val) => {
  const sessionId = activeAiSessionId.value;
  if (sessionId) {
    saveAiDraftDebounced(sessionId, val);
  }
});

watch(activeAiSessionId, (newId, oldId) => {
  if (oldId && oldId !== newId) {
    saveAiDraftImmediate(oldId, aiPromptInput.value);
    saveAiSelectionDraft(oldId, aiSelection.value);
  }
  aiPromptInput.value = newId ? loadAiDraft(newId) : "";
  aiSelection.value = newId ? loadAiSelectionDraft(newId) : null;
});

watch(aiSelection, (val) => {
  const sessionId = activeAiSessionId.value;
  if (sessionId) {
    saveAiSelectionDraft(sessionId, val);
  }
});

watch(aiContextMode, (mode) => {
  const sessionId = activeAiSessionId.value;
  if (sessionId) {
    void window.ipc("notes:aiUpdateSessionContextMode", { sessionId, contextMode: mode });
  }
});

watch(noteAiModel, (model) => {
  const sessionId = activeAiSessionId.value;
  if (sessionId) {
    void window.ipc("notes:aiUpdateSessionModel", { sessionId, model });
  }
});

watch(
  selectedNoteId,
  (noteId) => {
    isEditingDetailTitle.value = false;
    void (async () => {
      try {
        await syncActiveNoteBySelection(noteId);
        if (!noteId) return;
        await noteAiStore.loadHistory(noteId);
        noteAiModel.value = noteAiStore.getSessionModel(noteId) || NOTE_AI_DEFAULT_MODEL;
        aiContextMode.value = (noteAiStore.getSessionContextMode(noteId) || "full") as NoteAiContextMode;
        await nextTick();
        scrollAiHistoryToBottom();
      } catch {
        // ignore history refresh failures
      }
    })();
  },
  { immediate: true }
);

watch(
  () => route.params.noteId,
  (noteId) => {
    if (typeof noteId !== "string") return;
    if (noteId === selectedNoteId.value) return;
    selectedNoteId.value = noteId;
    pageFindOpen.value = false;
  }
);

watch(
  () => route.name,
  (name) => {
    if (name !== "notes" && name !== "notes-detail") {
      pageFindOpen.value = false;
    }
  }
);

watch(selectedNoteId, () => {
  pageFindOpen.value = false;
});

watch([draftTitle, draftContentMd], () => {
  scheduleSaveForActiveNote();
});

onMounted(async () => {
  window.addEventListener("keydown", handleFindShortcut, true);
  try {
    const mode = await window.ipc("settings:getSendShortcut");
    aiSendShortcutMode.value = mode === "cmd-enter" ? "cmd-enter" : "enter";

    const paramNoteId = route.params.noteId as string | undefined;
    if (paramNoteId) {
      selectedNoteId.value = paramNoteId;
    }

    await loadNoteLists();
    ensureSelectedListStillValid();
    await refreshNotes();
  } catch (error) {
    toast.error({ title: t("notes.toast.loadNotesFailed"), description: String(error) });
  }
});

onUnmounted(() => {
  window.removeEventListener("keydown", handleFindShortcut, true);
  if (aiSmartScrollTimeoutId) {
    clearTimeout(aiSmartScrollTimeoutId);
    aiSmartScrollTimeoutId = null;
  }
});

</script>
